'use client';

import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { HandCoins, PackageCheck, XCircle } from 'lucide-react';
import type {
  MarketBuyOrderView,
  MarketCurrency,
  MarketListingKind,
  MarketPage,
  PlayerView,
} from '@/lib/game/types';
import { Chip, GameButton, GameCard } from './Bits';
import { PublicPlayerIdentity } from './PublicPlayerIdentity';

type KindFilter = 'all' | MarketListingKind;
type CurrencyFilter = 'all' | MarketCurrency;
type SortMode = 'recent' | 'price_asc' | 'price_desc';

function currencyText(currency: MarketCurrency, amount: number) {
  return currency === 'crystal'
    ? amount.toLocaleString('pt-BR') + ' 💎'
    : amount.toLocaleString('pt-BR') + ' Créditos';
}

function Empty({ text }: { text: string }) {
  return <GameCard className="p-8 text-center text-sm text-amber-200/45">{text}</GameCard>;
}

export function MarketBuyOrdersTab({
  market,
  player,
  busy,
  kind,
  currency,
  sort,
  setKind,
  setCurrency,
  setSort,
  page,
  setPage,
  onMutate,
}: {
  market: MarketPage;
  player: PlayerView;
  busy: boolean;
  kind: KindFilter;
  currency: CurrencyFilter;
  sort: SortMode;
  setKind: Dispatch<SetStateAction<KindFilter>>;
  setCurrency: Dispatch<SetStateAction<CurrencyFilter>>;
  setSort: Dispatch<SetStateAction<SortMode>>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  onMutate: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState(market.catalog[0]?.itemId ?? '');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(1);
  const [draftCurrency, setDraftCurrency] = useState<MarketCurrency>('zeni');
  const [sellQty, setSellQty] = useState<Record<string, number>>({});

  const selected = market.catalog.find((asset) => asset.itemId === selectedId) ?? null;
  const maxQuantity = selected?.kind === 'equipment' ? 99 : 999;
  const normalizedQuantity = Math.max(1, Math.min(maxQuantity, Math.trunc(quantity) || 1));
  const normalizedPrice = Math.max(1, Math.min(100_000_000, Math.trunc(unitPrice) || 1));
  const total = normalizedQuantity * normalizedPrice;
  const balance = draftCurrency === 'crystal' ? player.crystals : player.zeni;
  const insufficient = total > balance;

  const sellableById = useMemo(
    () => new Map(market.sellable.map((asset) => [asset.itemId, asset.quantity])),
    [market.sellable]
  );
  const activeMine = market.myBuyOrders.filter((order) => order.status === 'active').length;
  const totalPages = Math.max(1, Math.ceil(market.buyOrderTotal / market.pageSize));

  return (
    <div className="space-y-5">
      <GameCard className="p-4">
        <div className="flex items-start gap-3">
          <HandCoins className="mt-0.5 h-5 w-5 text-emerald-300" />
          <div>
            <h3 className="font-heading text-amber-100">Criar proposta de compra</h3>
            <p className="mt-1 text-xs text-amber-200/45">
              Diga quanto paga por um item. O valor total fica reservado imediatamente em escrow,
              então vendedores sabem que a proposta é garantida.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <label className="md:col-span-2 text-[10px] text-amber-200/45">
            Item desejado
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setQuantity(1);
              }}
              className="mt-1 w-full rounded-lg border border-amber-900/50 bg-[#160f08] px-3 py-2 text-xs text-amber-100"
            >
              {market.catalog.map((asset) => (
                <option key={asset.itemId} value={asset.itemId}>
                  {asset.icon} {asset.name} · {asset.kind === 'material' ? 'Material' : 'Equipamento'}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[10px] text-amber-200/45">
            Quantidade
            <input
              type="number"
              min={1}
              max={maxQuantity}
              value={normalizedQuantity}
              onChange={(event) =>
                setQuantity(Math.max(1, Math.min(maxQuantity, Math.trunc(Number(event.target.value) || 1))))
              }
              className="mt-1 w-full rounded-lg border border-amber-900/50 bg-black/30 px-2 py-2 text-sm text-amber-100"
            />
          </label>

          <label className="text-[10px] text-amber-200/45">
            Valor por unidade
            <input
              type="number"
              min={1}
              max={100_000_000}
              value={normalizedPrice}
              onChange={(event) =>
                setUnitPrice(Math.max(1, Math.min(100_000_000, Math.trunc(Number(event.target.value) || 1))))
              }
              className="mt-1 w-full rounded-lg border border-amber-900/50 bg-black/30 px-2 py-2 text-sm text-amber-100"
            />
          </label>

          <label className="text-[10px] text-amber-200/45">
            Moeda
            <select
              value={draftCurrency}
              onChange={(event) => setDraftCurrency(event.target.value as MarketCurrency)}
              className="mt-1 w-full rounded-lg border border-amber-900/50 bg-[#160f08] px-2 py-2 text-xs text-amber-100"
            >
              <option value="zeni">Zeni</option>
              <option value="crystal">Diamantes 💎</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-amber-900/25 pt-3">
          <div className="text-xs text-amber-200/50">
            Total reservado:{' '}
            <span className={draftCurrency === 'crystal' ? 'font-heading text-sky-300' : 'font-heading text-yellow-300'}>
              {currencyText(draftCurrency, total)}
            </span>
            <span className="ml-2 opacity-60">
              · {activeMine}/{market.buyOrderActiveLimit} propostas ativas
            </span>
          </div>
          <GameButton
            size="sm"
            variant="gold"
            disabled={busy || !selected || insufficient || total > 2_000_000_000}
            onClick={() =>
              void onMutate({
                action: 'create_buy_order',
                itemId: selected?.itemId,
                quantity: normalizedQuantity,
                currency: draftCurrency,
                unitPrice: normalizedPrice,
              })
            }
          >
            <HandCoins className="h-3.5 w-3.5" />
            {insufficient ? 'Saldo insuficiente' : 'Publicar proposta'}
          </GameButton>
        </div>
      </GameCard>

      <GameCard className="p-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as KindFilter);
              setPage(1);
            }}
            className="rounded-lg border border-amber-900/50 bg-[#160f08] px-3 py-2 text-xs text-amber-100"
          >
            <option value="all">Todos os tipos</option>
            <option value="material">Materiais de craft</option>
            <option value="equipment">Equipamentos</option>
          </select>
          <select
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value as CurrencyFilter);
              setPage(1);
            }}
            className="rounded-lg border border-amber-900/50 bg-[#160f08] px-3 py-2 text-xs text-amber-100"
          >
            <option value="all">Créditos + Diamantes</option>
            <option value="zeni">Somente Créditos</option>
            <option value="crystal">Somente Diamantes</option>
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortMode);
              setPage(1);
            }}
            className="rounded-lg border border-amber-900/50 bg-[#160f08] px-3 py-2 text-xs text-amber-100"
          >
            <option value="recent">Mais recentes</option>
            <option value="price_desc">Maior proposta por unidade</option>
            <option value="price_asc">Menor proposta por unidade</option>
          </select>
        </div>
      </GameCard>

      {market.buyOrders.length === 0 ? (
        <Empty text="Nenhuma proposta de compra ativa com estes filtros." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {market.buyOrders.map((order) => {
            const available = sellableById.get(order.itemId) ?? 0;
            const maxSell = Math.min(available, order.quantityRemaining);
            const qty = maxSell > 0
              ? Math.max(1, Math.min(sellQty[order.id] ?? 1, maxSell))
              : 1;
            const totalSale = order.unitPrice * qty;

            return (
              <GameCard key={order.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-3xl" aria-hidden>{order.itemIcon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-amber-100">{order.itemName}</h3>
                      <Chip className="border-emerald-900/40 bg-emerald-950/30 text-emerald-300">
                        quer comprar
                      </Chip>
                      {order.isMine ? (
                        <Chip className="border-orange-800/50 bg-orange-950/40 text-orange-300">
                          sua proposta
                        </Chip>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-amber-200/45">
                      Procura {order.quantityRemaining} de {order.quantity} unidade(s)
                    </p>
                    <div className="mt-2">
                      <PublicPlayerIdentity
                        name={order.buyerName}
                        race={order.buyerRace}
                        avatarUrl={order.buyerAvatarUrl}
                        cosmetics={order.buyerCosmetics}
                        compact
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={'font-heading ' + (order.currency === 'crystal' ? 'text-sky-300' : 'text-yellow-300')}>
                      {currencyText(order.currency, order.unitPrice)}
                    </p>
                    <p className="text-[10px] text-amber-200/35">por unidade</p>
                  </div>
                </div>

                {!order.isMine ? (
                  <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-amber-900/25 pt-3">
                    <label className="text-[10px] text-amber-200/50">
                      Quantidade
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, maxSell)}
                        value={qty}
                        disabled={maxSell <= 0}
                        onChange={(event) => {
                          const value = Math.max(
                            1,
                            Math.min(maxSell, Math.trunc(Number(event.target.value) || 1))
                          );
                          setSellQty((current) => ({ ...current, [order.id]: value }));
                        }}
                        className="mt-1 block w-24 rounded-lg border border-amber-900/50 bg-black/30 px-2 py-2 text-sm text-amber-100 disabled:opacity-40"
                      />
                    </label>
                    <div className="min-w-32 flex-1">
                      <p className="text-[10px] text-amber-200/40">
                        {available > 0 ? `Você tem ${available} disponível(is) · recebe` : 'Você não possui este item livre'}
                      </p>
                      {available > 0 ? (
                        <p className="font-heading text-emerald-300">
                          {currencyText(order.currency, totalSale)}
                        </p>
                      ) : null}
                    </div>
                    <GameButton
                      size="sm"
                      variant="gold"
                      disabled={busy || maxSell <= 0}
                      onClick={() =>
                        void onMutate({
                          action: 'fulfill_buy_order',
                          orderId: order.id,
                          quantity: qty,
                        })
                      }
                    >
                      <PackageCheck className="h-3.5 w-3.5" />
                      {maxSell <= 0 ? 'Sem item disponível' : 'Vender agora'}
                    </GameButton>
                  </div>
                ) : null}
              </GameCard>
            );
          })}
        </div>
      )}

      {market.buyOrderTotal > 0 ? (
        <div className="flex items-center justify-center gap-3">
          <GameButton size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
            Anterior
          </GameButton>
          <span className="text-xs text-amber-200/50">Página {page} de {totalPages}</span>
          <GameButton size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((v) => v + 1)}>
            Próxima
          </GameButton>
        </div>
      ) : null}
    </div>
  );
}

export function MyMarketBuyOrders({
  orders,
  busy,
  onCancel,
}: {
  orders: MarketBuyOrderView[];
  busy: boolean;
  onCancel: (orderId: string) => Promise<boolean>;
}) {
  if (orders.length === 0) return <Empty text="Você ainda não publicou propostas de compra." />;

  return (
    <section className="space-y-3">
      <h3 className="font-heading text-amber-100">🤝 Minhas propostas de compra</h3>
      <div className="grid gap-3 lg:grid-cols-2">
        {orders.map((order) => {
          const filled = order.quantity - order.quantityRemaining;
          return (
            <GameCard key={order.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden>{order.itemIcon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-heading text-amber-100">{order.itemName}</h4>
                    <Chip
                      className={
                        order.status === 'filled'
                          ? 'border-emerald-800/50 bg-emerald-950/40 text-emerald-300'
                          : order.status === 'cancelled'
                            ? 'border-red-900/50 bg-red-950/30 text-red-300'
                            : 'border-sky-800/50 bg-sky-950/40 text-sky-300'
                      }
                    >
                      {order.status === 'filled' ? 'Concluída' : order.status === 'cancelled' ? 'Cancelada' : 'Ativa'}
                    </Chip>
                  </div>
                  <p className="mt-1 text-xs text-amber-200/45">
                    {order.status === 'active'
                      ? `${order.quantityRemaining} restantes · ${filled} comprados`
                      : order.status === 'cancelled'
                        ? `${filled} comprados antes do cancelamento`
                        : `${order.quantity} unidade(s) comprada(s)`}
                  </p>
                  <p className="mt-1 font-heading text-yellow-300">
                    {currencyText(order.currency, order.unitPrice)} / unidade
                  </p>
                  {order.status === 'active' ? (
                    <p className="mt-1 text-[10px] text-amber-200/40">
                      Escrow restante: {currencyText(order.currency, order.unitPrice * order.quantityRemaining)}
                    </p>
                  ) : null}
                </div>
                {order.status === 'active' ? (
                  <GameButton
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onCancel(order.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Cancelar
                  </GameButton>
                ) : null}
              </div>
            </GameCard>
          );
        })}
      </div>
    </section>
  );
}
