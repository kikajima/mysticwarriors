import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { getProfessionMaterial } from '@/lib/game/content/world';

// =====================================================================
// GET /api/game/professions?playerId=...
// ---------------------------------------------------------------------
// Painel sob demanda: o polling geral do jogo NÃO carrega inventário de
// materiais. Isso evita reintroduzir round-trips no /api/game/state.
// =====================================================================

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const playerId = new URL(request.url).searchParams.get('playerId') ?? '';
    const player = await requirePlayer(auth, playerId);

    const rows = await db.inventoryStack.findMany({
      where: { playerId: player.id, quantity: { gt: 0 } },
      orderBy: [{ itemId: 'asc' }],
    });

    return ok({
      materials: rows.map((row) => {
        const def = getProfessionMaterial(row.itemId);
        return {
          itemId: row.itemId,
          quantity: row.quantity,
          name: def?.name ?? row.itemId,
          professionId: def?.professionId ?? null,
          rarity: def?.rarity ?? null,
          tier: def?.tier ?? null,
          icon: def?.icon ?? '📦',
        };
      }),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
