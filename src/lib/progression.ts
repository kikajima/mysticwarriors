import type { Prisma, Player } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import { dayKey, weekKey } from './game/rules';
import { DAILY_QUESTS, WEEKLY_QUESTS, ACHIEVEMENTS } from './game/content/quests';
import { parseItems, parseTechniques, parseTransformationsOwned } from './game/engine';
import { grantRewards } from '@/lib/economy';
import { trackEvent } from '@/lib/analytics';
import type { AchievementView, QuestMetric, QuestView } from './game/types';

// =====================================================================
// PROGRESSÃO — quests diárias/semanais + conquistas
// ---------------------------------------------------------------------
// * Reset diário/semanal por chave de período (fuso America/Sao_Paulo);
// * Geração determinística por jogador+período (mesmas quests até o reset);
// * Progresso acumulado pelas ações do jogo (bumpQuests);
// * Claim atômico (updateMany condicional em claimed) — sem recompensa dupla.
// =====================================================================

const DAILY_PICK = 3; // quests diárias simultâneas
const WEEKLY_PICK = 2; // quests semanais simultâneas

/** hash estável (djb2) para sorteio determinístico (exportado para testes) */
export function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickQuests<T extends { id: string }>(pool: T[], seed: string, count: number): T[] {
  const scored = pool.map((q) => ({ q, score: hash(`${seed}:${q.id}`) }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, count).map((s) => s.q);
}

export function dailyPeriod(now = new Date()): string {
  return dayKey(now);
}

export function weeklyPeriod(now = new Date()): string {
  return weekKey(now);
}

/**
 * Garante que o jogador tem quests geradas para o período atual.
 * Cria com upsert (idempotente — a unique [playerId, questId, period] protege).
 */
export async function ensureQuests(tx: Prisma.TransactionClient, playerId: string): Promise<void> {
  const dPeriod = dailyPeriod();
  const wPeriod = weeklyPeriod();

  // PORTA DE LEITURA: se o período já tem quests suficientes, não escreve nada.
  // Isso mantém o polling de estado /api/game/state livre de escrita no caminho quente.
  const already = await tx.questProgress.count({
    where: { playerId, period: { in: [dPeriod, wPeriod] } },
  });
  if (already >= DAILY_PICK + WEEKLY_PICK) return;

  const existing = await tx.questProgress.findMany({
    where: { playerId, period: { in: [dPeriod, wPeriod] } },
    select: { questId: true, kind: true },
  });
  const existingIds = new Set(existing.map((e) => e.questId));

  const dailies = pickQuests(DAILY_QUESTS, `${playerId}:${dPeriod}`, DAILY_PICK);
  const weeklies = pickQuests(WEEKLY_QUESTS, `${playerId}:${wPeriod}`, WEEKLY_PICK);

  for (const q of [...dailies, ...weeklies]) {
    if (existingIds.has(q.id)) continue;
    await tx.questProgress.upsert({
      where: { playerId_questId_period: { playerId, questId: q.id, period: q.kind === 'daily' ? dPeriod : wPeriod } },
      update: {},
      create: {
        playerId,
        questId: q.id,
        kind: q.kind,
        period: q.kind === 'daily' ? dPeriod : wPeriod,
        target: q.target,
        rewardZeni: q.rewardZeni,
        rewardXp: q.rewardXp,
        rewardCrystals: q.rewardCrystals,
      },
    });
  }
}

/**
 * Avança o progresso de todas as quests ativas do jogador para uma métrica.
 * Chamado dentro da transação da ação (missão, batalha, treino...).
 */
export async function bumpQuests(
  tx: Prisma.TransactionClient,
  playerId: string,
  metric: QuestMetric,
  amount: number,
  opts: { isPvp?: boolean } = {}
): Promise<void> {
  if (amount <= 0) return;
  const dPeriod = dailyPeriod();
  const wPeriod = weeklyPeriod();

  const active = await tx.questProgress.findMany({
    where: {
      playerId,
      period: { in: [dPeriod, wPeriod] },
      claimed: false,
    },
  });


  for (const qp of active) {
    const def = [...DAILY_QUESTS, ...WEEKLY_QUESTS].find((q) => q.id === qp.questId);
    if (!def) continue;

    let inc = 0;
    if (def.metric === 'pvp_battle') {
      // evento DEDICADO: contado na ação de PvP, vencendo ou perdendo
      // (battle_win/pvp_win são métricas separadas — sem dupla contagem)
      if (metric === 'pvp_battle') inc = amount;
    } else if (def.metric === metric) {
      inc = amount;
    }
    if (inc <= 0) continue;

    await tx.questProgress.update({
      where: { id: qp.id },
      data: { progress: Math.min(def.target, qp.progress + inc) },
    });
  }
}

/** Views das quests ativas do período (cria se necessário). */
export async function getQuestViews(playerId: string): Promise<QuestView[]> {
  return db.$transaction(
    async (tx) => {
    await ensureQuests(tx, playerId);
    const dPeriod = dailyPeriod();
    const wPeriod = weeklyPeriod();
    const rows = await tx.questProgress.findMany({
      where: { playerId, period: { in: [dPeriod, wPeriod] } },
    });
    const defs = new Map([...DAILY_QUESTS, ...WEEKLY_QUESTS].map((q) => [q.id, q]));
    return rows
      .map((r) => {
        const def = defs.get(r.questId);
        if (!def) return null;
        return {
          questId: r.questId,
          kind: r.kind as 'daily' | 'weekly',
          name: def.name,
          description: def.description,
          icon: def.icon,
          progress: r.progress,
          target: r.target,
          rewardZeni: r.rewardZeni,
          rewardXp: r.rewardXp,
          rewardCrystals: r.rewardCrystals,
          claimed: r.claimed,
          ready: !r.claimed && r.progress >= r.target,
        } satisfies QuestView;
      })
      .filter((q): q is QuestView => q !== null)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.questId.localeCompare(b.questId));
    },
    { timeout: 15_000, maxWait: 5_000 }
  );
}

/**
 * Coleta a recompensa de uma quest — ATÔMICO:
 * updateMany condicional em claimed=false garante claim único.
 */
export async function claimQuest(
  tx: Prisma.TransactionClient,
  player: Player,
  questId: string
): Promise<{ levelsGained: number; rewards: { zeni: number; xp: number; crystals: number } }> {
  const dPeriod = dailyPeriod();
  const wPeriod = weeklyPeriod();

  const qp = await tx.questProgress.findFirst({
    where: { playerId: player.id, questId, period: { in: [dPeriod, wPeriod] } },
  });
  if (!qp) throw new ApiError('NOT_FOUND', 'Missão diária/semanal não encontrada.');
  if (qp.progress < qp.target) {
    throw new ApiError('QUEST_NOT_READY', `Progresso insuficiente: ${qp.progress}/${qp.target}.`);
  }

  // claim atômico: apenas um request consegue virar claimed
  const res = await tx.questProgress.updateMany({
    where: { id: qp.id, claimed: false },
    data: { claimed: true, claimedAt: new Date() },
  });
  if (res.count === 0) throw new ApiError('QUEST_ALREADY_CLAIMED', 'Recompensa já coletada.');

  const rewards = { zeni: qp.rewardZeni, xp: qp.rewardXp, crystals: qp.rewardCrystals };
  const { levelsGained } = await grantRewards(tx, player, rewards, {
    type: 'reward',
    source: qp.kind === 'daily' ? 'quest_daily' : 'quest_weekly',
    accountId: player.accountId,
  });

  // v0.9.20 — CORREÇÃO DO DELAY DE 5s: o evento DEVE usar o `tx` da
  // transação da ação. Chamando com o db global, o INSERT espera o write
  // lock que a PRÓPRIA transação segura (SQLite) e só falha no socket
  // timeout (~5s) — era esta a causa raiz do "coletar demora demais".
  await trackEvent(qp.kind === 'daily' ? 'daily_completed' : 'weekly_completed', {
    playerId: player.id,
    accountId: player.accountId,
    metadata: { questId },
  }, tx);

  return { levelsGained, rewards };
}

// ===== Conquistas =====

/** Métricas acumuladas do jogador (lidas do próprio registro + JSONs). */
export function achievementMetrics(player: Player & { guild?: unknown }): Record<string, number> {
  return {
    battlesWon: player.battlesWon,
    battlesLost: player.battlesLost,
    missionsDone: player.missionsDone,
    level: player.level,
    techniquesLearned: parseTechniques(player.techniques).length,
    guildMembership: player.guildId ? 1 : 0,
    itemsOwned: parseItems(player.items).owned.length + Object.keys(parseItems(player.items).consumables).length,
    transformationsOwned: parseTransformationsOwned(player.transformationsOwned).length,
    dragonBalls: player.dragonBalls,
    pvpWins: player.pvpWins,
    guildDonated: player.guildDonated,
    trainingDone: player.trainingsDone,
    // v0.9.17 — narrativas do ASCENSÃO Z (Cap. 7/29)
    miracleWins: player.miracleWins,
    davidWins: player.davidWins,
    // v0.9.18 — Torneio de Artes Marciais (chave de 8)
    tournamentTitles: player.tournamentTitles,
    tournamentRoundWins: player.tournamentRoundWins,
  };
}

/** Views de todas as conquistas com progresso atual. */
export function getAchievementViews(player: Player & { guild?: unknown }, states: Map<string, { unlockedAt: Date | null; claimedAt: Date | null }>): AchievementView[] {
  const metrics = achievementMetrics(player);
  return ACHIEVEMENTS.map((a) => {
    const state = states.get(a.id);
    const progress = Math.min(metrics[a.metric] ?? 0, a.target);
    return {
      achievementId: a.id,
      category: a.category,
      name: a.name,
      description: a.description,
      icon: a.icon,
      progress,
      target: a.target,
      rewardZeni: a.rewardZeni,
      rewardXp: a.rewardXp,
      rewardCrystals: a.rewardCrystals,
      unlocked: progress >= a.target,
      claimed: !!state?.claimedAt,
    };
  });
}

/** Coleta recompensa de conquista — atômico contra claim duplo. */
export async function claimAchievement(
  tx: Prisma.TransactionClient,
  player: Player,
  achievementId: string
): Promise<{ levelsGained: number; rewards: { zeni: number; xp: number; crystals: number } }> {
  const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!def) throw new ApiError('NOT_FOUND', 'Conquista não encontrada.');

  const metrics = achievementMetrics(player);
  if ((metrics[def.metric] ?? 0) < def.target) {
    throw new ApiError('ACHIEVEMENT_NOT_UNLOCKED', 'Conquista ainda não desbloqueada.');
  }

  // garante linha de estado e marca claim de forma atômica
  await tx.achievementState.upsert({
    where: { playerId_achievementId: { playerId: player.id, achievementId } },
    update: {},
    create: { playerId: player.id, achievementId, unlockedAt: new Date() },
  });
  const res = await tx.achievementState.updateMany({
    where: { playerId: player.id, achievementId, claimedAt: null },
    data: { claimedAt: new Date(), unlockedAt: new Date() },
  });
  if (res.count === 0) throw new ApiError('ACHIEVEMENT_ALREADY_CLAIMED', 'Recompensa da conquista já coletada.');

  const rewards = { zeni: def.rewardZeni, xp: def.rewardXp, crystals: def.rewardCrystals };
  const { levelsGained } = await grantRewards(tx, player, rewards, {
    type: 'reward',
    source: 'achievement',
    accountId: player.accountId,
  });

  // v0.9.20 — CORREÇÃO DO DELAY DE 5s: mesmo bug do claimQuest — o evento
  // roda DENTRO da $transaction da ação e precisa do `tx` (o db global
  // disputa o write lock com a transação e estoura o socket timeout ~5s).
  await trackEvent('achievement_claimed', {
    playerId: player.id,
    accountId: player.accountId,
    metadata: { achievementId },
  }, tx);

  return { levelsGained, rewards };
}
