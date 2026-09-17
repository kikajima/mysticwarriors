import { ok, toErrorResponse } from '@/lib/api';
import { getAuth } from '@/lib/auth';
import { getBossView } from '@/lib/worldboss';
import { getSeasonView } from '@/lib/seasons';

// GET /api/game/worldboss?playerId=... — estado do Ameaça Universal + temporada
// (playerId opcional: sem sessão, devolve visão pública sem dano pessoal)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let playerId: string | null = searchParams.get('playerId');

    const auth = await getAuth();
    if (playerId) {
      // A personal request must not silently turn into a public zero-damage view.
      const { requirePlayer } = await import('@/lib/auth');
      if (!auth) return Response.json({ success: false, error: { message: 'Sessão expirada. Entre novamente para consultar seu dano.' } }, { status: 401 });
      await requirePlayer(auth, playerId);
    }

    const boss = await getBossView(playerId);
    const season = await getSeasonView(playerId);
    return ok({ boss, season });
  } catch (error) {
    return toErrorResponse(error);
  }
}
