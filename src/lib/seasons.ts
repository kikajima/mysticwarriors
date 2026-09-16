import type { Prisma, Player } from '@prisma/client';
import { db } from '@/lib/db';
import type { SeasonView } from './game/types';

// =====================================================================
// TEMPORADAS — estrutura + serviços básicos
// ---------------------------------------------------------------------
// O progresso PERMANENTE do personagem nunca é apagado. O ranking
// sazonal é independente (pontos por vitórias na temporada).
// =====================================================================

const SEASON_DAYS = 30;

/** Garante uma temporada ativa (cria "Temporada N" se nenhuma ativa). */
export async function ensureActiveSeason(tx: Prisma.TransactionClient): Promise<void> {
  const now = new Date();

  // encerra temporadas vencidas
  await tx.season.updateMany({
    where: { status: 'active', endsAt: { lt: now } },
    data: { status: 'finished' },
  });

  const active = await tx.season.findFirst({ where: { status: 'active' } });
  if (active) return;

  const count = await tx.season.count();
  const number = count + 1;
  await tx.season.create({
    data: {
      name: `Temporada ${number}`,
      number,
      startsAt: now,
      endsAt: new Date(now.getTime() + SEASON_DAYS * 24 * 60 * 60 * 1000),
      status: 'active',
    },
  });
}

/** Pontua uma vitória para o ranking da temporada (chamado nas batalhas). */
export async function scoreSeasonVictory(tx: Prisma.TransactionClient, player: Player, points = 10): Promise<void> {
  await ensureActiveSeason(tx);
  const season = await tx.season.findFirst({ where: { status: 'active' } });
  if (!season) return;

  await tx.seasonRankEntry.upsert({
    where: { seasonId_playerId: { seasonId: season.id, playerId: player.id } },
    update: { points: { increment: points }, wins: { increment: 1 } },
    create: { seasonId: season.id, playerId: player.id, points, wins: 1 },
  });
}

/** View da temporada atual para o jogador. */
export async function getSeasonView(playerId: string | null): Promise<SeasonView | null> {
  return db.$transaction(
    async (tx) => {
    await ensureActiveSeason(tx);
    const season = await tx.season.findFirst({ where: { status: 'active' } });
    if (!season) return null;

    let myPoints = 0;
    let myPosition: number | null = null;
    if (playerId) {
      const entry = await tx.seasonRankEntry.findUnique({
        where: { seasonId_playerId: { seasonId: season.id, playerId } },
      });
      myPoints = entry?.points ?? 0;
      if (entry) {
        myPosition =
          (await tx.seasonRankEntry.count({
            where: { seasonId: season.id, points: { gt: entry.points } },
          })) + 1;
      }
    }

    const daysLeft = Math.max(0, Math.ceil((season.endsAt.getTime() - Date.now()) / 86400000));
    return {
      id: season.id,
      name: season.name,
      number: season.number,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      status: season.status,
      daysLeft,
      myPoints,
      myPosition,
    };
    },
    { timeout: 15_000, maxWait: 5_000 }
  );
}
