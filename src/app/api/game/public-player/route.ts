import { db } from '@/lib/db';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { computeDerived } from '@/lib/game/engine';
import { getTransformation } from '@/lib/game/content/transformations';
import { publicCosmeticsFromRaw } from '@/lib/game/content/cosmetics';
import type { PublicPlayerProfile, RaceId } from '@/lib/game/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAuth();
    const playerId = new URL(request.url).searchParams.get('playerId');
    if (!playerId) throw new ApiError('VALIDATION_ERROR', 'Guerreiro não informado.');

    const player = await db.player.findFirst({
      where: { id: playerId, isBot: false },
      include: { guild: { select: { id: true, name: true } } },
    });
    if (!player) throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado.');

    const transformation = player.transformationId
      ? getTransformation(player.transformationId)
      : undefined;

    const profile: PublicPlayerProfile = {
      id: player.id,
      name: player.name,
      race: player.race as RaceId,
      avatarUrl: player.avatarUrl,
      level: player.level,
      power: computeDerived(player).power,
      battlesWon: player.battlesWon,
      battlesLost: player.battlesLost,
      tournamentWins: player.tournamentRoundWins,
      tournamentTitles: player.tournamentTitles,
      guild: player.guild,
      transformation: transformation
        ? { id: transformation.id, name: transformation.name, icon: transformation.icon }
        : null,
      cosmetics: publicCosmeticsFromRaw(player.cosmeticsEquipped),
    };

    return ok({ player: profile });
  } catch (error) {
    return toErrorResponse(error);
  }
}
