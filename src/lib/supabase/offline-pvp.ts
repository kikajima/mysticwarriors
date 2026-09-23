import type { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { loadServerOfflineOpponent } from './server-mirror';
import { cloudCharacterToPlayerData, sanitizeCloudCharacterState } from './progress';
import { isStaleAfterReset } from '@/lib/game/resetGuard';
import { DAILY_QUESTS, WEEKLY_QUESTS } from '@/lib/game/content/quests';
import { dailyPeriod, weeklyPeriod } from '@/lib/progression';
import { computeDerived } from '@/lib/game/engine';

interface OfflineRow { id: string; nome: string; estado: unknown; atualizado_em: string; ativo: boolean }
export interface OfflineOpponent { user_id: string; personagens: OfflineRow[] }

/**
 * Only a name is accepted from the client. Stage 12 resolves the snapshot
 * through the server-side PostgreSQL connection; no Supabase bearer token
 * or public RPC is exposed to the browser.
 */
export async function fetchOfflineOpponent(name: string): Promise<OfflineOpponent> {
  const data = await loadServerOfflineOpponent(name);
  if (!data?.user_id || !Array.isArray(data.personagens) || !data.personagens.some((r) => r.nome === name)) {
    throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado no ranking.');
  }
  return data;
}

/** Restore the account's characters together so a later login/save cannot discard siblings.
 * Existing local state always wins, including offline PvP losses and currency transfers. */
export async function restoreOfflineOpponent(tx: Prisma.TransactionClient, snapshot: OfflineOpponent, targetName: string) {
  const reset = await tx.gameMeta.findUnique({ where: { key: 'serverResetAt' } });
  const rows = snapshot.personagens.filter((r) => !isStaleAfterReset(r.atualizado_em, reset?.value));
  if (!rows.some((r) => r.nome === targetName)) throw new ApiError('NOT_FOUND', 'Este guerreiro não está mais disponível.');
  const account = await tx.account.upsert({
    where: { supabaseUserId: snapshot.user_id },
    update: {},
    create: { supabaseUserId: snapshot.user_id, isGuest: false },
  });
  const periods = [dailyPeriod(), weeklyPeriod()];
  const definitions = new Map([...DAILY_QUESTS, ...WEEKLY_QUESTS].map((q) => [q.id, q]));
  for (const row of rows) {
    const existing = await tx.player.findUnique({ where: { id: row.id } });
    if (existing) {
      if (existing.accountId !== account.id) throw new ApiError('CONFLICT', 'Identidade do adversário indisponível.');
      continue;
    }
    const char = { ...sanitizeCloudCharacterState(row.estado), id: row.id, name: row.nome };
    const created = await tx.player.create({ data: { ...cloudCharacterToPlayerData(char), accountId: account.id } });
    for (const material of char.materials ?? []) {
      await tx.inventoryStack.upsert({
        where: { playerId_itemId: { playerId: created.id, itemId: material.itemId } },
        update: { quantity: material.quantity },
        create: { playerId: created.id, itemId: material.itemId, quantity: material.quantity },
      });
    }
    const derived = computeDerived(created);
    await tx.player.update({ where: { id: created.id }, data: {
      hp: Math.max(1, Math.min(created.hp, derived.maxHp)), energy: Math.min(created.energy, derived.maxEnergy),
    } });
    for (const q of char.quests) {
      const def = definitions.get(q.questId);
      if (!def || def.kind !== q.kind || !periods.includes(q.period)) continue;
      await tx.questProgress.create({ data: {
        playerId: created.id, questId: q.questId, kind: q.kind, period: q.period,
        target: def.target, rewardZeni: def.rewardZeni, rewardXp: def.rewardXp, rewardCrystals: def.rewardCrystals,
        progress: q.progress, claimed: q.claimed, claimedAt: q.claimed ? new Date() : null,
      } });
    }
    for (const achievement of char.achievementsClaimed) {
      const at = new Date(achievement.claimedAt ?? Date.now());
      await tx.achievementState.create({ data: {
        playerId: created.id, achievementId: achievement.achievementId, progress: 0, unlockedAt: at, claimedAt: at,
      } });
    }
    if (row.ativo && !account.activePlayerId) {
      await tx.account.update({ where: { id: account.id }, data: { activePlayerId: created.id } });
    }
  }
  return tx.player.findFirst({ where: { accountId: account.id, name: targetName, isBot: false } });
}
