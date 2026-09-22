import type { Player, Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { addCurrency, CURRENCY_CAP, spendCurrency } from '@/lib/economy';
import { createPlayerNotification } from '@/lib/game/notifications';
import {
  applyEquipmentBuy,
  applyEquipmentSell,
  itemCount,
  parseItems,
  updateJsonState,
} from '@/lib/game/engine';
import {
  EQUIPPED_SLOTS,
  EQUIPMENT_SLOTS,
  type MarketCurrency,
  type MarketListingKind,
  type MarketListingView,
  type MarketSellableAsset,
} from '@/lib/game/types';
import {
  getItem,
  getProfessionMaterial,
  SHOP_MAX_STACK,
} from '@/lib/game/content/world';
import { getCraftStackItem } from '@/lib/game/content/crafting';
import { publicCosmeticsFromRaw } from '@/lib/game/content/cosmetics';

type Tx = Prisma.TransactionClient;

export const MARKET_ACTIVE_LISTING_LIMIT = 20;
export const MARKET_MAX_UNIT_PRICE = 100_000_000;
export const MARKET_MAX_EQUIPMENT_QUANTITY = 99;
export const MARKET_MAX_MATERIAL_QUANTITY = 999;
export const MARKET_MATERIAL_STACK_CAP = 1_000_000;
export const MARKET_UNIQUE_ITEM_CAP = 200;

export interface MarketAssetDefinition {
  kind: MarketListingKind;
  itemId: string;
  name: string;
  icon: string;
  description?: string;
  category?: string;
  rarity?: string;
  tier?: number;
}

export function resolveMarketAsset(itemId: string): MarketAssetDefinition | null {
  const material = getProfessionMaterial(itemId);
  if (material) {
    return {
      kind: 'material',
      itemId,
      name: material.name,
      icon: material.icon,
      category: 'material',
      rarity: material.rarity,
      tier: material.tier,
    };
  }

  const craftStack = getCraftStackItem(itemId);
  if (craftStack) {
    return {
      kind: 'material',
      itemId,
      name: craftStack.name,
      icon: craftStack.icon,
      description: craftStack.description,
      category: craftStack.kind,
      tier: craftStack.tier,
    };
  }

  const item = getItem(itemId);
  if (item && EQUIPMENT_SLOTS.includes(item.category as (typeof EQUIPMENT_SLOTS)[number])) {
    return {
      kind: 'equipment',
      itemId,
      name: item.name,
      icon: item.icon,
      description: item.description,
      category: item.category,
    };
  }

  return null;
}

export function marketMaxQuantity(kind: MarketListingKind): number {
  return kind === 'material' ? MARKET_MAX_MATERIAL_QUANTITY : MARKET_MAX_EQUIPMENT_QUANTITY;
}

function validateListingInput(
  asset: MarketAssetDefinition,
  quantity: number,
  currency: MarketCurrency,
  unitPrice: number
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > marketMaxQuantity(asset.kind)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Quantidade inválida. Máximo por anúncio: ${marketMaxQuantity(asset.kind)}.`
    );
  }
  if (!['zeni', 'crystal'].includes(currency)) {
    throw new ApiError('VALIDATION_ERROR', 'Moeda inválida.');
  }
  if (!Number.isInteger(unitPrice) || unitPrice < 1 || unitPrice > MARKET_MAX_UNIT_PRICE) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Preço unitário inválido. Use um valor entre 1 e ${MARKET_MAX_UNIT_PRICE.toLocaleString('pt-BR')}.`
    );
  }
  if (unitPrice * quantity > CURRENCY_CAP) {
    throw new ApiError('VALIDATION_ERROR', 'O valor total do anúncio ultrapassa o limite seguro da economia.');
  }
}

function equippedCopies(player: Player, itemId: string): number {
  const items = parseItems(player.items);
  return EQUIPPED_SLOTS.filter((slot) => (items[slot] ?? null) === itemId).length;
}

export function sellableEquipmentQuantity(player: Player, itemId: string): number {
  const items = parseItems(player.items);
  return Math.max(0, itemCount(items, itemId) - equippedCopies(player, itemId));
}

async function removeFromSellerEscrow(
  tx: Tx,
  seller: Player,
  asset: MarketAssetDefinition,
  quantity: number
): Promise<void> {
  if (asset.kind === 'material') {
    const result = await tx.inventoryStack.updateMany({
      where: {
        playerId: seller.id,
        itemId: asset.itemId,
        quantity: { gte: quantity },
      },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) {
      const current = await tx.inventoryStack.findUnique({
        where: { playerId_itemId: { playerId: seller.id, itemId: asset.itemId } },
        select: { quantity: true },
      });
      throw new ApiError(
        'VALIDATION_ERROR',
        `Estoque insuficiente: você possui ${current?.quantity ?? 0} unidade(s) de ${asset.name}.`
      );
    }
    return;
  }

  const items = parseItems(seller.items);
  const total = itemCount(items, asset.itemId);
  const inUse = EQUIPPED_SLOTS.filter((slot) => (items[slot] ?? null) === asset.itemId).length;
  const available = Math.max(0, total - inUse);
  if (available < quantity) {
    if (total > 0 && available === 0 && inUse > 0) {
      throw new ApiError('ITEM_EQUIPPED', `${asset.name} está equipado. Desequipe antes de anunciar.`);
    }
    throw new ApiError(
      'VALIDATION_ERROR',
      `Você só tem ${available} unidade(s) livre(s) de ${asset.name} para anunciar.`
    );
  }
  if (!applyEquipmentSell(items, asset.itemId, quantity)) {
    throw new ApiError('CONFLICT', 'Inventário mudou — recarregue e tente novamente.');
  }
  await updateJsonState(tx, seller, { items: JSON.stringify(items) });
}

async function addMaterial(
  tx: Tx,
  playerId: string,
  itemId: string,
  quantity: number
): Promise<void> {
  const current = await tx.inventoryStack.findUnique({
    where: { playerId_itemId: { playerId, itemId } },
    select: { quantity: true },
  });
  if (current) {
    if (current.quantity + quantity > MARKET_MATERIAL_STACK_CAP) {
      throw new ApiError('VALIDATION_ERROR', 'O estoque deste material ficaria acima do limite permitido.');
    }
    const updated = await tx.inventoryStack.updateMany({
      where: {
        playerId,
        itemId,
        quantity: { lte: MARKET_MATERIAL_STACK_CAP - quantity },
      },
      data: { quantity: { increment: quantity } },
    });
    if (updated.count === 0) {
      throw new ApiError('CONFLICT', 'O estoque mudou — tente novamente.');
    }
    return;
  }

  await tx.inventoryStack.create({
    data: { playerId, itemId, quantity },
  });
}

async function addEquipment(
  tx: Tx,
  player: Player,
  itemId: string,
  quantity: number
): Promise<void> {
  const items = parseItems(player.items);
  const current = itemCount(items, itemId);
  if (current + quantity > SHOP_MAX_STACK) {
    throw new ApiError('VALIDATION_ERROR', `O inventário ficaria acima de ${SHOP_MAX_STACK} unidades deste equipamento.`);
  }
  if (current === 0 && items.owned.length >= MARKET_UNIQUE_ITEM_CAP) {
    throw new ApiError('VALIDATION_ERROR', `Inventário cheio: limite de ${MARKET_UNIQUE_ITEM_CAP} equipamentos diferentes.`);
  }
  applyEquipmentBuy(items, itemId, quantity);
  await updateJsonState(tx, player, { items: JSON.stringify(items) });
}

async function restoreEscrow(
  tx: Tx,
  player: Player,
  kind: MarketListingKind,
  itemId: string,
  quantity: number
): Promise<void> {
  if (kind === 'material') {
    await addMaterial(tx, player.id, itemId, quantity);
  } else {
    await addEquipment(tx, player, itemId, quantity);
  }
}

export async function createMarketListing(
  tx: Tx,
  sellerId: string,
  input: {
    itemId: string;
    quantity: number;
    currency: MarketCurrency;
    unitPrice: number;
  }
) {
  const seller = await tx.player.findUniqueOrThrow({ where: { id: sellerId } });
  if (seller.isBot) throw new ApiError('VALIDATION_ERROR', 'Bots não podem usar o mercado.');

  const asset = resolveMarketAsset(input.itemId);
  if (!asset) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Só materiais de craft e equipamentos podem ser anunciados no mercado.'
    );
  }
  validateListingInput(asset, input.quantity, input.currency, input.unitPrice);

  const active = await tx.marketListing.count({
    where: { sellerId, status: 'active' },
  });
  if (active >= MARKET_ACTIVE_LISTING_LIMIT) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Você já possui ${MARKET_ACTIVE_LISTING_LIMIT} anúncios ativos. Cancele ou aguarde uma venda.`
    );
  }

  await removeFromSellerEscrow(tx, seller, asset, input.quantity);

  return tx.marketListing.create({
    data: {
      sellerId,
      kind: asset.kind,
      itemId: asset.itemId,
      itemName: asset.name,
      itemIcon: asset.icon,
      currency: input.currency,
      unitPrice: input.unitPrice,
      quantity: input.quantity,
      quantityRemaining: input.quantity,
      status: 'active',
    },
  });
}

export async function cancelMarketListing(
  tx: Tx,
  sellerId: string,
  listingId: string
): Promise<void> {
  const listing = await tx.marketListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.sellerId !== sellerId) {
    throw new ApiError('NOT_FOUND', 'Anúncio não encontrado.');
  }
  if (listing.status !== 'active' || listing.quantityRemaining <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'Este anúncio não está mais ativo.');
  }

  const seller = await tx.player.findUniqueOrThrow({ where: { id: sellerId } });
  const remaining = listing.quantityRemaining;

  const claimed = await tx.marketListing.updateMany({
    where: { id: listing.id, sellerId, status: 'active', quantityRemaining: remaining },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      // Mantém a quantidade não vendida no histórico; ela é devolvida
      // ao inventário logo abaixo e o status impede novas compras.
    },
  });
  if (claimed.count === 0) {
    throw new ApiError('CONFLICT', 'O anúncio mudou enquanto você cancelava. Atualize o mercado.');
  }

  await restoreEscrow(tx, seller, listing.kind as MarketListingKind, listing.itemId, remaining);
}

export async function buyMarketListing(
  tx: Tx,
  buyerId: string,
  listingId: string,
  quantity: number
): Promise<{ itemName: string; totalPrice: number; currency: MarketCurrency }> {
  const listing = await tx.marketListing.findUnique({
    where: { id: listingId },
    include: { seller: true },
  });
  if (!listing || listing.status !== 'active') {
    throw new ApiError('NOT_FOUND', 'Este anúncio não está mais disponível.');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > listing.quantityRemaining) {
    throw new ApiError('VALIDATION_ERROR', 'Quantidade de compra inválida para este anúncio.');
  }
  if (buyerId === listing.sellerId) {
    throw new ApiError('VALIDATION_ERROR', 'Você não pode comprar seu próprio anúncio.');
  }

  const buyer = await tx.player.findUniqueOrThrow({ where: { id: buyerId } });
  if (
    buyer.accountId &&
    listing.seller.accountId &&
    buyer.accountId === listing.seller.accountId
  ) {
    throw new ApiError('VALIDATION_ERROR', 'Personagens da mesma conta não podem negociar entre si.');
  }

  const currency = listing.currency as MarketCurrency;
  const totalPrice = listing.unitPrice * quantity;
  if (!Number.isSafeInteger(totalPrice) || totalPrice <= 0 || totalPrice > CURRENCY_CAP) {
    throw new ApiError('VALIDATION_ERROR', 'Valor total inválido.');
  }

  const sellerBalance = currency === 'zeni' ? listing.seller.zeni : listing.seller.crystals;
  if (sellerBalance + totalPrice > CURRENCY_CAP) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'O vendedor está no limite desta moeda. Tente novamente mais tarde.'
    );
  }

  // Reserva atomicamente as unidades antes de tocar em inventário/moeda.
  const claimed = await tx.marketListing.updateMany({
    where: {
      id: listing.id,
      status: 'active',
      quantityRemaining: { gte: quantity },
    },
    data: { quantityRemaining: { decrement: quantity } },
  });
  if (claimed.count === 0) {
    throw new ApiError('CONFLICT', 'Outro jogador comprou estas unidades primeiro. Atualize o mercado.');
  }

  // A entrega também é transacional; qualquer falha desfaz a reserva acima.
  await restoreEscrow(
    tx,
    buyer,
    listing.kind as MarketListingKind,
    listing.itemId,
    quantity
  );

  await spendCurrency(tx, buyer.id, currency, totalPrice, {
    type: 'spend',
    source: 'market_buy',
    accountId: buyer.accountId,
    metadata: {
      listingId: listing.id,
      sellerId: listing.sellerId,
      itemId: listing.itemId,
      quantity,
      unitPrice: listing.unitPrice,
      totalPrice,
    },
  });
  await addCurrency(tx, listing.sellerId, currency, totalPrice, {
    type: 'earn',
    source: 'market_sell',
    accountId: listing.seller.accountId,
    metadata: {
      listingId: listing.id,
      buyerId: buyer.id,
      itemId: listing.itemId,
      quantity,
      unitPrice: listing.unitPrice,
      totalPrice,
    },
  });

  const after = await tx.marketListing.findUniqueOrThrow({
    where: { id: listing.id },
    select: { quantityRemaining: true },
  });
  if (after.quantityRemaining === 0) {
    await tx.marketListing.update({
      where: { id: listing.id },
      data: { status: 'sold', soldAt: new Date() },
    });
  }

  await tx.marketTrade.create({
    data: {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: listing.sellerId,
      quantity,
      unitPrice: listing.unitPrice,
      totalPrice,
      currency,
    },
  });

  const currencyText =
    currency === 'crystal'
      ? `${totalPrice} 💎`
      : `${totalPrice.toLocaleString('pt-BR')} Zeni`;
  await createPlayerNotification(tx, {
    playerId: listing.sellerId,
    kind: 'market_sold',
    title: '💰 Venda no Mercado',
    message: `${buyer.name} comprou ${quantity}× ${listing.itemName} por ${currencyText}.`,
    metadata: {
      listingId: listing.id,
      buyerId: buyer.id,
      itemId: listing.itemId,
      quantity,
      currency,
      totalPrice,
    },
  });

  return { itemName: listing.itemName, totalPrice, currency };
}

export function marketListingToView(
  listing: {
    id: string;
    sellerId: string;
    kind: string;
    itemId: string;
    itemName: string;
    itemIcon: string;
    currency: string;
    unitPrice: number;
    quantity: number;
    quantityRemaining: number;
    status: string;
    createdAt: Date;
    soldAt: Date | null;
    cancelledAt: Date | null;
    seller: {
      name: string;
      race: string;
      avatarUrl: string | null;
      cosmeticsEquipped: string | null;
    };
  },
  viewerId: string
): MarketListingView {
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    sellerName: listing.seller.name,
    sellerRace: listing.seller.race as MarketListingView['sellerRace'],
    sellerAvatarUrl: listing.seller.avatarUrl,
    sellerCosmetics: publicCosmeticsFromRaw(listing.seller.cosmeticsEquipped),
    kind: listing.kind as MarketListingKind,
    itemId: listing.itemId,
    itemName: listing.itemName,
    itemIcon: listing.itemIcon,
    currency: listing.currency as MarketCurrency,
    unitPrice: listing.unitPrice,
    quantity: listing.quantity,
    quantityRemaining: listing.quantityRemaining,
    status: listing.status as MarketListingView['status'],
    createdAt: listing.createdAt.toISOString(),
    soldAt: listing.soldAt?.toISOString() ?? null,
    cancelledAt: listing.cancelledAt?.toISOString() ?? null,
    isMine: listing.sellerId === viewerId,
  };
}

export async function marketSellableAssets(
  tx: Tx,
  playerId: string
): Promise<MarketSellableAsset[]> {
  const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
  const materials = await tx.inventoryStack.findMany({
    where: { playerId, quantity: { gt: 0 } },
    orderBy: [{ itemId: 'asc' }],
  });

  const materialViews: MarketSellableAsset[] = [];
  for (const row of materials) {
    const asset = resolveMarketAsset(row.itemId);
    if (!asset || asset.kind !== 'material') continue;
    materialViews.push({
      kind: 'material',
      itemId: asset.itemId,
      name: asset.name,
      icon: asset.icon,
      quantity: row.quantity,
      description: asset.description,
      category: asset.category,
      rarity: asset.rarity,
      tier: asset.tier,
    });
  }

  const items = parseItems(player.items);
  const equipmentViews: MarketSellableAsset[] = [];
  for (const itemId of items.owned) {
    const asset = resolveMarketAsset(itemId);
    if (!asset || asset.kind !== 'equipment') continue;
    const total = itemCount(items, itemId);
    const inUse = EQUIPPED_SLOTS.filter((slot) => (items[slot] ?? null) === itemId).length;
    const available = Math.max(0, total - inUse);
    if (available <= 0) continue;
    equipmentViews.push({
      kind: 'equipment',
      itemId,
      name: asset.name,
      icon: asset.icon,
      quantity: available,
      description: asset.description,
      category: asset.category,
    });
  }

  return [...materialViews, ...equipmentViews].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'pt-BR')
  );
}
