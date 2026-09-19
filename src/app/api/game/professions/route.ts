import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { getProfessionMaterial } from '@/lib/game/content/world';
import { getCraftStackItem } from '@/lib/game/content/crafting';

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
        const blueprint = getCraftStackItem(row.itemId);
        return {
          itemId: row.itemId,
          quantity: row.quantity,
          name: def?.name ?? blueprint?.name ?? row.itemId,
          professionId: def?.professionId ?? (blueprint ? 'academico' : null),
          rarity: def?.rarity ?? (blueprint ? 'rare' : null),
          tier: def?.tier ?? blueprint?.tier ?? null,
          icon: def?.icon ?? blueprint?.icon ?? '📦',
        };
      }),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
