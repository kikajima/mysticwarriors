// =====================================================================
// Supabase — extras do snapshot coletados do banco (v0.9.4, SERVER-SIDE)
// ---------------------------------------------------------------------
// Busca no Prisma o estado que passou a integrar o snapshot da nuvem:
// quests diárias/semanais do período atual e conquistas já coletadas.
//
// Vive em um arquivo SEPARADO de progress.ts porque este importa o Prisma
// (banco) — e progress.ts é importado (type-only) pelo bundle do
// navegador. Aqui só o servidor entra.
// =====================================================================

import { db } from '@/lib/db';
import { dailyPeriod, weeklyPeriod } from '@/lib/progression';
import type { CloudQuestSnapshot, CloudAchievementSnapshot, CharacterExtras } from './progress';

export type CharacterExtrasMap = Map<string, CharacterExtras>;

/**
 * Extras por playerId: quests do período CORRENTE (diárias + semanais)
 * e conquistas com recompensa já coletada. Contas sem nada → sem entrada
 * no mapa (serializeCharacterForCloud trata ausência como listas vazias).
 */
export async function collectCharacterExtras(playerIds: string[]): Promise<CharacterExtrasMap> {
  const map: CharacterExtrasMap = new Map();
  if (playerIds.length === 0) return map;

  const periods = [dailyPeriod(), weeklyPeriod()];
  const [questRows, achievementRows, materialRows] = await Promise.all([
    db.questProgress.findMany({
      where: { playerId: { in: playerIds }, period: { in: periods } },
    }),
    db.achievementState.findMany({
      where: { playerId: { in: playerIds }, claimedAt: { not: null } },
    }),
    db.inventoryStack.findMany({
      where: { playerId: { in: playerIds }, quantity: { gt: 0 } },
      select: { playerId: true, itemId: true, quantity: true },
    }),
  ]);

  for (const q of questRows) {
    const entry = map.get(q.playerId) ?? { quests: [], achievements: [], materials: [] };
    entry.quests.push({
      questId: q.questId,
      kind: q.kind === 'weekly' ? 'weekly' : 'daily',
      period: q.period,
      progress: q.progress,
      claimed: q.claimed,
    });
    map.set(q.playerId, entry);
  }

  for (const a of achievementRows) {
    const entry = map.get(a.playerId) ?? { quests: [], achievements: [], materials: [] };
    entry.achievements.push({
      achievementId: a.achievementId,
      claimedAt: a.claimedAt ? a.claimedAt.toISOString() : null,
    });
    map.set(a.playerId, entry);
  }

  for (const m of materialRows) {
    const entry = map.get(m.playerId) ?? { quests: [], achievements: [], materials: [] };
    (entry.materials ??= []).push({ itemId: m.itemId, quantity: m.quantity });
    map.set(m.playerId, entry);
  }

  return map;
}
