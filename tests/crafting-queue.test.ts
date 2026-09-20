import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { applyPendingMigrations } from '../src/lib/game/persistence';
import { cancelCraft, claimCraft, startCraft } from '../src/lib/game/crafting';

async function makeDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-craft-queue-'));
  const client = new PrismaClient({
    datasources: { db: { url: `file:${path.join(dir, 'custom.db')}` } },
  });
  await applyPendingMigrations(client);
  return { client, dir };
}

describe('Oficina — fila, cancelamento e maestria (integração)', () => {
  test('Nv. 4 permite duas fabricações seriais; cancelar a primeira adianta a segunda e reembolsa', async () => {
    const { client, dir } = await makeDb();
    try {
      const player = await client.player.create({
        data: {
          name: 'Craft Queue QA',
          race: 'humano',
          zeni: 10_000,
          craftingXp: 500, // Nível 4 da Oficina => 2 espaços
        },
      });
      await client.inventoryStack.createMany({
        data: [
          { playerId: player.id, itemId: 'faixa_pressao', quantity: 20 },
          { playerId: player.id, itemId: 'papel_pergaminho', quantity: 10 },
          { playerId: player.id, itemId: 'fibra_reforcada', quantity: 10 },
        ],
      });

      await client.$transaction(async (tx) => {
        const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        await startCraft(tx, fresh, 'bandana_foco_ki', 1);
      });
      await client.$transaction(async (tx) => {
        const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        await startCraft(tx, fresh, 'faixas_treinamento', 1);
      });

      const queued = await client.craftJob.findMany({
        where: { playerId: player.id },
        orderBy: { position: 'asc' },
      });
      expect(queued).toHaveLength(2);
      expect(queued.map((j) => j.position)).toEqual([0, 1]);
      expect(queued[1].startedAt.getTime()).toBe(queued[0].endsAt.getTime());

      let thirdError = '';
      try {
        await client.$transaction(async (tx) => {
          const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
          await startCraft(tx, fresh, 'botas_treinamento', 1);
        });
      } catch (error) {
        thirdError = error instanceof Error ? error.message : String(error);
      }
      expect(thirdError).toContain('fila da Oficina está cheia');

      const secondStartBefore = queued[1].startedAt.getTime();
      await client.$transaction(async (tx) => {
        const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        await cancelCraft(tx, fresh, queued[0].id);
      });

      const afterCancel = await client.craftJob.findMany({
        where: { playerId: player.id },
        orderBy: { position: 'asc' },
      });
      expect(afterCancel).toHaveLength(1);
      expect(afterCancel[0].position).toBe(0);
      expect(afterCancel[0].startedAt.getTime()).toBeLessThan(secondStartBefore);

      const wallet = await client.player.findUniqueOrThrow({ where: { id: player.id } });
      // Ficou apenas o custo das Faixas de Treinamento (160).
      expect(wallet.zeni).toBe(9_840);
      const bandanaIngredient = await client.inventoryStack.findUniqueOrThrow({
        where: { playerId_itemId: { playerId: player.id, itemId: 'papel_pergaminho' } },
      });
      expect(bandanaIngredient.quantity).toBe(10);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  test('coletar concede item, XP de Oficina e contador de unidades', async () => {
    const { client, dir } = await makeDb();
    try {
      const player = await client.player.create({
        data: { name: 'Craft Mastery QA', race: 'humano', zeni: 2_000 },
      });
      await client.inventoryStack.createMany({
        data: [
          { playerId: player.id, itemId: 'faixa_pressao', quantity: 10 },
          { playerId: player.id, itemId: 'papel_pergaminho', quantity: 10 },
        ],
      });

      await client.$transaction(async (tx) => {
        const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        await startCraft(tx, fresh, 'bandana_foco_ki', 2);
      });
      const job = await client.craftJob.findFirstOrThrow({ where: { playerId: player.id } });
      await client.craftJob.update({
        where: { id: job.id },
        data: { startedAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() - 1_000) },
      });

      const message = await client.$transaction(async (tx) => {
        const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
        return claimCraft(tx, fresh);
      });
      expect(message.message).toContain('+50 XP de Oficina');

      const fresh = await client.player.findUniqueOrThrow({ where: { id: player.id } });
      expect(fresh.craftingXp).toBe(50);
      expect(fresh.craftsCompleted).toBe(2);
      const items = JSON.parse(fresh.items) as {
        owned: string[];
        stacks: Record<string, number>;
      };
      expect(items.owned).toContain('bandana_foco_ki');
      expect(items.stacks.bandana_foco_ki).toBe(2);
      expect(await client.craftJob.count({ where: { playerId: player.id } })).toBe(0);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
