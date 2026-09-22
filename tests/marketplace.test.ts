import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { ApiError } from '../src/lib/api';
import { initialPlayerData } from '../src/lib/game/characterInitial';
import { applyPendingMigrations } from '../src/lib/game/persistence';
import {
  buyMarketListing,
  cancelMarketListing,
  createMarketListing,
  marketSellableAssets,
  resolveMarketAsset,
} from '../src/lib/game/marketplace';
import { itemCount, parseItems } from '../src/lib/game/engine';

async function makeDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-market-'));
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
          username: `market_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Math.random().toString(36).slice(2, 7)}`,
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

describe('Mercado P2P — catálogo e escrow', () => {
  test('aceita materiais + equipamentos de loja/oficina e rejeita consumíveis/treino', () => {
    expect(resolveMarketAsset('erva_medicinal')?.kind).toBe('material');
    expect(resolveMarketAsset('esquema_gravidade_alterada')?.kind).toBe('material');
    expect(resolveMarketAsset('gi')?.kind).toBe('equipment');
    expect(resolveMarketAsset('espada_gravidade_100x')?.kind).toBe('equipment');
    expect(resolveMarketAsset('capsula_ki')).toBeNull();
    expect(resolveMarketAsset('gi_ponderado')).toBeNull();
  });

  test('criar anúncio de material tira as unidades imediatamente; cancelar devolve', async () => {
    const { db, dir } = await makeDb();
    try {
      const seller = await createPlayer(db, 'SellerMaterial');
      await db.inventoryStack.create({
        data: { playerId: seller.id, itemId: 'erva_medicinal', quantity: 10 },
      });

      const listing = await db.$transaction((tx) =>
        createMarketListing(tx, seller.id, {
          itemId: 'erva_medicinal',
          quantity: 4,
          currency: 'zeni',
          unitPrice: 25,
        })
      );

      expect(
        (
          await db.inventoryStack.findUniqueOrThrow({
            where: { playerId_itemId: { playerId: seller.id, itemId: 'erva_medicinal' } },
          })
        ).quantity
      ).toBe(6);
      expect(listing.quantityRemaining).toBe(4);
      expect(listing.status).toBe('active');

      await db.$transaction((tx) => cancelMarketListing(tx, seller.id, listing.id));

      expect(
        (
          await db.inventoryStack.findUniqueOrThrow({
            where: { playerId_itemId: { playerId: seller.id, itemId: 'erva_medicinal' } },
          })
        ).quantity
      ).toBe(10);
      const cancelled = await db.marketListing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.quantityRemaining).toBe(4);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('equipamento em uso não pode entrar no escrow; reserva livre pode', async () => {
    const { db, dir } = await makeDb();
    try {
      const equippedOnly = JSON.stringify({
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
      });
      const seller = await createPlayer(db, 'SellerEquip', { items: equippedOnly });

      let err: unknown;
      try {
        await db.$transaction((tx) =>
          createMarketListing(tx, seller.id, {
            itemId: 'gi',
            quantity: 1,
            currency: 'zeni',
            unitPrice: 200,
          })
        );
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('ITEM_EQUIPPED');

      await db.player.update({
        where: { id: seller.id },
        data: {
          items: JSON.stringify({
            ...JSON.parse(equippedOnly),
            stacks: { gi: 2 },
          }),
        },
      });

      const listing = await db.$transaction((tx) =>
        createMarketListing(tx, seller.id, {
          itemId: 'gi',
          quantity: 1,
          currency: 'zeni',
          unitPrice: 200,
        })
      );
      expect(listing.status).toBe('active');

      const fresh = await db.player.findUniqueOrThrow({ where: { id: seller.id } });
      const items = parseItems(fresh.items);
      expect(itemCount(items, 'gi')).toBe(1);
      expect(items.armor).toBe('gi');
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Mercado P2P — compra atômica', () => {
  test('compra em Zeni transfere material, saldo, ledger, trade e notificação', async () => {
    const { db, dir } = await makeDb();
    try {
      const seller = await createPlayer(db, 'SellerZeni', { zeni: 500 });
      const buyer = await createPlayer(db, 'BuyerZeni', { zeni: 500 });
      await db.inventoryStack.create({
        data: { playerId: seller.id, itemId: 'erva_medicinal', quantity: 5 },
      });

      const listing = await db.$transaction((tx) =>
        createMarketListing(tx, seller.id, {
          itemId: 'erva_medicinal',
          quantity: 5,
          currency: 'zeni',
          unitPrice: 20,
        })
      );

      await db.$transaction((tx) => buyMarketListing(tx, buyer.id, listing.id, 2));

      const [freshSeller, freshBuyer, buyerStack, freshListing, trades, ledger, notifications] =
        await Promise.all([
          db.player.findUniqueOrThrow({ where: { id: seller.id } }),
          db.player.findUniqueOrThrow({ where: { id: buyer.id } }),
          db.inventoryStack.findUniqueOrThrow({
            where: { playerId_itemId: { playerId: buyer.id, itemId: 'erva_medicinal' } },
          }),
          db.marketListing.findUniqueOrThrow({ where: { id: listing.id } }),
          db.marketTrade.findMany({ where: { listingId: listing.id } }),
          db.walletTransaction.findMany({
            where: { source: { in: ['market_buy', 'market_sell'] } },
            orderBy: { amount: 'asc' },
          }),
          db.playerNotification.findMany({
            where: { playerId: seller.id, kind: 'market_sold' },
          }),
        ]);

      expect(freshBuyer.zeni).toBe(460);
      expect(freshSeller.zeni).toBe(540);
      expect(buyerStack.quantity).toBe(2);
      expect(freshListing.quantityRemaining).toBe(3);
      expect(freshListing.status).toBe('active');
      expect(trades).toHaveLength(1);
      expect(trades[0]?.totalPrice).toBe(40);
      expect(ledger.map((row) => [row.source, row.amount])).toEqual([
        ['market_buy', -40],
        ['market_sell', 40],
      ]);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.message).toContain('2×');
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('compra parcial por compradores diferentes fecha lote e preserva histórico', async () => {
    const { db, dir } = await makeDb();
    try {
      const seller = await createPlayer(db, 'SellerPartial', { crystals: 5 });
      const buyerA = await createPlayer(db, 'BuyerA', { crystals: 20 });
      const buyerB = await createPlayer(db, 'BuyerB', { crystals: 20 });
      await db.inventoryStack.create({
        data: { playerId: seller.id, itemId: 'agua_purificada', quantity: 3 },
      });

      const listing = await db.$transaction((tx) =>
        createMarketListing(tx, seller.id, {
          itemId: 'agua_purificada',
          quantity: 3,
          currency: 'crystal',
          unitPrice: 4,
        })
      );

      await db.$transaction((tx) => buyMarketListing(tx, buyerA.id, listing.id, 1));
      await db.$transaction((tx) => buyMarketListing(tx, buyerB.id, listing.id, 2));

      const fresh = await db.marketListing.findUniqueOrThrow({ where: { id: listing.id } });
      const trades = await db.marketTrade.findMany({
        where: { listingId: listing.id },
        orderBy: { createdAt: 'asc' },
      });
      const freshSeller = await db.player.findUniqueOrThrow({ where: { id: seller.id } });
      const freshA = await db.player.findUniqueOrThrow({ where: { id: buyerA.id } });
      const freshB = await db.player.findUniqueOrThrow({ where: { id: buyerB.id } });

      expect(fresh.status).toBe('sold');
      expect(fresh.quantityRemaining).toBe(0);
      expect(fresh.soldAt).not.toBeNull();
      expect(trades.map((trade) => trade.quantity)).toEqual([1, 2]);
      expect(freshSeller.crystals).toBe(17);
      expect(freshA.crystals).toBe(16);
      expect(freshB.crystals).toBe(12);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('equipamento produzido na Oficina pode ser transferido e entra no inventário do comprador', async () => {
    const { db, dir } = await makeDb();
    try {
      const items = JSON.stringify({
        weapon: null,
        armor: null,
        accessory: null,
        accessory2: null,
        head: null,
        wrists: null,
        legs: null,
        boots: null,
        owned: ['espada_gravidade_100x'],
        consumables: {},
        stacks: {},
      });
      const seller = await createPlayer(db, 'CraftSeller', { items });
      const buyer = await createPlayer(db, 'CraftBuyer', { zeni: 1000 });

      const listing = await db.$transaction((tx) =>
        createMarketListing(tx, seller.id, {
          itemId: 'espada_gravidade_100x',
          quantity: 1,
          currency: 'zeni',
          unitPrice: 600,
        })
      );
      await db.$transaction((tx) => buyMarketListing(tx, buyer.id, listing.id, 1));

      const freshSeller = await db.player.findUniqueOrThrow({ where: { id: seller.id } });
      const freshBuyer = await db.player.findUniqueOrThrow({ where: { id: buyer.id } });
      expect(itemCount(parseItems(freshSeller.items), 'espada_gravidade_100x')).toBe(0);
      expect(itemCount(parseItems(freshBuyer.items), 'espada_gravidade_100x')).toBe(1);
      expect(freshBuyer.zeni).toBe(400);
      expect(freshSeller.zeni).toBe(1100);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('personagens da mesma conta não podem usar mercado como transferência interna', async () => {
    const { db, dir } = await makeDb();
    try {
      const account = await db.account.create({
        data: { username: 'market_same_account_' + Math.random().toString(36).slice(2, 7) },
      });
      const seller = await createPlayer(db, 'SameSeller', { accountId: account.id });
      const buyer = await createPlayer(db, 'SameBuyer', { accountId: account.id, zeni: 500 });
      await db.inventoryStack.create({
        data: { playerId: seller.id, itemId: 'erva_medicinal', quantity: 1 },
      });
      const listing = await db.$transaction((tx) =>
        createMarketListing(tx, seller.id, {
          itemId: 'erva_medicinal',
          quantity: 1,
          currency: 'zeni',
          unitPrice: 10,
        })
      );

      let err: unknown;
      try {
        await db.$transaction((tx) => buyMarketListing(tx, buyer.id, listing.id, 1));
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toContain('mesma conta');
      expect((await db.marketListing.findUniqueOrThrow({ where: { id: listing.id } })).quantityRemaining).toBe(1);
      expect((await db.player.findUniqueOrThrow({ where: { id: buyer.id } })).zeni).toBe(500);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('ativos vendáveis nunca incluem equipamento atualmente equipado', async () => {
    const { db, dir } = await makeDb();
    try {
      const player = await createPlayer(db, 'Sellable', {
        items: JSON.stringify({
          weapon: 'katana',
          armor: null,
          accessory: null,
          accessory2: null,
          head: null,
          wrists: null,
          legs: null,
          boots: null,
          owned: ['katana', 'gi'],
          consumables: {},
          stacks: { katana: 2 },
        }),
      });
      await db.inventoryStack.create({
        data: { playerId: player.id, itemId: 'erva_medicinal', quantity: 4 },
      });

      const assets = await db.$transaction((tx) => marketSellableAssets(tx, player.id));
      expect(assets.find((asset) => asset.itemId === 'katana')?.quantity).toBe(1);
      expect(assets.find((asset) => asset.itemId === 'gi')?.quantity).toBe(1);
      expect(assets.find((asset) => asset.itemId === 'erva_medicinal')?.quantity).toBe(4);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Mercado P2P — contratos de produção', () => {
  test('PostgreSQL tem checks, histórico e índices para o mercado', async () => {
    const sql = await Bun.file(
      `${import.meta.dir}/../supabase/migrations/20260921224500_player_marketplace.sql`
    ).text();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS game."MarketListing"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS game."MarketTrade"');
    expect(sql).toContain('"MarketListing_currency_check"');
    expect(sql).toContain('"MarketListing_quantity_check"');
    expect(sql).toContain('"MarketTrade_sellerId_createdAt_idx"');
  });

  test('API tem autorização, rate limit, idempotência e revalidação transacional', async () => {
    const route = await Bun.file(
      `${import.meta.dir}/../src/app/api/game/market/route.ts`
    ).text();
    expect(route).toContain('requireAuth()');
    expect(route).toContain('requirePlayer(auth, input.playerId, tx)');
    expect(route).toContain('requestDedup.create');
    expect(route).toContain("error.code === 'P2002'");
    expect(route).toContain('market-write:');
    expect(route).toContain('db.$transaction');
  });

  test('interface e navegação expõem comprar, vender, Zeni e Diamantes', async () => {
    const panel = await Bun.file(
      `${import.meta.dir}/../src/components/game/MarketPanel.tsx`
    ).text();
    const page = await Bun.file(
      `${import.meta.dir}/../src/app/jogar/page.tsx`
    ).text();
    expect(panel).toContain('Mercado dos Guerreiros');
    expect(panel).toContain('Materiais de craft');
    expect(panel).toContain('Equipamentos');
    expect(panel).toContain('Diamantes');
    expect(panel).toContain('escrow');
    expect(page).toContain("key: 'market'");
    expect(page).toContain('<MarketPanel');
  });

  test('backup lógico inclui anúncios e trades', async () => {
    const persistence = await Bun.file(
      `${import.meta.dir}/../src/lib/game/persistence.ts`
    ).text();
    expect(persistence).toContain('MarketListing: marketListings');
    expect(persistence).toContain('MarketTrade: marketTrades');
  });
});
