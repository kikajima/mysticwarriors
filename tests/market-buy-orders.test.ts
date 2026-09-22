import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { ApiError } from '../src/lib/api';
import { initialPlayerData } from '../src/lib/game/characterInitial';
import { itemCount, parseItems } from '../src/lib/game/engine';
import {
  cancelMarketBuyOrder,
  createMarketBuyOrder,
  fulfillMarketBuyOrder,
  marketTradableAssets,
} from '../src/lib/game/marketplace';
import { applyPendingMigrations } from '../src/lib/game/persistence';

async function makeDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-market-buy-order-'));
  const db = new PrismaClient({
    datasources: { db: { url: `file:${path.join(dir, 'market.db')}` } },
  });
  await applyPendingMigrations(db);
  return { db, dir };
}

async function createPlayer(
  db: PrismaClient,
  name: string,
  opts: { accountId?: string; zeni?: number; crystals?: number; items?: string } = {}
) {
  const accountId =
    opts.accountId ??
    (
      await db.account.create({
        data: {
          username: `market_order_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Math.random().toString(36).slice(2, 7)}`,
        },
      })
    ).id;
  return db.player.create({
    data: {
      ...initialPlayerData(),
      name: `${name}-${Math.random().toString(36).slice(2, 6)}`,
      race: 'humano',
      accountId,
      ...(opts.zeni !== undefined ? { zeni: opts.zeni } : {}),
      ...(opts.crystals !== undefined ? { crystals: opts.crystals } : {}),
      ...(opts.items ? { items: opts.items } : {}),
    },
  });
}

describe('Mercado P2P — propostas de compra', () => {
  test('catálogo de propostas cobre todos os ativos negociáveis e exclui consumíveis/treino', () => {
    const catalog = marketTradableAssets();
    expect(catalog.find((asset) => asset.itemId === 'erva_medicinal')?.kind).toBe('material');
    expect(catalog.find((asset) => asset.itemId === 'esquema_gravidade_alterada')?.kind).toBe('material');
    expect(catalog.find((asset) => asset.itemId === 'gi')?.kind).toBe('equipment');
    expect(catalog.find((asset) => asset.itemId === 'espada_gravidade_100x')?.kind).toBe('equipment');
    expect(catalog.some((asset) => asset.itemId === 'capsula_ki')).toBe(false);
    expect(catalog.some((asset) => asset.itemId === 'gi_ponderado')).toBe(false);
  });

  test('criar proposta reserva o valor total e cancelar devolve somente o saldo restante', async () => {
    const { db, dir } = await makeDb();
    try {
      const buyer = await createPlayer(db, 'BuyerEscrow', { zeni: 1_000 });
      const seller = await createPlayer(db, 'SellerEscrow', { zeni: 100 });
      await db.inventoryStack.create({
        data: { playerId: seller.id, itemId: 'erva_medicinal', quantity: 2 },
      });

      const order = await db.$transaction((tx) =>
        createMarketBuyOrder(tx, buyer.id, {
          itemId: 'erva_medicinal',
          quantity: 5,
          currency: 'zeni',
          unitPrice: 40,
        })
      );

      expect((await db.player.findUniqueOrThrow({ where: { id: buyer.id } })).zeni).toBe(800);
      const escrowLedger = await db.walletTransaction.findMany({
        where: { playerId: buyer.id, source: 'market_buy_order_escrow' },
      });
      expect(escrowLedger.map((row) => row.amount)).toEqual([-200]);

      await db.$transaction((tx) => fulfillMarketBuyOrder(tx, seller.id, order.id, 2));
      await db.$transaction((tx) => cancelMarketBuyOrder(tx, buyer.id, order.id));

      const freshBuyer = await db.player.findUniqueOrThrow({ where: { id: buyer.id } });
      const freshSeller = await db.player.findUniqueOrThrow({ where: { id: seller.id } });
      const freshOrder = await db.marketBuyOrder.findUniqueOrThrow({ where: { id: order.id } });
      const buyerStack = await db.inventoryStack.findUniqueOrThrow({
        where: { playerId_itemId: { playerId: buyer.id, itemId: 'erva_medicinal' } },
      });
      const refundLedger = await db.walletTransaction.findMany({
        where: { playerId: buyer.id, source: 'market_buy_order_refund' },
      });

      expect(freshBuyer.zeni).toBe(920);
      expect(freshSeller.zeni).toBe(180);
      expect(buyerStack.quantity).toBe(2);
      expect(freshOrder.status).toBe('cancelled');
      expect(freshOrder.quantityRemaining).toBe(3);
      expect(refundLedger.map((row) => row.amount)).toEqual([120]);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('vendedores diferentes atendem parcialmente e a proposta fecha sem segundo débito do comprador', async () => {
    const { db, dir } = await makeDb();
    try {
      const buyer = await createPlayer(db, 'BuyerPartial', { crystals: 50 });
      const sellerA = await createPlayer(db, 'SellerPartialA', { crystals: 1 });
      const sellerB = await createPlayer(db, 'SellerPartialB', { crystals: 2 });
      await db.inventoryStack.createMany({
        data: [
          { playerId: sellerA.id, itemId: 'agua_purificada', quantity: 1 },
          { playerId: sellerB.id, itemId: 'agua_purificada', quantity: 2 },
        ],
      });

      const order = await db.$transaction((tx) =>
        createMarketBuyOrder(tx, buyer.id, {
          itemId: 'agua_purificada',
          quantity: 3,
          currency: 'crystal',
          unitPrice: 5,
        })
      );

      await db.$transaction((tx) => fulfillMarketBuyOrder(tx, sellerA.id, order.id, 1));
      await db.$transaction((tx) => fulfillMarketBuyOrder(tx, sellerB.id, order.id, 2));

      const [freshBuyer, freshA, freshB, freshOrder, trades, stack, notifications] =
        await Promise.all([
          db.player.findUniqueOrThrow({ where: { id: buyer.id } }),
          db.player.findUniqueOrThrow({ where: { id: sellerA.id } }),
          db.player.findUniqueOrThrow({ where: { id: sellerB.id } }),
          db.marketBuyOrder.findUniqueOrThrow({ where: { id: order.id } }),
          db.marketBuyOrderTrade.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } }),
          db.inventoryStack.findUniqueOrThrow({
            where: { playerId_itemId: { playerId: buyer.id, itemId: 'agua_purificada' } },
          }),
          db.playerNotification.findMany({
            where: { playerId: buyer.id, kind: 'market_buy_order_filled' },
          }),
        ]);

      expect(freshBuyer.crystals).toBe(35);
      expect(freshA.crystals).toBe(6);
      expect(freshB.crystals).toBe(12);
      expect(stack.quantity).toBe(3);
      expect(freshOrder.status).toBe('filled');
      expect(freshOrder.quantityRemaining).toBe(0);
      expect(freshOrder.filledAt).not.toBeNull();
      expect(trades.map((trade) => trade.quantity)).toEqual([1, 2]);
      expect(notifications).toHaveLength(2);

      const buyerDebits = await db.walletTransaction.findMany({
        where: { playerId: buyer.id, source: 'market_buy_order_escrow' },
      });
      expect(buyerDebits).toHaveLength(1);
      expect(buyerDebits[0]?.amount).toBe(-15);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('equipamento equipado não pode atender proposta, mas uma cópia reserva pode', async () => {
    const { db, dir } = await makeDb();
    try {
      const buyer = await createPlayer(db, 'BuyerEquipOrder', { zeni: 1_000 });
      const seller = await createPlayer(db, 'SellerEquipOrder', {
        items: JSON.stringify({
          weapon: null,
          armor: 'gi',
          accessory: null,
          accessory2: null,
          head: null,
          wrists: null,
          legs: null,
          boots: null,
          owned: ['gi'],
          consumables: {},
          stacks: {},
        }),
      });
      const order = await db.$transaction((tx) =>
        createMarketBuyOrder(tx, buyer.id, {
          itemId: 'gi',
          quantity: 1,
          currency: 'zeni',
          unitPrice: 200,
        })
      );

      let err: unknown;
      try {
        await db.$transaction((tx) => fulfillMarketBuyOrder(tx, seller.id, order.id, 1));
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('ITEM_EQUIPPED');
      expect((await db.marketBuyOrder.findUniqueOrThrow({ where: { id: order.id } })).quantityRemaining).toBe(1);

      const before = await db.player.findUniqueOrThrow({ where: { id: seller.id } });
      await db.player.update({
        where: { id: seller.id },
        data: { items: JSON.stringify({ ...JSON.parse(before.items), stacks: { gi: 2 } }) },
      });

      await db.$transaction((tx) => fulfillMarketBuyOrder(tx, seller.id, order.id, 1));
      const freshSeller = await db.player.findUniqueOrThrow({ where: { id: seller.id } });
      const freshBuyer = await db.player.findUniqueOrThrow({ where: { id: buyer.id } });
      expect(itemCount(parseItems(freshSeller.items), 'gi')).toBe(1);
      expect(parseItems(freshSeller.items).armor).toBe('gi');
      expect(itemCount(parseItems(freshBuyer.items), 'gi')).toBe(1);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('personagens da mesma conta não podem atender proposta entre si', async () => {
    const { db, dir } = await makeDb();
    try {
      const account = await db.account.create({
        data: { username: 'market_buy_order_same_' + Math.random().toString(36).slice(2, 7) },
      });
      const buyer = await createPlayer(db, 'SameBuyerOrder', { accountId: account.id, zeni: 500 });
      const seller = await createPlayer(db, 'SameSellerOrder', { accountId: account.id });
      await db.inventoryStack.create({
        data: { playerId: seller.id, itemId: 'erva_medicinal', quantity: 1 },
      });
      const order = await db.$transaction((tx) =>
        createMarketBuyOrder(tx, buyer.id, {
          itemId: 'erva_medicinal',
          quantity: 1,
          currency: 'zeni',
          unitPrice: 25,
        })
      );

      let err: unknown;
      try {
        await db.$transaction((tx) => fulfillMarketBuyOrder(tx, seller.id, order.id, 1));
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toContain('mesma conta');
      expect((await db.marketBuyOrder.findUniqueOrThrow({ where: { id: order.id } })).quantityRemaining).toBe(1);
      expect((await db.player.findUniqueOrThrow({ where: { id: seller.id } })).zeni).toBe(500);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('migration PostgreSQL possui constraints de integridade e índices das propostas', async () => {
    const sql = await Bun.file(
      `${import.meta.dir}/../supabase/migrations/20260922023000_market_buy_orders.sql`
    ).text();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS game."MarketBuyOrder"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS game."MarketBuyOrderTrade"');
    expect(sql).toContain('"MarketBuyOrder_currency_check"');
    expect(sql).toContain('"MarketBuyOrder_quantity_check"');
    expect(sql).toContain('"MarketBuyOrder_itemId_status_unitPrice_idx"');
    expect(sql).toContain('REFERENCES game."Player"("id") ON DELETE CASCADE');
  });
});
