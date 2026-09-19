import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { getProfessionMaterial } from '@/lib/game/content/world';
import { getCraftStackItem, getCraftedItem } from '@/lib/game/content/crafting';

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const playerId = new URL(request.url).searchParams.get('playerId') ?? '';
    const player = await requirePlayer(auth, playerId);

    const [rows, job] = await Promise.all([
      db.inventoryStack.findMany({
        where: { playerId: player.id, quantity: { gt: 0 } },
        orderBy: [{ itemId: 'asc' }],
      }),
      db.craftJob.findUnique({ where: { playerId: player.id } }),
    ]);

    const inventory = rows.map((row) => {
      const material = getProfessionMaterial(row.itemId);
      const blueprint = getCraftStackItem(row.itemId);
      return {
        itemId: row.itemId,
        quantity: row.quantity,
        name: material?.name ?? blueprint?.name ?? row.itemId,
        icon: material?.icon ?? blueprint?.icon ?? '📦',
        tier: material?.tier ?? blueprint?.tier ?? null,
        rarity: material?.rarity ?? (blueprint ? 'blueprint' : null),
      };
    });

    const output = job
      ? getCraftedItem(job.outputItemId) ?? getCraftStackItem(job.outputItemId)
      : null;

    return ok({
      inventory,
      job: job
        ? {
            id: job.id,
            recipeId: job.recipeId,
            outputItemId: job.outputItemId,
            outputQuantity: job.outputQuantity,
            outputName: output?.name ?? job.outputItemId,
            outputIcon: output?.icon ?? '📦',
            academicLevelStart: job.academicLevelStart,
            startedAt: job.startedAt.toISOString(),
            endsAt: job.endsAt.toISOString(),
          }
        : null,
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
