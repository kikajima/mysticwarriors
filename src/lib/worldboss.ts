import { guildBonuses } from './game/guildRules';
import type { Prisma, Player } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import {
  buildPlayerCombatant,
  computeDerived,
  battleRng,
  chooseAttackAction,
  strikeDamageVsStatic,
  COMBAT,
  type StaticDefender,
} from './game/engine';
import { getStrategy } from './game/content/techniques';
import { scaleCombatRules, aberturaChance, SCALE_COMBAT } from './game/powerScale';
import { IMPETO, IMPETO_COMBO_THRESHOLD, clampImpeto } from './game/impeto';
import { grantRewards } from '@/lib/economy';
import { trackEvent } from '@/lib/analytics';
import type { WorldBossView } from './game/types';
import { UNIVERSAL_THREAT, universalThreatWindowEnd } from './game/universalThreat';
export { isUniversalThreatWeekend } from './game/universalThreat';

// =====================================================================
// Ameaça Universal — Ameaça Universal com HP global compartilhado
// ---------------------------------------------------------------------
// CONCORRÊNCIA (à prova de lost update):
//  * Dano aplicado com DECREMENTO atômico (nunca "lê → calcula → grava");
//  * HP nunca fica negativo (clamp condicional);
//  * Cooldown por jogador reivindicado via updateMany condicional em
//    lastAttackedAt — duas requisições simultâneas do MESMO jogador não
//    burlam o cooldown;
//  * Energia debitada condicionalmente (nunca negativa);
//  * Golpe final detectado por updateMany condicional (status=active +
//    currentHp<=0): a morte acontece exatamente UMA vez e a distribuição
//    de recompensas roda exatamente UMA vez;
//  * ensureActiveBoss com ID determinístico: criações concorrentes
//    colidem no PK e apenas uma vence (compatível com PostgreSQL).
// EXCEÇÃO DE MISSÃO: atacar o boss é SEMPRE permitido, mesmo com
// missão ativa (a validação de missão simplesmente não é chamada aqui).
// =====================================================================

/** Duração de cada chefe — EXPORTADO para o teste de contrato da wiki. */
export const BOSS_DURATION_HOURS = UNIVERSAL_THREAT.weekendHours;

/**
 * FONTE ÚNICA da cadência de ataques ao Ameaça Universal (v0.9.11 — correção
 * da regressão que voltou a 60s). Valor de projeto: 10 SEGUNDOS.
 * Tudo deriva DAQUI: a validação do servidor (elapsed < cooldown), o
 * canAttackAt da view e o rate limit da rota de ação
 * (bossAttacksPerWindow). O cliente NÃO tem constante própria — apenas
 * consulta o canAttackAt que o servidor envia.
 */
export const ATTACK_COOLDOWN_SEC = 10;

/**
 * Limite de ataques por janela deslizante, DERIVADO do cooldown (nunca
 * um número solto que possa divergir de novo): a cadência legítima máxima
 * é 1 ataque por ATTACK_COOLDOWN_SEC; +1 de folga para corridas de borda
 * (clique no limite do contador rejeitado pelo próprio cooldown).
 */
export function bossAttacksPerWindow(windowMs: number): number {
  return Math.max(2, Math.ceil(windowMs / (ATTACK_COOLDOWN_SEC * 1000)) + 1);
}

/**
 * Custo de energia por ataque ao chefe — v0.9.24 (B2): o número VIVE em
 * rules.ts (BOSS_ATTACK_ENERGY_COST, fonte central importável pelo
 * cliente); re-exportado aqui para compatibilidade (teste de contrato
 * da wiki importa deste módulo). Import + const local: um `export {}`
 * puro NÃO vincula o nome no próprio arquivo (usos internos quebravam).
 */
import { BOSS_ATTACK_ENERGY_COST } from './game/rules';
export const ATTACK_ENERGY_COST = BOSS_ATTACK_ENERGY_COST;

/** Dano mínimo acumulado para receber recompensa de participação — EXPORTADO idem. */
export const MIN_PARTICIPATION_DAMAGE = 500;

const INVOKED_UNTIL_KEY = 'universalThreatInvokedUntil';

async function threatEndsAt(tx: Prisma.TransactionClient | typeof db, now = new Date()): Promise<Date | null> {
  const invoked = await tx.gameMeta.findUnique({ where: { key: INVOKED_UNTIL_KEY } });
  return universalThreatWindowEnd(now, invoked?.value);
}

export async function universalThreatIsAvailable(tx: Prisma.TransactionClient | typeof db = db): Promise<boolean> {
  return (await threatEndsAt(tx)) !== null;
}

export async function invokeUniversalThreat(client: typeof db = db): Promise<void> {
  const until = new Date(Date.now() + UNIVERSAL_THREAT.invocationHours * 60 * 60 * 1000).toISOString();
  await client.$transaction(async (tx) => {
    await tx.gameMeta.upsert({
      where: { key: INVOKED_UNTIL_KEY },
      update: { value: until },
      create: { key: INVOKED_UNTIL_KEY, value: until },
    });
    // Invocar inicia outro encontro. O histórico anterior fica arquivado,
    // com seu próprio dano, participantes e cooldowns.
    await tx.worldBoss.updateMany({ where: { status: 'active' }, data: { status: 'expired' } });
    // ID novo também impede que um backup de outra invocação seja aplicado.
    await ensureActiveBoss(tx, `boss_${randomUUID()}`);
  });
}

interface BossSeed {
  name: string;
  emoji: string;
  description: string;
  level: number;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
  hp: number;
}

// Nomes ORIGINAIS (conteúdo novo da v0.3 evita nomes da franquia).
// v0.4: HP recalibrado para o pipeline real de dano (técnicas + soft cap
// elevam o dano por ataque; o boss ATIVO no banco mantém o HP original — preservação).
const BOSS_POOL: BossSeed[] = [
  {
    name: `${UNIVERSAL_THREAT.name}, ${UNIVERSAL_THREAT.title}`,
    emoji: '🪲',
    description: 'Uma aberração biocósmica que consumiu mil planetas. O universo pede socorro!',
    level: 40,
    strength: 420,
    defense: 320,
    speed: 280,
    ki: 380,
    hp: 1_200_000,
  },
];

/**
 * Garante um boss ativo (cria novo se expirou/morreu). Idempotente e
 * seguro sob concorrência: o ID é determinístico (`boss_<n>`), então duas
 * transações paralelas que tentem criar o mesmo slot colidem no PK —
 * apenas a primeira vence e a segunda apenas retorna.
 */
export async function ensureActiveBoss(tx: Prisma.TransactionClient, newEncounterId?: string): Promise<void> {
  const now = new Date();
  const endsAt = await threatEndsAt(tx, now);

  // expira bosses cuja janela terminou
  await tx.worldBoss.updateMany({
    where: { status: 'active', ...(!endsAt ? {} : { endsAt: { lte: now } }) },
    data: { status: 'expired' },
  });
  if (!endsAt) return;

  const active = await tx.worldBoss.findFirst({ where: { status: 'active' } });
  if (active) {
    // Normalize legacy encounters without resetting HP or contributions.
    const seed = BOSS_POOL[0];
    if (active.name !== seed.name || active.endsAt.getTime() !== endsAt.getTime()) {
      await tx.worldBoss.update({ where: { id: active.id }, data: { name: seed.name, emoji: seed.emoji, description: seed.description, endsAt } });
    }
    return;
  }

  const total = await tx.worldBoss.count();
  const seed = BOSS_POOL[total % BOSS_POOL.length];

  // tenta criar com ID determinístico; colisão = outra transação criou antes
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newEncounterId ?? `boss_${total + 1 + attempt}`;
    try {
      await tx.worldBoss.create({
        data: {
          id,
          name: seed.name,
          emoji: seed.emoji,
          description: seed.description,
          level: seed.level,
          strength: seed.strength,
          defense: seed.defense,
          speed: seed.speed,
          ki: seed.ki,
          maxHp: seed.hp,
          currentHp: seed.hp,
          startsAt: now,
          endsAt,
          status: 'active',
          zeniReward: 2000,
          xpReward: 800,
          crystalReward: 2,
        },
      });
      return;
    } catch (error) {
      // Uma invocação explícita precisa falhar atomicamente se não criar
      // seu novo encontro, sem confirmar apenas a expiração do anterior.
      if (newEncounterId) throw error;
      // PK ocupado — outra transação concorrente criou este slot.
      const retry = await tx.worldBoss.findFirst({ where: { status: 'active' } });
      if (retry) return;
      // slot ocupado por boss antigo: tenta o próximo número
    }
  }
}

/** View do boss atual para o jogador. */
export async function getBossView(playerId: string | null): Promise<WorldBossView | null> {
  return db.$transaction(
    async (tx) => {
      if (!(await universalThreatIsAvailable(tx))) return null;
      await ensureActiveBoss(tx);
      const boss = await tx.worldBoss.findFirst({
        where: { status: 'active' },
        include: { damages: { orderBy: { damage: 'desc' }, take: 10, include: { player: { select: { name: true } } } } },
      });
      if (!boss) return null;

      const totalAttackers = await tx.worldBossDamage.count({ where: { bossId: boss.id } });
      const mine = playerId
        ? await tx.worldBossDamage.findUnique({
            where: { bossId_playerId: { bossId: boss.id, playerId } },
          })
        : null;
      const myPosition = mine
        ? (await tx.worldBossDamage.count({ where: { bossId: boss.id, damage: { gt: mine.damage } } })) + 1
        : null;

      return {
        id: boss.id,
        name: boss.name,
        emoji: boss.emoji,
        description: boss.description,
        maxHp: boss.maxHp,
        currentHp: Math.max(0, boss.currentHp),
        endsAt: boss.endsAt.toISOString(),
        status: boss.status,
        level: boss.level,
        power: UNIVERSAL_THREAT.power,
        zeniReward: boss.zeniReward,
        xpReward: boss.xpReward,
        crystalReward: boss.crystalReward,
        myDamage: mine?.damage ?? 0,
        myPosition,
        topDamage: boss.damages.map((d) => ({ name: d.player.name, damage: d.damage, isMe: d.playerId === playerId })),
        totalAttackers,
        canAttackAt: mine ? new Date(mine.lastAttackedAt.getTime() + ATTACK_COOLDOWN_SEC * 1000).toISOString() : null,
      };
    },
    { timeout: 60_000, maxWait: 30_000 }
  );
}

export interface BossAttackResult {
  damage: number;
  xpGain: number;
  killed: boolean;
  cooldownSec: number;
  /** v0.9.12 — narrativa da Armadura de Escala (regras 5.1/5.3) no
   * ataque (ex.: aberturas conquistadas, golpe esmagado). */
  note?: string;
}

/**
 * Ataca o Ameaça Universal. ATÔMICO contra condições de corrida:
 *  1. cooldown reivindicado condicionalmente no registro do jogador —
 *     ANTES de qualquer débito (clique durante o cooldown tem efeito
 *     NULO de ponta a ponta: nem energia é tocada, nem dano calculado,
 *     nenhum total se mexe);
 *  2. energia debitada condicionalmente (nunca negativa);
 *  3. dano aplicado com decremento (sem lost update) + clamp em 0;
 *  4. golpe final via updateMany condicional — só um request distribui
 *     as recompensas de morte (exatamente uma vez).
 *
 * OBS: atacar o Ameaça Universal é permitido MESMO com missão ativa
 * (exceção explícita das regras de missão).
 */
export async function attackWorldBoss(
  tx: Prisma.TransactionClient,
  player: Player
): Promise<BossAttackResult> {
  if (!(await universalThreatIsAvailable(tx))) {
    throw new ApiError('BOSS_NOT_ACTIVE', 'A Ameaça Universal está disponível apenas aos finais de semana.');
  }
  await ensureActiveBoss(tx);
  const boss = await tx.worldBoss.findFirst({ where: { status: 'active' } });
  if (!boss) throw new ApiError('BOSS_NOT_ACTIVE', 'Nenhuma ameaça universal ativa agora.');

  // vida mínima para lutar
  const derived = computeDerived(player);
  const minHp = Math.max(20, Math.floor(derived.maxHp * 0.3));
  if (player.hp < minHp) {
    throw new ApiError('INSUFFICIENT_HP', `Você precisa de pelo menos ${minHp} de vida para enfrentar ${boss.name}.`);
  }

  const now = new Date();

  // ===== cooldown por jogador: reivindica o direito de atacar =====
  // (v0.9.11 — verificado ANTES do débito de energia: um clique durante
  // o cooldown não move NADA — nem carteira, nem dano, nem totais)
  const existing = await tx.worldBossDamage.findUnique({
    where: { bossId_playerId: { bossId: boss.id, playerId: player.id } },
  });
  if (existing) {
    const elapsed = (now.getTime() - existing.lastAttackedAt.getTime()) / 1000;
    if (elapsed < ATTACK_COOLDOWN_SEC) {
      throw new ApiError('BOSS_COOLDOWN', `Recarregando energia... aguarde ${Math.ceil(ATTACK_COOLDOWN_SEC - elapsed)}s para atacar de novo.`);
    }
    // atualização CONDICIONAL: só passa se lastAttackedAt não mudou desde a
    // leitura — duas requisições simultâneas não burlam o cooldown
    const claim = await tx.worldBossDamage.updateMany({
      where: { id: existing.id, lastAttackedAt: existing.lastAttackedAt },
      data: { lastAttackedAt: now },
    });
    if (claim.count === 0) {
      throw new ApiError('BOSS_COOLDOWN', 'Recarregando energia... aguarde para atacar de novo.');
    }
  }

  // ===== energia: debitada de forma CONDICIONAL (nunca negativa) =====
  const energyRes = await tx.player.updateMany({
    where: { id: player.id, energy: { gte: ATTACK_ENERGY_COST } },
    data: { energy: { decrement: ATTACK_ENERGY_COST } },
  });
  if (energyRes.count === 0) {
    throw new ApiError('INSUFFICIENT_ENERGY', `Cada ataque custa ${ATTACK_ENERGY_COST} de energia.`);
  }
  player.energy -= ATTACK_ENERGY_COST;

  // ===== cálculo do dano (100% server-side, rng próprio) =====
  // v0.4: usa o MESMO PIPELINE do combate comum — estratégia, loadout de
  // técnicas, bônus raciais, perfuração e soft cap de mitigação. As
  // especializações têm efeito real neste modo.
  const rng = battleRng();
  const rand = (min: number, max: number) => min + rng() * (max - min);
  const combatant = buildPlayerCombatant(player);
  const bossDefender: StaticDefender = {
    defPower: Math.round(boss.defense * 1.8),
    resPower: Math.round(boss.defense * 1.1 + boss.ki * 0.9),
    strategy: getStrategy('defensive'), // o chefe é um colosso defensivo
  };
  // v0.9.12 — ARMADURA DE ESCALA (regras 5.1/5.3) contra o chefe: o poder
  // dele é calculado pela MESMA fórmula de scouter (npcCombatPower). O
  // azarão 4+ escalas abaixo tem golpes ESMAGADOS, mas críticos geram
  // ABERTURAS (×1.75) e 3 delas dão a uma TÉCNICA o tratamento de
  // diferença 3 ("quebra de barreira") — mesma tradução do duelo.
  const bossPower = UNIVERSAL_THREAT.power;
  const scale = scaleCombatRules(combatant.power, bossPower);
  let aberturas = 0;
  let aberturaHits = 0;
  let breakthrough = false;
  // v0.9.13 — ÍMPETO (Cap. 7) no pipeline do chefe: o guerreiro começa
  // com 1 (+1 pelo Espírito de Superação se estiver ≥1 escala abaixo);
  // Aberturas geram Ímpeto e 1 Ímpeto estende o combo (outro golpe com
  // força decrescente) — a economia dramática do azarão vs. o colosso.
  let impeto: number = IMPETO.start;
  if (scale.diff >= 1) impeto = clampImpeto(impeto + 1);
  let combosEncadeados = 0;
  const comboThreshold = Math.max(
    IMPETO_COMBO_THRESHOLD[combatant.strategy.id] ?? 2,
    IMPETO.comboCost
  );
  // média de 8 golpes simulados contra o boss (regen de Ki como em batalha)
  let total = 0;
  const hits = 8;
  for (let i = 0; i < hits; i++) {
    combatant.battleKi = Math.min(
      combatant.maxBattleKi,
      combatant.battleKi + Math.round(combatant.maxBattleKi * COMBAT.kiRegenPerRound)
    );
    const action = chooseAttackAction(combatant, rng, i);
    if (action.kind === 'technique' && action.tech) combatant.battleKi -= action.tech.kiCost;
    else if (action.kind === 'energy') combatant.battleKi -= 10;
    let hitDamage = strikeDamageVsStatic(combatant, bossDefender, action, rand);
    if (scale.diff !== 0) {
      const isTechnique = action.kind === 'technique';
      if (scale.crushing && isTechnique && aberturas >= SCALE_COMBAT.aberturasNeeded) {
        // 3 aberturas: a técnica trata a diferença como 3 (regra 5.3)
        aberturas -= SCALE_COMBAT.aberturasNeeded;
        hitDamage *= 1 - SCALE_COMBAT.maxDiff * SCALE_COMBAT.armorPerLevel;
        breakthrough = true;
      } else if (scale.crushing) {
        if (rng() < aberturaChance(combatant.speed, boss.speed) + (combatant.guildCritical ?? 0)) {
          hitDamage *= SCALE_COMBAT.aberturaCritMult;
          aberturas += 1;
          aberturaHits += 1;
          impeto = clampImpeto(impeto + 1); // "obter crítico" → +1 Ímpeto
        } else {
          hitDamage *= SCALE_COMBAT.crushingMult;
        }
      } else {
        hitDamage *= scale.damageMult;
      }
    }
    total += hitDamage;
    // ESTENDER COMBO (1 Ímpeto): golpe extra imediato com decaimento —
    // mesma tradução do duelo (Cap. 7: "Realize outro ataque imediato").
    let comboHits = 0;
    while (
      impeto >= comboThreshold &&
      comboHits < IMPETO.comboMaxAttacks - 1
    ) {
      impeto -= IMPETO.comboCost;
      comboHits++;
      combosEncadeados++;
      const comboAction = chooseAttackAction(combatant, rng, i);
      if (comboAction.kind === 'technique' && comboAction.tech) combatant.battleKi -= comboAction.tech.kiCost;
      else if (comboAction.kind === 'energy') combatant.battleKi -= 10;
      const extra =
        strikeDamageVsStatic(combatant, bossDefender, comboAction, rand) *
        Math.pow(IMPETO.comboDamageDecay, comboHits);
      total += Math.max(1, extra);
    }
  }
  // escala para HP global de milhões: multiplicador de ameaça universal
  const membership = await tx.player.findUniqueOrThrow({ where: { id: player.id }, select: { guild: { select: { level: true } } } });
  const damage = Math.max(10, Math.round((total / hits) * 60 * guildBonuses(membership.guild?.level).bossDamage));
  const impetoNote =
    combosEncadeados > 0
      ? ` 🔥 Ímpeto: ${combosEncadeados} combo${combosEncadeados === 1 ? '' : 's'} encadeado${combosEncadeados === 1 ? '' : 's'} (Cap. 7).`
      : '';
  const note = scale.crushing
    ? breakthrough
      ? '⚔️ Quebra de barreira! Suas aberturas abriram caminho através da diferença de escala (regra 5.3).' + impetoNote
      : `🛡️ A diferença de escala esmaga seus golpes — ${aberturaHits} abertura${aberturaHits === 1 ? '' : 's'}${aberturaHits > 0 && aberturas >= SCALE_COMBAT.aberturasNeeded ? ' (próxima técnica rompe a barreira!)' : ''}.` + impetoNote
    : scale.armor > 0
      ? `🛡️ Armadura de Escala ${scale.armor} do chefe reduziu seu dano (regra 5.1).` + impetoNote
      : impetoNote || undefined;

  // ===== dano atômico: DECREMENTO (nunca lost update) =====
  // v-auditoria F4: o update é CONDICIONAL em status='active' — se o boss
  // morreu entre a leitura (início desta transação) e AQUI, o decremento
  // casa 0 linhas. Sem esta checagem, o dano era REGISTRADO no ranking e o
  // XP pago mesmo sem ter tocado o HP (linha fantasma: contabilidade do
  // boss divergia do ledger). Agora a transação inteira rola de volta —
  // nem energia é gasta — e o cliente recebe o motivo claro.
  const appliedRes = await tx.worldBoss.updateMany({
    where: { id: boss.id, status: 'active' },
    data: { currentHp: { decrement: damage } },
  });
  if (appliedRes.count === 0) {
    throw new ApiError('BOSS_NOT_ACTIVE', `${boss.name} já foi derrotado por outros guerreiros!`);
  }
  // clamp: HP nunca fica negativo
  await tx.worldBoss.updateMany({
    where: { id: boss.id, currentHp: { lt: 0 } },
    data: { currentHp: 0 },
  });

  // registra/atualiza dano do jogador (increment atômico)
  await tx.worldBossDamage.upsert({
    where: { bossId_playerId: { bossId: boss.id, playerId: player.id } },
    update: { damage: { increment: damage }, attacks: { increment: 1 }, lastAttackedAt: now },
    create: { bossId: boss.id, playerId: player.id, damage, attacks: 1, lastAttackedAt: now },
  });

  // gasta vida (batalha desgastante, mas não letal)
  const hpAfter = Math.max(1, player.hp - Math.floor(player.hp * 0.15));
  await tx.player.update({
    where: { id: player.id },
    data: { hp: hpAfter },
  });
  player.hp = hpAfter;

  // XP proporcional ao dano
  const xpGain = Math.max(20, Math.round(damage / 200));
  const xpReward = await grantRewards(tx, player, { xp: xpGain }, { type: 'reward', source: 'world_boss', accountId: player.accountId });

  await trackEvent('world_boss_attack', {
    playerId: player.id,
    accountId: player.accountId,
    metadata: { bossId: boss.id, damage },
  }, tx);

  // ===== golpe final: marca a morte EXATAMENTE uma vez =====
  let killed = false;
  const claim = await tx.worldBoss.updateMany({
    where: { id: boss.id, status: 'active', currentHp: { lte: 0 } },
    data: { status: 'defeated', defeatedAt: now },
  });
  if (claim.count > 0) {
    killed = true;
    await distributeBossRewards(tx, boss.id);
  }

  return { damage, xpGain: xpReward.xpGranted, killed, cooldownSec: ATTACK_COOLDOWN_SEC, note };
}

/**
 * Recompensas quando o boss é derrotado (executa exatamente UMA vez):
 *  * participação: dano >= MIN_PARTICIPATION_DAMAGE → recompensa básica;
 *  * Top 50 → bônus; Top 10 → bônus maior; Top 3 → especial; #1 → adicional
 *    + cosmético exclusivo "Caçador de Ameaças".
 * Ataques simbólicos (dano ~0) NÃO recebem nada (mínimo de contribuição).
 */
async function distributeBossRewards(tx: Prisma.TransactionClient, bossId: string): Promise<void> {
  const rankings = await tx.worldBossDamage.findMany({
    where: { bossId, rewarded: false, damage: { gte: MIN_PARTICIPATION_DAMAGE } },
    orderBy: { damage: 'desc' },
    include: { player: true },
  });

  for (let i = 0; i < rankings.length; i++) {
    const entry = rankings[i];
    const position = i + 1;

    // base de participação (qualquer um com dano relevante)
    let zeni = 300;
    let crystals = 1;

    // bônus por posição
    if (position === 1) {
      zeni += 5000;
      crystals += 5;
    } else if (position <= 3) {
      zeni += 2000;
      crystals += 3;
    } else if (position <= 10) {
      zeni += 800;
      crystals += 1;
    } else if (position <= 50) {
      zeni += 200;
    }

    await grantRewards(
      tx,
      entry.player,
      { zeni, crystals },
      { type: 'reward', source: 'world_boss', accountId: entry.player.accountId, metadata: { bossId, position } }
    );

    // #1 ganha cosmético exclusivo (concedido — não comprável)
    if (position === 1 && !entry.player.isBot) {
      await tx.cosmeticOwned
        .upsert({
          where: { accountId_cosmetic: { accountId: entry.player.accountId ?? '', cosmetic: 'title_cacador_ameacas' } },
          update: {},
          create: { accountId: entry.player.accountId ?? '', cosmetic: 'title_cacador_ameacas' },
        })
        .catch(() => undefined); // conta sem accountId (bot legado) — ignora
    }

    // marca como recompensado (proteção contra recompensa dupla)
    await tx.worldBossDamage.update({
      where: { id: entry.id },
      data: { rewarded: true },
    });
  }
}
