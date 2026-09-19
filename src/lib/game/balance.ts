import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { BALANCE_VERSION } from './rules';
import { BOTS } from './content/names';
import { xpToNextLevel } from './content/world';

// =====================================================================
// POLÍTICA DE ATUALIZAÇÕES E BALANCEAMENTO (v0.5+, reforçada na v0.6)
// ---------------------------------------------------------------------
// Regra do usuário, implementada no servidor:
//
//   "Quando aplicar alguma atualização nova, não precisa deletar as
//    contas que já existem. Resete os personagens apenas para manter
//    o balanceamento."
//
// Tradução para mecânica:
//  * CONTAS, sessões, nomes, raças, sexo, avatares, guildas, cristais,
//    cosméticos e histórico de conquistas NUNCA são deletados;
//  * quando BALANCE_VERSION aumenta (fórmulas/custos/recompensas
//    mudaram de verdade), cada personagem volta ao estado INICIAL de
//    criação — ninguém fica com stats de duas épocas de balanceamento;
//  * bots (conteúdo PvE) são RECALIBRADOS pela fórmula do seed;
//  * a verificação é idempotente (registro em GameMeta) e barata
//    (uma consulta por processo após a primeira verificação).
//
// Como forçar um reset manual (sem mudar código):
//   bun scripts/reset-progression.ts --confirm
// =====================================================================

const META_KEY = 'balanceVersion';

/** Flag por processo: após a primeira verificação bem-sucedida, não consulta mais. */
let checkedThisProcess = false;

export interface ProgressionResetReport {
  playersReset: number;
  botsRecalibrated: number;
  activitiesCleared: number;
  dedupsCleared: number;
  questsCleared: number;
}

export const CREATION_DEFAULTS = {
  level: 1,
  xp: 0,
  strength: 10,
  defense: 10,
  speed: 10,
  ki: 10,
  hp: 145, // 80 + 15*1 + 10*5 — igual à criação
  energy: 100,
  zeni: 500,
  battlesWon: 0,
  battlesLost: 0,
  pvpWins: 0,
  trainingsDone: 0,
  missionsDone: 0,
  guildDonated: 0,
  dragonBalls: 0,
  items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
  techniques: '[]',
  loadout: '{"1":null,"2":null,"3":null,"S":null}',
  strategy: 'balanced',
  missionId: null,
  missionStartedAt: null,
  missionEndsAt: null,
  missionHours: null,
  missionsCompleted: '[]',
  professions: '{}', // v0.6: progresso de profissões zera no reset de balanceamento
  transformationId: null,
  transformationsOwned: '[]',
  lastZenkaiAt: null,
  zenkaiWindowStart: null,
  zenkaiCount24h: 0,
  lastZenkaiOpponentId: null,
  pveBattleDay: null,
  pveBattleCount: 0,
  // PRESERVADOS (fora deste objeto): id, name, race, avatarUrl,
  // accountId, guildId, isBot, crystals, cosmeticsEquipped, createdAt,
  // stateVersion, activePlayerId da conta.
} as const;

/**
 * Reset de progressão de personagens — NUNCA deleta contas nem personagens.
 * Devolve os jogadores humanos ao estado de criação e recalibra bots pela
 * fórmula do seed. Executa dentro de uma transação fornecida (ou cria uma).
 */
export async function resetCharacterProgression(
  txOrDb: Prisma.TransactionClient | typeof db = db
): Promise<ProgressionResetReport> {
  const now = new Date();
  const report: ProgressionResetReport = {
    playersReset: 0,
    botsRecalibrated: 0,
    activitiesCleared: 0,
    dedupsCleared: 0,
    questsCleared: 0,
  };

  const humans = await txOrDb.player.findMany({ where: { isBot: false }, select: { id: true } });
  for (const p of humans) {
    await txOrDb.player.update({
      where: { id: p.id },
      data: { ...CREATION_DEFAULTS, lastRegen: now, lastRegenHp: now },
    });
    report.playersReset++;
    report.activitiesCleared += await txOrDb.activity
      .deleteMany({ where: { playerId: p.id, completedAt: null } })
      .then((r) => r.count);
    report.dedupsCleared += await txOrDb.requestDedup
      .deleteMany({ where: { playerId: p.id } })
      .then((r) => r.count);
    report.questsCleared += await txOrDb.questProgress
      .deleteMany({ where: { playerId: p.id } })
      .then((r) => r.count);
    await txOrDb.inventoryStack.deleteMany({ where: { playerId: p.id } });
  }

  // bots: recalibra level/stats/zeni pela MESMA fórmula do ensureSeed
  // (nomes e raças preservados; bots customizados fora da lista não mudam)
  const bots = await txOrDb.player.findMany({ where: { isBot: true }, select: { id: true, name: true } });
  for (const bot of bots) {
    const def = BOTS.find((b) => b.name === bot.name);
    if (!def) continue;
    await txOrDb.player.update({
      where: { id: bot.id },
      data: {
        level: def.level,
        xp: Math.floor(xpToNextLevel(def.level) * 0.4),
        zeni: 200 * def.level,
        hp: 80 + def.level * 15 + Math.floor((8 + def.level * 3.2) * 5),
        strength: Math.floor(8 + def.level * 4.5),
        defense: Math.floor(8 + def.level * 3.2),
        speed: Math.floor(8 + def.level * 3.4),
        ki: Math.floor(8 + def.level * 3.0),
      },
    });
    report.botsRecalibrated++;
  }

  return report;
}

/**
 * Garante que o banco está na versão de balanceamento do código.
 *
 *  * sem registro (banco antigo / primeira execução): REGISTRA a versão
 *    atual sem resetar — os personagens existentes já progrediram sob o
 *    balanceamento vigente;
 *  * registro ANTIGO (< BALANCE_VERSION): atualiza apenas o marcador. Deploy
 *    nunca reseta progressão, independentemente da versão do balanceamento.
 *
 * Nunca lança (falhas são logadas e retratadas na próxima verificação).
 */
export async function ensureBalanceVersion(): Promise<void> {
  if (checkedThisProcess) return;
  try {
    const row = await db.gameMeta.findUnique({ where: { key: META_KEY } });
    const stored = row ? Number(row.value) : NaN;
    if (Number.isFinite(stored) && stored >= BALANCE_VERSION) {
      checkedThisProcess = true;
      return;
    }

    await db.$transaction(
      async (tx) => {
        // revalida DENTRO da transação (idempotência entre processos)
        const fresh = await tx.gameMeta.findUnique({ where: { key: META_KEY } });
        const freshVal = fresh ? Number(fresh.value) : NaN;
        if (Number.isFinite(freshVal) && freshVal >= BALANCE_VERSION) return;

        if (!Number.isFinite(freshVal)) {
          // primeira execução: registra SEM resetar (ver cabeçalho)
          await tx.gameMeta.upsert({
            where: { key: META_KEY },
            create: { key: META_KEY, value: String(BALANCE_VERSION) },
            update: { value: String(BALANCE_VERSION) },
          });
          console.log(`[balance] versão ${BALANCE_VERSION} registrada (primeira execução — sem reset)`);
          return;
        }

        await tx.gameMeta.update({
          where: { key: META_KEY },
          data: { value: String(BALANCE_VERSION) },
        });
        console.log(`[balance] versão ${freshVal} → ${BALANCE_VERSION}: marcador atualizado, progresso preservado`);
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
    checkedThisProcess = true;
  } catch (err) {
    // falhou (ex.: lock de banco) → NÃO marca como verificado; tenta de novo
    console.error(
      '[balance] falha ao verificar versão de balanceamento (tentará de novo):',
      err instanceof Error ? err.message : err
    );
  }
}
