import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import {
  MARKET_ACTIVE_BUY_ORDER_LIMIT,
  MARKET_ACTIVE_LISTING_LIMIT,
  buyMarketListing,
  cancelMarketBuyOrder,
  cancelMarketListing,
  createMarketBuyOrder,
  createMarketListing,
  fulfillMarketBuyOrder,
  marketBuyOrderToView,
  marketListingToView,
  marketSellableAssets,
  marketTradableAssets,
} from '@/lib/game/marketplace';
import type {
  MarketCurrency,
  MarketListingKind,
  MarketPage,
} from '@/lib/game/types';

export const dynamic = 'force-dynamic';

const mutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    playerId: z.string().min(1),
    requestId: z.string().uuid(),
    itemId: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(999),
    currency: z.enum(['zeni', 'crystal']),
    unitPrice: z.number().int().min(1).max(100_000_000),
  }),
  z.object({
    action: z.literal('buy'),
    playerId: z.string().min(1),
    requestId: z.string().uuid(),
    listingId: z.string().min(1),
    quantity: z.number().int().min(1).max(999),
  }),
  z.object({
    action: z.literal('cancel'),
    playerId: z.string().min(1),
    requestId: z.string().uuid(),
    listingId: z.string().min(1),
  }),
  z.object({
    action: z.literal('create_buy_order'),
    playerId: z.string().min(1),
    requestId: z.string().uuid(),
    itemId: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(999),
    currency: z.enum(['zeni', 'crystal']),
    unitPrice: z.number().int().min(1).max(100_000_000),
  }),
  z.object({
    action: z.literal('fulfill_buy_order'),
    playerId: z.string().min(1),
    requestId: z.string().uuid(),
    orderId: z.string().min(1),
    quantity: z.number().int().min(1).max(999),
  }),
  z.object({
    action: z.literal('cancel_buy_order'),
    playerId: z.string().min(1),
    requestId: z.string().uuid(),
    orderId: z.string().min(1),
  }),
]);

function listingInclude() {
  return {
    seller: {
      select: {
        name: true,
        race: true,
        avatarUrl: true,
        cosmeticsEquipped: true,
      },
    },
  } as const;
}

function buyOrderInclude() {
  return {
    buyer: {
      select: {
        name: true,
        race: true,
        avatarUrl: true,
        cosmeticsEquipped: true,
      },
    },
  } as const;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const rl = rateLimit(`market-read:${auth.session.id}`, 120, 60_000);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', 'Muitas atualizações do mercado. Aguarde um instante.');
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') ?? '';
    const player = await requirePlayer(auth, playerId);

    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.min(40, Math.max(10, Number(url.searchParams.get('pageSize') ?? 20) || 20));
    const kindRaw = url.searchParams.get('kind');
    const currencyRaw = url.searchParams.get('currency');
    const sort = url.searchParams.get('sort') ?? 'recent';
    const kind: MarketListingKind | null =
      kindRaw === 'material' || kindRaw === 'equipment' ? kindRaw : null;
    const currency: MarketCurrency | null =
      currencyRaw === 'zeni' || currencyRaw === 'crystal' ? currencyRaw : null;

    const where: Prisma.MarketListingWhereInput = {
      status: 'active',
      quantityRemaining: { gt: 0 },
      ...(kind ? { kind } : {}),
      ...(currency ? { currency } : {}),
    };

    const orderBy: Prisma.MarketListingOrderByWithRelationInput[] =
      sort === 'price_asc'
        ? [{ unitPrice: 'asc' }, { createdAt: 'desc' }]
        : sort === 'price_desc'
          ? [{ unitPrice: 'desc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }];
    const buyOrderWhere: Prisma.MarketBuyOrderWhereInput = {
      status: 'active',
      quantityRemaining: { gt: 0 },
      ...(kind ? { kind } : {}),
      ...(currency ? { currency } : {}),
    };
    const buyOrderOrderBy: Prisma.MarketBuyOrderOrderByWithRelationInput[] =
      sort === 'price_asc'
        ? [{ unitPrice: 'asc' }, { createdAt: 'desc' }]
        : sort === 'price_desc'
          ? [{ unitPrice: 'desc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }];

    const catalog = marketTradableAssets();
    const market = await db.$transaction(async (tx) => {
      const [total, rows, mine, sellable, buyOrderTotal, buyOrders, myBuyOrders] = await Promise.all([
        tx.marketListing.count({ where }),
        tx.marketListing.findMany({
          where,
          include: listingInclude(),
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.marketListing.findMany({
          where: { sellerId: player.id },
          include: listingInclude(),
          orderBy: [{ createdAt: 'desc' }],
          take: 30,
        }),
        marketSellableAssets(tx, player.id),
        tx.marketBuyOrder.count({ where: buyOrderWhere }),
        tx.marketBuyOrder.findMany({
          where: buyOrderWhere,
          include: buyOrderInclude(),
          orderBy: buyOrderOrderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.marketBuyOrder.findMany({
          where: { buyerId: player.id },
          include: buyOrderInclude(),
          orderBy: [{ createdAt: 'desc' }],
          take: 30,
        }),
      ]);

      const result: MarketPage = {
        listings: rows.map((row) => marketListingToView(row, player.id)),
        myListings: mine.map((row) => marketListingToView(row, player.id)),
        buyOrders: buyOrders.map((row) => marketBuyOrderToView(row, player.id)),
        myBuyOrders: myBuyOrders.map((row) => marketBuyOrderToView(row, player.id)),
        sellable,
        catalog,
        total,
        buyOrderTotal,
        page,
        pageSize,
        activeLimit: MARKET_ACTIVE_LISTING_LIMIT,
        buyOrderActiveLimit: MARKET_ACTIVE_BUY_ORDER_LIMIT,
      };
      return result;
    });

    return ok({ market, serverNow: new Date().toISOString() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let dedupKey: { playerId: string; requestId: string } | null = null;
  try {
    const auth = await requireAuth();
    const ip = clientIp(request);
    const sessionLimit = rateLimit(`market-write:${auth.session.id}`, 60, 60_000);
    const ipLimit = rateLimit(`market-write-ip:${ip}`, 180, 60_000);
    if (!sessionLimit.allowed || !ipLimit.allowed) {
      throw new ApiError('RATE_LIMITED', 'Muitas operações no mercado. Aguarde um instante.');
    }

    const body = await request.json();
    const parsed = mutationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Operação inválida.');
    }
    const input = parsed.data;
    await requirePlayer(auth, input.playerId);

    try {
      await db.requestDedup.create({
        data: { playerId: input.playerId, requestId: input.requestId },
      });
      dedupKey = { playerId: input.playerId, requestId: input.requestId };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await db.requestDedup.findUnique({
          where: {
            playerId_requestId: {
              playerId: input.playerId,
              requestId: input.requestId,
            },
          },
        });
        if (existing?.result) {
          const cached = JSON.parse(existing.result) as { message: string };
          return ok({ ...cached, deduplicated: true });
        }
        throw new ApiError('CONFLICT', 'Esta operação ainda está sendo processada.');
      }
      throw error;
    }

    let message = '';
    await db.$transaction(
      async (tx) => {
        // Revalida o personagem DENTRO da transação: playerId nunca é autorização.
        await requirePlayer(auth, input.playerId, tx);

        if (input.action === 'create') {
          const listing = await createMarketListing(tx, input.playerId, {
            itemId: input.itemId,
            quantity: input.quantity,
            currency: input.currency,
            unitPrice: input.unitPrice,
          });
          const total = input.unitPrice * input.quantity;
          const price =
            input.currency === 'crystal'
              ? `${total} 💎`
              : `${total.toLocaleString('pt-BR')} Créditos`;
          message = `Anúncio criado: ${input.quantity}× ${listing.itemName} por ${price} no total.`;
          return;
        }

        if (input.action === 'buy') {
          const result = await buyMarketListing(
            tx,
            input.playerId,
            input.listingId,
            input.quantity
          );
          const price =
            result.currency === 'crystal'
              ? `${result.totalPrice} 💎`
              : `${result.totalPrice.toLocaleString('pt-BR')} Créditos`;
          message = `Compra concluída: ${input.quantity}× ${result.itemName} por ${price}.`;
          return;
        }

        if (input.action === 'cancel') {
          await cancelMarketListing(tx, input.playerId, input.listingId);
          message = 'Anúncio cancelado. Os itens restantes voltaram ao seu inventário.';
          return;
        }

        if (input.action === 'create_buy_order') {
          const order = await createMarketBuyOrder(tx, input.playerId, {
            itemId: input.itemId,
            quantity: input.quantity,
            currency: input.currency,
            unitPrice: input.unitPrice,
          });
          const total = input.unitPrice * input.quantity;
          const price =
            input.currency === 'crystal'
              ? `${total} 💎`
              : `${total.toLocaleString('pt-BR')} Créditos`;
          message = `Proposta criada: você quer ${input.quantity}× ${order.itemName} por ${price} no total. O valor ficou reservado.`;
          return;
        }

        if (input.action === 'fulfill_buy_order') {
          const result = await fulfillMarketBuyOrder(
            tx,
            input.playerId,
            input.orderId,
            input.quantity
          );
          const price =
            result.currency === 'crystal'
              ? `${result.totalPrice} 💎`
              : `${result.totalPrice.toLocaleString('pt-BR')} Créditos`;
          message = `Venda rápida concluída: ${input.quantity}× ${result.itemName} por ${price}.`;
          return;
        }

        const cancelled = await cancelMarketBuyOrder(tx, input.playerId, input.orderId);
        const refund =
          cancelled.currency === 'crystal'
            ? `${cancelled.refunded} 💎`
            : `${cancelled.refunded.toLocaleString('pt-BR')} Créditos`;
        message = `Proposta cancelada. ${refund} do escrow voltaram ao seu saldo.`;
      },
      { timeout: 20_000, maxWait: 10_000 }
    );

    const cached = { message };
    if (dedupKey) {
      await db.requestDedup
        .update({
          where: { playerId_requestId: dedupKey },
          data: { result: JSON.stringify(cached) },
        })
        .catch(() => undefined);
      dedupKey = null;
    }

    return ok({ ...cached, deduplicated: false });
  } catch (error) {
    if (dedupKey) {
      await db.requestDedup
        .deleteMany({
          where: {
            playerId: dedupKey.playerId,
            requestId: dedupKey.requestId,
            result: null,
          },
        })
        .catch(() => undefined);
    }
    return toErrorResponse(error);
  }
}
