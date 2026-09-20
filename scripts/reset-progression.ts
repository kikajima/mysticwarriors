// =====================================================================
// RESET DE PROGRESSÃO DE PERSONAGENS — ferramenta manual do dono do jogo
// ---------------------------------------------------------------------
// Política (diretiva do usuário):
//   "Quando aplicar alguma atualização nova, não precisa deletar as contas
//    que já existem. Resete os personagens apenas para manter o
//    balanceamento."
//
// O que este script faz (usando a MESMA rotina do servidor):
//   * personagens HUMANOS voltam ao estado de criação (nível 1, stats 10,
//     500 Zeni, sem técnicas/transformações/itens/missões);
//   * BOTS são recalibrados pela fórmula do seed (dificuldade PvE);
//   * atividades pendentes, dedup caches e quests são limpos;
//   * o registro de versão de balanceamento (GameMeta) é atualizado.
//
// O que NUNCA é tocado:
//   * CONTAS (Account), sessões, compras e ledger de carteira;
//   * nomes, raças, sexo, avatares, guildas, cristais e cosméticos;
//   * histórico de conquistas (ledger de recompensas).
//
// Uso:
//   bun scripts/reset-progression.ts           → simula (dry-run, não altera)
//   bun scripts/reset-progression.ts --confirm → EXECUTA o reset
//   bun scripts/reset-progression.ts --confirm --set-version 6
//                                              → reset + registra versão 6
// =====================================================================

import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { BOTS } from '../src/lib/game/content/names';
import { xpToNextLevel } from '../src/lib/game/content/world';
import { BALANCE_VERSION } from '../src/lib/game/rules';

const db = new PrismaClient({
  datasources: { db: { url: `file:${join(process.cwd(), 'db/custom.db')}` } },
});

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const setVersionIdx = args.indexOf('--set-version');
const setVersion = setVersionIdx >= 0 ? Number(args[setVersionIdx + 1]) : BALANCE_VERSION;

interface Snapshot {
  total: number;
  humans: number;
  bots: number;
  sample: Array<{ name: string; level: number; str: number }>;
}

async function snapshot(): Promise<Snapshot> {
  const [total, humans, bots, sample] = await Promise.all([
    db.player.count(),
    db.player.count({ where: { isBot: false } }),
    db.player.count({ where: { isBot: true } }),
    db.player.findMany({
      orderBy: { level: 'desc' },
      take: 5,
      select: { name: true, level: true, strength: true },
    }),
  ]);
  return {
    total,
    humans,
    bots,
    sample: sample.map((p) => ({ name: p.name, level: p.level, str: p.strength })),
  };
}

async function main() {
  console.log('=== RESET DE PROGRESSÃO —', confirm ? 'EXECUÇÃO REAL' : 'SIMULAÇÃO (dry-run)', '===');
  const before = await snapshot();
  console.log(`antes: ${before.total} players (${before.humans} humanos, ${before.bots} bots)`);
  for (const s of before.sample) console.log(`  - ${s.name}: nível ${s.level}, força ${s.str}`);

  if (!confirm) {
    console.log('\ndry-run: nada foi alterado. Rode com --confirm para executar o reset.');
    console.log('CONTAS, nomes, avatares, guildas, cristais e cosméticos NÃO são tocados em nenhum modo.');
    return;
  }

  const now = new Date();
  const report = { playersReset: 0, botsRecalibrated: 0, activities: 0, dedups: 0, quests: 0 };

  await db.$transaction(
    async (tx) => {
      const humans = await tx.player.findMany({ where: { isBot: false }, select: { id: true } });
      for (const p of humans) {
        await tx.player.update({
          where: { id: p.id },
          data: {
            level: 1,
            xp: 0,
            strength: 10,
            defense: 10,
            speed: 10,
            ki: 10,
            hp: 145,
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
            missionEndsAt: null,
            missionsCompleted: '[]',
            transformationId: null,
            transformationsOwned: '[]',
            lastZenkaiAt: null,
            zenkaiWindowStart: null,
            zenkaiCount24h: 0,
            lastZenkaiOpponentId: null,
            pveBattleDay: null,
            pveBattleCount: 0,
            lastRegen: now,
            lastRegenHp: now,
          },
        });
        report.playersReset++;
        report.activities += await tx.activity.deleteMany({ where: { playerId: p.id, completedAt: null } }).then((r) => r.count);
        report.dedups += await tx.requestDedup.deleteMany({ where: { playerId: p.id } }).then((r) => r.count);
        report.quests += await tx.questProgress.deleteMany({ where: { playerId: p.id } }).then((r) => r.count);
        await tx.playerNotification.deleteMany({ where: { playerId: p.id } });
        await tx.dragonBallPossession.updateMany({
          where: { playerId: p.id },
          data: { playerId: null, acquiredAt: now },
        });
      }

      const bots = await tx.player.findMany({ where: { isBot: true }, select: { id: true, name: true } });
      for (const bot of bots) {
        const def = BOTS.find((b) => b.name === bot.name);
        if (!def) continue;
        await tx.player.update({
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

      // registra a versão informada (default: BALANCE_VERSION do código)
      if (Number.isFinite(setVersion)) {
        await tx.gameMeta.upsert({
          where: { key: 'balanceVersion' },
          create: { key: 'balanceVersion', value: String(setVersion) },
          update: { value: String(setVersion) },
        });
      }
    },
    { timeout: 60_000, maxWait: 15_000 }
  );

  const after = await snapshot();
  console.log(`\nreset concluído: ${report.playersReset} personagens, ${report.botsRecalibrated} bots recalibrados`);
  console.log(`limpezas: ${report.activities} atividades, ${report.dedups} dedups, ${report.quests} quests`);
  console.log(`depois: ${after.total} players (${after.humans} humanos, ${after.bots} bots) — contas intactas`);
  for (const s of after.sample) console.log(`  - ${s.name}: nível ${s.level}, força ${s.str}`);
  if (Number.isFinite(setVersion)) console.log(`GameMeta.balanceVersion = ${setVersion}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
