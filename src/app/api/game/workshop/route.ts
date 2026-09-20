import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { getProfessionMaterial } from '@/lib/game/content/world';
import { craftingProgress, getCraftStackItem, getCraftedItem } from '@/lib/game/content/crafting';

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const playerId = new URL(request.url).searchParams.get('playerId') ?? '';
    const player = await requirePlayer(auth, playerId);

    const [rows, jobs] = await Promise.all([
      db.inventoryStack.findMany({
        where: { playerId: player.id, quantity: { gt: 0 } },
        orderBy: [{ itemId: 'asc' }],
      }),
      db.craftJob.findMany({
        where: { playerId: player.id },
        orderBy: [{ position: 'asc' }, { startedAt: 'asc' }],
      }),
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

    const queue = jobs.map((job) => {
      const output = getCraftedItem(job.outputItemId) ?? getCraftStackItem(job.outputItemId);
      return {
        id: job.id,
        position: job.position,
        recipeId: job.recipeId,
        outputItemId: job.outputItemId,
        outputQuantity: job.outputQuantity,
        batchQuantity: job.batchQuantity,
        spentZeni: job.spentZeni,
        outputName: output?.name ?? job.outputItemId,
        outputIcon: output?.icon ?? '📦',
        academicLevelStart: job.academicLevelStart,
        startedAt: job.startedAt.toISOString(),
        endsAt: job.endsAt.toISOString(),
      };
    });
    const mastery = craftingProgress(player.craftingXp);

    return ok({
      inventory,
      jobs: queue,
      // Compatibilidade temporária com clientes antigos: primeiro item da fila.
      job: queue[0] ?? null,
      mastery: {
        ...mastery,
        xp: player.craftingXp,
        craftsCompleted: player.craftsCompleted,
      },
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
