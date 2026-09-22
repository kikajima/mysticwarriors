
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Coins,
  Gem,
  PackagePlus,
  RefreshCw,
  ShoppingCart,
  Store,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type {
  MarketCurrency,
  MarketListingKind,
  MarketPage,
  MarketSellableAsset,
  PlayerView,
} from '@/lib/game/types';
import { Chip, GameButton, GameCard } from './Bits';
import { PublicPlayerIdentity } from './PublicPlayerIdentity';
import { LoadFail, RankingSkeleton } from './PanelLoad';

type Tab = 'browse' | 'sell' | 'mine';
type KindFilter = 'all' | MarketListingKind;
type CurrencyFilter = 'all' | MarketCurrency;
type SortMode = 'recent' | 'price_asc' | 'price_desc';

interface SellDraft {
  quantity: number;
  unitPrice: number;
  currency: MarketCurrency;
}

const PAGE_SIZE = 20;

function currencyText(currency: MarketCurrency, amount: number) {
  return currency === 'crystal'
    ? amount.toLocaleString('pt-BR') + ' 💎'
    : amount.toLocaleString('pt-BR') + ' Zeni';
}

function statusText(status: string) {
  if (status === 'sold') return 'Vendido';
  if (status === 'cancelled') return 'Cancelado';
  return 'Ativo';
}

export function MarketPanel({
  player,
  onRefresh,
}: {
  player: PlayerView;
  onRefresh: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('browse');
  const [kind, setKind] = useState<KindFilter>('all');
  const [currency, setCurrency] = useState<CurrencyFilter>('all');
  const [sort, setSort] = useState<SortMode>('recent');
  const [page, setPage] = useState(1);
  const [market, setMarket] = useState<MarketPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [buyQty, setBuyQty] = useState<Record<string, number>>({});
  const [sellDrafts, setSellDrafts] = useState<Record<string, SellDraft>>({});

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({
          playerId: player.id,
          page: String(page),
          pageSize: String(PAGE_SIZE),
          sort,
        });
        if (kind !== 'all') params.set('kind', kind);
        if (currency !== 'all') params.set('currency', currency);

        const res = await fetch('/api/game/market?' + params.toString(), {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok || json.success === false) {
          throw new Error(json?.error?.message ?? 'Falha ao carregar mercado.');
        }
        setMarket(json.market);
      } catch {
        if (!silent) setFailed(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [currency, kind, page, player.id, sort]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(true), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const mutate = useCallback(
    async (payload: Record<string, unknown>) => {
      if (mutating) return false;
      setMutating(true);
      try {
        const res = await fetch('/api/game/market', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: player.id,
            requestId: crypto.randomUUID(),
            ...payload,
          }),
        });
        const json = await res.json();
        if (!res.ok || json.success === false) {
          toast({
            title: '⚠ Mercado',
            description: json?.error?.message ?? 'Operação recusada.',
            variant: 'destructive',
          });
          return false;
        }
        toast({ title: '🏪 Mercado', description: json.message });
        await Promise.all([load(true), Promise.resolve(onRefresh())]);
        return true;
      } catch {
        toast({
          title: '⚠ Mercado',
          description: 'Não foi possível concluir a operação. Tente novamente.',
          variant: 'destructive',
        });
        return false;
      } finally {
        setMutating(false);
      }
    },
    [load, mutating, onRefresh, player.id, toast]
  );

  const totalPages = market ? Math.max(1, Math.ceil(market.total / market.pageSize)) : 1;
  const activeMine =
    market?.myListings.filter((listing) => listing.status === 'active').length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-xl text-amber-100 sm:text-2xl">
            <Store className="h-6 w-6 text-orange-400" /> Mercado dos Guerreiros
          </h2>
          <p className="mt-1 text-xs text-amber-200/45">
            Negocie materiais de craft e equipamentos diretamente com outros jogadores.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip className="border-amber-800/50 bg-amber-950/40 text-amber-300">
            <Coins className="mr-1 h-3 w-3" /> {player.zeni.toLocaleString('pt-BR')} Zeni
          </Chip>
          <Chip className="border-sky-800/50 bg-sky-950/40 text-sky-300">
            <Gem className="mr-1 h-3 w-3" /> {player.crystals.toLocaleString('pt-BR')} 💎
          </Chip>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === 'browse'} onClick={() => setTab('browse')}>
          <ShoppingCart className="h-4 w-4" /> Comprar
        </TabButton>
        <TabButton active={tab === 'sell'} onClick={() => setTab('sell')}>
          <PackagePlus className="h-4 w-4" /> Vender
        </TabButton>
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
          📜 Meus anúncios
          {market ? <span className="opacity-65">({activeMine}/{market.activeLimit})</span> : null}
        </TabButton>
        <GameButton size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} /> Atualizar
        </GameButton>
      </div>

      {failed && !market ? (
        <LoadFail what="O mercado" onRetry={() => void load()} />
      ) : loading && !market ? (
        <RankingSkeleton />
      ) : tab === 'browse' ? (
        <>
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
                <option value="all">Zeni + Diamantes</option>
                <option value="zeni">Somente Zeni</option>
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
                <option value="price_asc">Menor preço unitário</option>
                <option value="price_desc">Maior preço unitário</option>
              </select>
            </div>
          </GameCard>

          {(market?.listings.length ?? 0) === 0 ? (
            <Empty text="Nenhum anúncio ativo com estes filtros." />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {market?.listings.map((listing) => {
                const qty = Math.max(
                  1,
                  Math.min(buyQty[listing.id] ?? 1, listing.quantityRemaining)
                );
                const total = listing.unitPrice * qty;
                const insufficient =
                  listing.currency === 'crystal'
                    ? player.crystals < total
                    : player.zeni < total;

                return (
                  <GameCard key={listing.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-3xl" aria-hidden>{listing.itemIcon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading text-amber-100">{listing.itemName}</h3>
                          <Chip className="border-amber-900/40 bg-black/30 text-amber-200/60">
                            {listing.kind === 'material' ? 'Material' : 'Equipamento'}
                          </Chip>
                          {listing.isMine ? (
                            <Chip className="border-orange-800/50 bg-orange-950/40 text-orange-300">
                              seu anúncio
                            </Chip>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-amber-200/45">
                          {listing.quantityRemaining} de {listing.quantity} unidade(s) disponíveis
                        </p>
                        <div className="mt-2">
                          <PublicPlayerIdentity
                            name={listing.sellerName}
                            race={listing.sellerRace}
                            avatarUrl={listing.sellerAvatarUrl}
                            cosmetics={listing.sellerCosmetics}
                            compact
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={'font-heading ' + (listing.currency === 'crystal' ? 'text-sky-300' : 'text-yellow-300')}>
                          {currencyText(listing.currency, listing.unitPrice)}
                        </p>
                        <p className="text-[10px] text-amber-200/35">por unidade</p>
                      </div>
                    </div>

                    {!listing.isMine ? (
                      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-amber-900/25 pt-3">
                        <label className="text-[10px] text-amber-200/50">
                          Quantidade
                          <input
                            type="number"
                            min={1}
                            max={listing.quantityRemaining}
                            value={qty}
                            onChange={(event) => {
                              const value = Math.max(
                                1,
                                Math.min(
                                  listing.quantityRemaining,
                                  Math.trunc(Number(event.target.value) || 1)
                                )
                              );
                              setBuyQty((current) => ({ ...current, [listing.id]: value }));
                            }}
                            className="mt-1 block w-24 rounded-lg border border-amber-900/50 bg-black/30 px-2 py-2 text-sm text-amber-100"
                          />
                        </label>
                        <div className="min-w-32 flex-1">
                          <p className="text-[10px] text-amber-200/40">Total</p>
                          <p className="font-heading text-amber-100">
                            {currencyText(listing.currency, total)}
                          </p>
                        </div>
                        <GameButton
                          size="sm"
                          variant="gold"
                          disabled={mutating || insufficient}
                          onClick={() =>
                            void mutate({
                              action: 'buy',
                              listingId: listing.id,
                              quantity: qty,
                            })
                          }
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          {insufficient ? 'Saldo insuficiente' : 'Comprar'}
                        </GameButton>
                      </div>
                    ) : null}
                  </GameCard>
                );
              })}
            </div>
          )}

          {market && market.total > 0 ? (
            <div className="flex items-center justify-center gap-3">
              <GameButton
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </GameButton>
              <span className="text-xs text-amber-200/50">
                Página {page} de {totalPages}
              </span>
              <GameButton
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Próxima
              </GameButton>
            </div>
          ) : null}
        </>
      ) : tab === 'sell' ? (
        <SellTab
          assets={market?.sellable ?? []}
          drafts={sellDrafts}
          setDrafts={setSellDrafts}
          busy={mutating}
          activeCount={activeMine}
          activeLimit={market?.activeLimit ?? 20}
          onCreate={(asset, draft) =>
            mutate({
              action: 'create',
              itemId: asset.itemId,
              quantity: draft.quantity,
              currency: draft.currency,
              unitPrice: draft.unitPrice,
            })
          }
        />
      ) : (
        <MyListings
          listings={market?.myListings ?? []}
          busy={mutating}
          onCancel={(listingId) => mutate({ action: 'cancel', listingId })}
        />
      )}
    </div>
  );
}

function SellTab({
  assets,
  drafts,
  setDrafts,
  busy,
  activeCount,
  activeLimit,
  onCreate,
}: {
  assets: MarketSellableAsset[];
  drafts: Record<string, SellDraft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, SellDraft>>>;
  busy: boolean;
  activeCount: number;
  activeLimit: number;
  onCreate: (asset: MarketSellableAsset, draft: SellDraft) => Promise<boolean>;
}) {
  const grouped = useMemo(
    () => ({
      material: assets.filter((asset) => asset.kind === 'material'),
      equipment: assets.filter((asset) => asset.kind === 'equipment'),
    }),
    [assets]
  );

  if (assets.length === 0) {
    return (
      <Empty text="Você não possui materiais ou equipamentos livres para anunciar. Itens equipados precisam ser desequipados primeiro." />
    );
  }

  return (
    <div className="space-y-5">
      <GameCard className="p-4 text-xs text-amber-200/55">
        O item sai do seu inventário assim que o anúncio é criado e fica protegido em escrow.
        Se você cancelar, as unidades restantes voltam para o inventário. Limite: {activeCount}/{activeLimit} anúncios ativos.
      </GameCard>

      {(['material', 'equipment'] as const).map((group) => {
        const rows = grouped[group];
        if (rows.length === 0) return null;
        return (
          <section key={group}>
            <h3 className="mb-3 font-heading text-amber-100">
              {group === 'material' ? '🧱 Materiais de craft' : '⚔️ Equipamentos'}
            </h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((asset) => {
                const max = Math.min(asset.quantity, group === 'material' ? 999 : 99);
                const draft = drafts[asset.itemId] ?? {
                  quantity: 1,
                  unitPrice: 1,
                  currency: 'zeni' as const,
                };
                const quantity = Math.max(1, Math.min(max, draft.quantity));
                const price = Math.max(1, Math.min(100_000_000, draft.unitPrice));
                const normalized = { ...draft, quantity, unitPrice: price };

                return (
                  <GameCard key={asset.itemId} className="p-4">
                    <div className="flex gap-3">
                      <span className="text-3xl" aria-hidden>{asset.icon}</span>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-heading text-amber-100">{asset.name}</h4>
                        <p className="text-[11px] text-amber-200/45">
                          Disponível para venda: {asset.quantity}
                          {asset.tier ? ' · Tier ' + asset.tier : ''}
                          {asset.rarity ? ' · ' + asset.rarity : ''}
                        </p>
                        {asset.description ? (
                          <p className="mt-1 text-[10px] text-amber-200/35">{asset.description}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <label className="text-[10px] text-amber-200/45">
                        Quantidade
                        <input
                          type="number"
                          min={1}
                          max={max}
                          value={quantity}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [asset.itemId]: {
                                ...normalized,
                                quantity: Math.max(
                                  1,
                                  Math.min(max, Math.trunc(Number(event.target.value) || 1))
                                ),
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-amber-900/50 bg-black/30 px-2 py-2 text-sm text-amber-100"
                        />
                      </label>
                      <label className="text-[10px] text-amber-200/45">
                        Preço por unidade
                        <input
                          type="number"
                          min={1}
                          max={100_000_000}
                          value={price}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [asset.itemId]: {
                                ...normalized,
                                unitPrice: Math.max(
                                  1,
                                  Math.min(100_000_000, Math.trunc(Number(event.target.value) || 1))
                                ),
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-amber-900/50 bg-black/30 px-2 py-2 text-sm text-amber-100"
                        />
                      </label>
                      <label className="col-span-2 text-[10px] text-amber-200/45 sm:col-span-1">
                        Moeda
                        <select
                          value={draft.currency}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [asset.itemId]: {
                                ...normalized,
                                currency: event.target.value as MarketCurrency,
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-amber-900/50 bg-[#160f08] px-2 py-2 text-sm text-amber-100"
                        >
                          <option value="zeni">Zeni</option>
                          <option value="crystal">Diamantes 💎</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-amber-900/25 pt-3">
                      <span className="text-xs text-amber-200/55">
                        Total se vender tudo:{' '}
                        <strong className="text-amber-100">
                          {currencyText(draft.currency, price * quantity)}
                        </strong>
                      </span>
                      <GameButton
                        size="sm"
                        variant="gold"
                        disabled={busy || activeCount >= activeLimit}
                        onClick={() => void onCreate(asset, normalized)}
                      >
                        <PackagePlus className="h-3.5 w-3.5" /> Anunciar
                      </GameButton>
                    </div>
                  </GameCard>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MyListings({
  listings,
  busy,
  onCancel,
}: {
  listings: MarketPage['myListings'];
  busy: boolean;
  onCancel: (listingId: string) => Promise<boolean>;
}) {
  if (listings.length === 0) return <Empty text="Você ainda não criou anúncios no mercado." />;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {listings.map((listing) => {
        const sold = listing.quantity - listing.quantityRemaining;
        return (
          <GameCard key={listing.id} className="p-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>{listing.itemIcon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-amber-100">{listing.itemName}</h3>
                  <Chip
                    className={
                      listing.status === 'sold'
                        ? 'border-emerald-800/50 bg-emerald-950/40 text-emerald-300'
                        : listing.status === 'cancelled'
                          ? 'border-red-900/50 bg-red-950/30 text-red-300'
                          : 'border-orange-800/50 bg-orange-950/40 text-orange-300'
                    }
                  >
                    {statusText(listing.status)}
                  </Chip>
                </div>
                <p className="mt-1 text-xs text-amber-200/45">
                  {listing.status === 'active'
                    ? listing.quantityRemaining + ' restantes · ' + sold + ' vendidos'
                    : listing.status === 'cancelled'
                      ? listing.quantityRemaining + ' unidade(s) devolvida(s) ao inventário'
                      : listing.quantity + ' unidade(s) vendida(s)'}
                </p>
                <p className="mt-1 font-heading text-yellow-300">
                  {currencyText(listing.currency, listing.unitPrice)} / unidade
                </p>
              </div>
              {listing.status === 'active' ? (
                <GameButton
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void onCancel(listing.id)}
                >
                  <XCircle className="h-3.5 w-3.5" /> Cancelar
                </GameButton>
              ) : null}
            </div>
          </GameCard>
        );
      })}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-heading transition-colors ' +
        (active
          ? 'border-orange-500 bg-orange-950/60 text-orange-200'
          : 'border-amber-900/50 bg-black/20 text-amber-200/55 hover:text-amber-100')
      }
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <GameCard className="p-8 text-center text-sm text-amber-200/45">
      {text}
    </GameCard>
  );
}
