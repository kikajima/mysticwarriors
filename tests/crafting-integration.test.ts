import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { applyPendingMigrations } from '../src/lib/game/persistence';
import { initialPlayerData } from '../src/lib/game/characterInitial';
import { cancelCraft, claimCraft, startCraft } from '../src/lib/game/crafting';
import { ApiError } from '../src/lib/api';

async function makeDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-craft-full-'));
  const db = new PrismaClient({
    datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } },
  });
  await applyPendingMigrations(db);
  return { db, dir };
}

async function createPlayer(db: PrismaClient, items?: string) {
  return db.player.create({
    data: {
      ...initialPlayerData(),
      name: `Crafter-${Math.random().toString(36).slice(2, 8)}`,
      race: 'humano',
      ...(items ? { items } : {}),
    },
  });
}

describe('Oficina completa — integração transacional', () => {
  let db: PrismaClient;
  let dir: string;

  beforeAll(async () => {
    const setup = await makeDb();
    db = setup.db;
    dir = setup.dir;
  }, 15_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test('lote consome, persiste snapshot e cancelamento devolve tudo exatamente', async () => {
      const player = await createPlayer(db);
      await db.inventoryStack.createMany({
        data: [
          { playerId: player.id, itemId: 'erva_medicinal', quantity: 10 },
          { playerId: player.id, itemId: 'liga_metais_leves', quantity: 10 },
        ],
      });

      await db.$transaction((tx) => startCraft(tx, player, 'capsula_recuperacao_simples', 3));

      const afterStart = await db.player.findUniqueOrThrow({ where: { id: player.id } });
      expect(afterStart.zeni).toBe(50);

      const herbAfter = await db.inventoryStack.findUniqueOrThrow({
        where: { playerId_itemId: { playerId: player.id, itemId: 'erva_medicinal' } },
      });
      const alloyAfter = await db.inventoryStack.findUniqueOrThrow({
        where: { playerId_itemId: { playerId: player.id, itemId: 'liga_metais_leves' } },
      });
      expect(herbAfter.quantity).toBe(4);
      expect(alloyAfter.quantity).toBe(7);

      const job = await db.craftJob.findUniqueOrThrow({ where: { playerId: player.id } });
      expect(job.outputQuantity).toBe(3);
      expect(job.inputZeni).toBe(450);
      expect(JSON.parse(job.inputIngredients)).toEqual([
        { itemId: 'erva_medicinal', quantity: 6 },
        { itemId: 'liga_metais_leves', quantity: 3 },
      ]);

      const fresh = await db.player.findUniqueOrThrow({ where: { id: player.id } });
      await db.$transaction((tx) => cancelCraft(tx, fresh));

      const afterCancel = await db.player.findUniqueOrThrow({ where: { id: player.id } });
      expect(afterCancel.zeni).toBe(500);
      expect(await db.craftJob.findUnique({ where: { playerId: player.id } })).toBeNull();
      expect(
        (await db.inventoryStack.findUniqueOrThrow({
          where: { playerId_itemId: { playerId: player.id, itemId: 'erva_medicinal' } },
        })).quantity
      ).toBe(10);
      expect(
        (await db.inventoryStack.findUniqueOrThrow({
          where: { playerId_itemId: { playerId: player.id, itemId: 'liga_metais_leves' } },
        })).quantity
      ).toBe(10);

      const ledger = await db.walletTransaction.findMany({
        where: { playerId: player.id, source: { in: ['craft', 'craft_cancel'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(ledger.map((row) => [row.source, row.amount])).toEqual([
        ['craft', -450],
        ['craft_cancel', 450],
      ]);
  });

  test('lote concluído entrega a quantidade correta de consumíveis uma única vez', async () => {
      const player = await createPlayer(db);
      await db.inventoryStack.createMany({
        data: [
          { playerId: player.id, itemId: 'erva_medicinal', quantity: 4 },
          { playerId: player.id, itemId: 'liga_metais_leves', quantity: 2 },
        ],
      });

      await db.$transaction((tx) => startCraft(tx, player, 'capsula_recuperacao_simples', 2));
      await db.craftJob.update({
        where: { playerId: player.id },
        data: { endsAt: new Date(Date.now() - 1000) },
      });

      const fresh = await db.player.findUniqueOrThrow({ where: { id: player.id } });
      await db.$transaction((tx) => claimCraft(tx, fresh));

      const claimed = await db.player.findUniqueOrThrow({ where: { id: player.id } });
      expect(JSON.parse(claimed.items).consumables.capsula_recuperacao_simples).toBe(2);
      expect(await db.craftJob.findUnique({ where: { playerId: player.id } })).toBeNull();

      let error: unknown;
      try {
        await db.$transaction((tx) => claimCraft(tx, claimed));
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toContain('não tem fabricação');
  });

  test('item permanente já possuído não pode ser fabricado novamente', async () => {
      const items = JSON.stringify({
        weapon: null,
        armor: null,
        accessory: null,
        head: 'bandana_oficina',
        wrists: null,
        legs: null,
        boots: null,
        owned: ['bandana_oficina'],
        consumables: {},
        stacks: {},
      });
      const player = await createPlayer(db, items);
      await db.inventoryStack.createMany({
        data: [
          { playerId: player.id, itemId: 'papel_pergaminho', quantity: 1 },
          { playerId: player.id, itemId: 'fibra_reforcada', quantity: 1 },
        ],
      });

      let error: unknown;
      try {
        await db.$transaction((tx) => startCraft(tx, player, 'craft_bandana_oficina', 1));
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toContain('item permanente/único');

      const unchanged = await db.player.findUniqueOrThrow({ where: { id: player.id } });
      expect(unchanged.zeni).toBe(500);
      expect(await db.craftJob.findUnique({ where: { playerId: player.id } })).toBeNull();
  });
});
