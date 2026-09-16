import { db } from '@/lib/db';
import { ok, toErrorResponse, ApiError } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { getAchievementViews } from '@/lib/progression';
import { COSMETICS, PRODUCTS } from '@/lib/game/content/cosmetics';
import { parseCosmeticsOwned } from '@/lib/game/engine';

// GET /api/game/achievements?playerId=... — conquistas + cosméticos DO PERSONAGEM
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    if (!playerId) throw new ApiError('VALIDATION_ERROR', 'playerId é obrigatório.');
    const player = await requirePlayer(auth, playerId);

    const states = await db.achievementState.findMany({ where: { playerId: player.id } });
    const stateMap = new Map(states.map((s) => [s.achievementId, { unlockedAt: s.unlockedAt, claimedAt: s.claimedAt }]));
    const achievements = getAchievementViews(player, stateMap);

    // v0.9.6 (Mudança 3): posse de cosméticos é do PERSONAGEM — a loja
    // mostra a coleção de QUEM está jogando, não a da conta.
    const ownedCosmetics = parseCosmeticsOwned(player.cosmeticsOwned);

    return ok({
      achievements,
      cosmetics: COSMETICS,
      products: PRODUCTS,
      ownedCosmetics,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
