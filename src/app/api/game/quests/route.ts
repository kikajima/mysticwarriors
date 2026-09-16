import { ok, toErrorResponse, ApiError } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { getQuestViews } from '@/lib/progression';

// GET /api/game/quests?playerId=... — quests diárias/semanais do jogador
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    if (!playerId) throw new ApiError('VALIDATION_ERROR', 'playerId é obrigatório.');
    await requirePlayer(auth, playerId);
    const quests = await getQuestViews(playerId);
    return ok({ quests });
  } catch (error) {
    return toErrorResponse(error);
  }
}
