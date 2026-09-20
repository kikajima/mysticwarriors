'use client';

import { useMemo, useState } from 'react';
import { getItem, SELL_PRICE_RATIO } from '@/lib/game/constants';
import { EQUIPPED_SLOT_META } from '@/lib/game/types';
import type { EquipmentSlot, EquippedSlot, ItemsState, PlayerView, ShopItem } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { WorkshopPanel } from './WorkshopPanel';
import { Backpack, Hammer, Shield, Wrench } from 'lucide-react';

type InventoryTab = 'items' | 'equipment' | 'workshop';

const TABS: Array<{ key: InventoryTab; label: string; icon: React.ReactNode }> = [
  { key: 'items', label: 'Itens', icon: <Backpack className="w-4 h-4" /> },
  { key: 'equipment', label: 'Equipamento', icon: <Shield className="w-4 h-4" /> },
  { key: 'workshop', label: 'Oficina', icon: <Hammer className="w-4 h-4" /> },
];

function unitsOf(items: ItemsState, id: string): number {
  return items.stacks?.[id] ?? (items.owned.includes(id) ? 1 : 0);
}

function sellUnitPrice(item: ShopItem): number {
  return Math.max(0, Math.floor(item.price * SELL_PRICE_RATIO));
}

function sellPriceLabel(item: ShopItem, qty: number): string {
  const total = sellUnitPrice(item) * qty;
  if (item.currency === 'crystal') {
    return `${total} 💎 ${total === 1 ? 'diamante' : 'diamantes'}`;
  }
  return `${total.toLocaleString('pt-BR')} Zeni`;
}

function QtyStepper({
  value,
  onChange,
  max,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.max(1, Math.min(max, Math.floor(v) || 1));
  return (
    <div className="flex items-center gap-1 select-none">
      <button
        type="button"
        aria-label="Diminuir quantidade"
        disabled={disabled || value <= 1}
        onClick={() => onChange(clamp(value - 1))}
        className="w-6 h-6 rounded-md border border-amber-800/60 bg-black/40 text-amber-200 font-heading leading-none hover:border-amber-500 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        −
      </button>
      <span className="w-8 text-center font-heading text-sm text-amber-100 tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="w-6 h-6 rounded-md border border-amber-800/60 bg-black/40 text-amber-200 font-heading leading-none hover:border-amber-500 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        +
      </button>
    </div>
  );
}

function itemBonusText(item: ShopItem): string {
  const parts: string[] = [];
  if (item.atk) parts.push(`+${item.atk} ATQ`);
  if (item.def) parts.push(`+${item.def} DEF`);
  if (item.spd) parts.push(`+${item.spd} VEL`);
  if (item.ki) parts.push(`+${item.ki} KI`);
  if (item.trainBonus?.all) parts.push(`+${item.trainBonus.all} todos/treino`);
  if (item.trainBonus?.strength) parts.push(`+${item.trainBonus.strength} Força/treino`);
  if (item.trainBonus?.defense) parts.push(`+${item.trainBonus.defense} Defesa/treino`);
  if (item.trainBonus?.speed) parts.push(`+${item.trainBonus.speed} Velocidade/treino`);
  if (item.trainBonus?.ki) parts.push(`+${item.trainBonus.ki} Ki/treino`);
  if (item.dragonBallSearchChanceBonus) {
    parts.push(`+${(item.dragonBallSearchChanceBonus * 100).toLocaleString('pt-BR')} p.p. na Busca pelas Esferas`);
  }
  return parts.join(' • ');
}

function SellControls({
  item,
  count,
  busy,
  value,
  onChange,
  onSell,
}: {
  item: ShopItem;
  count: number;
  busy: boolean;
  value: number;
  onChange: (v: number) => void;
  onSell: () => void;
}) {
  if (item.price <= 0) {
    return <span className="text-[11px] text-sky-300/60 italic">feito na Oficina</span>;
  }
  if (count <= 0) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-amber-900/40 bg-black/20 px-2 py-1">
      <QtyStepper value={value} max={count} onChange={onChange} disabled={busy} />
      <span className="text-[11px] text-amber-200/60 tabular-nums">
        recebe {sellPriceLabel(item, value)}
      </span>
      <GameButton size="sm" variant="ghost" onClick={onSell} disabled={busy}>
        vender
      </GameButton>
    </span>
  );
}

function ItemInventory({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean>;
  busy: boolean;
}) {
  const [sellQty, setSellQty] = useState<Record<string, number>>({});

  const consumables = Object.entries(player.items.consumables)
    .map(([id, count]) => ({ item: getItem(id), count }))
    .filter((entry): entry is { item: ShopItem; count: number } => !!entry.item && entry.count > 0);

  const training = player.items.owned
    .map((id) => getItem(id))
    .filter((item): item is ShopItem => !!item && item.category === 'training');

  const sell = (itemId: string) =>
    onAction({ type: 'sell', itemId, quantity: sellQty[itemId] ?? 1 });

  if (consumables.length === 0 && training.length === 0) {
    return (
      <GameCard className="p-6 text-center">
        <div className="text-4xl mb-2" aria-hidden>🎒</div>
        <p className="font-heading text-amber-100">Seu inventário de itens está vazio.</p>
        <p className="text-xs text-amber-200/45 mt-1">Itens comprados ou fabricados aparecem aqui.</p>
      </GameCard>
    );
  }

  return (
    <div className="space-y-6">
      {consumables.length > 0 && (
        <section>
          <h3 className="font-heading text-amber-100 mb-3">🧪 Consumíveis</h3>
          <div className="grid gap-2">
            {consumables.map(({ item, count }) => {
              const q = Math.min(sellQty[item.id] ?? 1, count);
              return (
                <GameCard key={item.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl" aria-hidden>{item.icon}</span>
                    <div className="min-w-0">
                      <p className="font-heading text-sm text-amber-100">{item.name}</p>
                      <p className="text-[11px] text-amber-200/45">{item.description}</p>
                    </div>
                    <Chip className="bg-black/40 text-amber-200/70 border-amber-900/50">×{count}</Chip>
                    <span className="flex-1" />
                    <GameButton
                      size="sm"
                      onClick={() => onAction({ type: 'use_item', itemId: item.id })}
                      disabled={busy}
                    >
                      usar
                    </GameButton>
                    <SellControls
                      item={item}
                      count={item.price > 0 ? count : 0}
                      busy={busy}
                      value={q}
                      onChange={(v) => setSellQty((m) => ({ ...m, [item.id]: v }))}
                      onSell={() => sell(item.id)}
                    />
                  </div>
                </GameCard>
              );
            })}
          </div>
        </section>
      )}

      {training.length > 0 && (
        <section>
          <h3 className="font-heading text-amber-100 mb-3">🏋️ Itens de treino</h3>
          <div className="grid gap-2">
            {training.map((item) => {
              const total = unitsOf(player.items, item.id);
              const sellable = item.price > 0 ? Math.max(0, total - 1) : 0;
              const q = Math.min(sellQty[item.id] ?? 1, Math.max(1, sellable));
              return (
                <GameCard key={item.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl" aria-hidden>{item.icon}</span>
                    <div className="min-w-0">
                      <p className="font-heading text-sm text-amber-100">{item.name}</p>
                      <p className="text-[11px] text-amber-200/50 mt-0.5">{item.description}</p>
                      {itemBonusText(item) && (
                        <p className="text-[11px] text-emerald-300/75 mt-0.5">{itemBonusText(item)}</p>
                      )}
                    </div>
                    <Chip className="bg-emerald-950/40 text-emerald-300 border-emerald-800/40">ativo</Chip>
                    {total > 1 && <Chip className="bg-black/40 text-amber-200/70 border-amber-900/50">×{total}</Chip>}
                    <span className="flex-1" />
                    {sellable > 0 ? (
                      <SellControls
                        item={item}
                        count={sellable}
                        busy={busy}
                        value={q}
                        onChange={(v) => setSellQty((m) => ({ ...m, [item.id]: v }))}
                        onSell={() => sell(item.id)}
                      />
                    ) : item.price <= 0 ? (
                      <span className="text-[11px] text-sky-300/60 italic">feito na Oficina</span>
                    ) : (
                      <span className="text-[11px] text-amber-200/40 italic">1 unidade ativa</span>
                    )}
                  </div>
                </GameCard>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

type DisplaySlot = {
  key: EquippedSlot;
  label: string;
  icon: string;
  grid: string;
};

const DISPLAY_SLOTS: DisplaySlot[] = [
  { key: 'head', ...EQUIPPED_SLOT_META.head, grid: 'col-start-2 row-start-1' },
  { key: 'wrists', ...EQUIPPED_SLOT_META.wrists, grid: 'col-start-1 row-start-2' },
  { key: 'armor', ...EQUIPPED_SLOT_META.armor, grid: 'col-start-2 row-start-2' },
  { key: 'accessory', ...EQUIPPED_SLOT_META.accessory, grid: 'col-start-3 row-start-2' },
  { key: 'weapon', ...EQUIPPED_SLOT_META.weapon, grid: 'col-start-1 row-start-3' },
  { key: 'legs', ...EQUIPPED_SLOT_META.legs, grid: 'col-start-2 row-start-3' },
  { key: 'accessory2', ...EQUIPPED_SLOT_META.accessory2, grid: 'col-start-3 row-start-3' },
  { key: 'boots', ...EQUIPPED_SLOT_META.boots, grid: 'col-start-2 row-start-4' },
];

function EquipmentSlot({
  slot,
  player,
  busy,
  onAction,
}: {
  slot: DisplaySlot;
  player: PlayerView;
  busy: boolean;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean>;
}) {
  const itemId = player.items[slot.key] ?? null;
  const item = itemId ? getItem(itemId) : undefined;

  return (
    <div className={slot.grid}>
      <div
        className={`relative aspect-square min-h-24 rounded-xl border p-2 flex flex-col items-center justify-center text-center transition-all ${
          item
            ? 'border-orange-500/70 bg-orange-950/30 shadow-lg shadow-orange-950/30'
            : 'border-amber-900/50 bg-black/25'
        }`}
        title={item?.description ?? slot.label}
      >
        <span className={item ? 'text-4xl' : 'text-3xl opacity-35'} aria-hidden>{item?.icon ?? slot.icon}</span>
        <span className="mt-1 text-[10px] font-heading text-amber-200/55">{slot.label}</span>
        {item && <span className="text-[10px] text-amber-100/80 line-clamp-2">{item.name}</span>}
      </div>
      {item && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction({ type: 'unequip', slot: slot.key })}
          className="mt-1 w-full text-[10px] text-amber-200/45 hover:text-amber-100 disabled:opacity-40"
        >
          remover
        </button>
      )}
    </div>
  );
}

function EquipmentInventory({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean>;
  busy: boolean;
}) {
  const [sellQty, setSellQty] = useState<Record<string, number>>({});

  const equipment = useMemo(
    () =>
      player.items.owned
        .map((id) => getItem(id))
        .filter(
          (item): item is ShopItem =>
            !!item && ['head', 'wrists', 'armor', 'accessory', 'weapon', 'legs', 'boots'].includes(item.category)
        ),
    [player.items.owned]
  );

  const totals = useMemo(() => {
    const server = player.derived.equipmentBonuses;
    if (server) {
      return { atk: server.strength, def: server.defense, spd: server.speed, ki: server.ki };
    }
    const out = { atk: 0, def: 0, spd: 0, ki: 0 };
    for (const slot of DISPLAY_SLOTS) {
      const itemId = player.items[slot.key] ?? null;
      const item = itemId ? getItem(itemId) : undefined;
      if (!item) continue;
      out.atk += item.atk ?? 0;
      out.def += item.def ?? 0;
      out.spd += item.spd ?? 0;
      out.ki += item.ki ?? 0;
    }
    return out;
  }, [player.derived.equipmentBonuses, player.items]);

  const sell = (itemId: string) =>
    onAction({ type: 'sell', itemId, quantity: sellQty[itemId] ?? 1 });

  const groups: Array<{ key: EquipmentSlot; label: string; icon: string }> = [
    { key: 'head', label: 'Cabeça', icon: '🪖' },
    { key: 'wrists', label: 'Punhos', icon: '🥊' },
    { key: 'armor', label: 'Torso', icon: '🛡️' },
    { key: 'accessory', label: 'Acessórios (2 espaços)', icon: '💍' },
    { key: 'weapon', label: 'Armas', icon: '⚔️' },
    { key: 'legs', label: 'Pernas', icon: '👖' },
    { key: 'boots', label: 'Botas', icon: '🥾' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[minmax(280px,420px)_1fr] gap-5 items-start">
        <GameCard className="p-4">
          <h3 className="font-heading text-amber-100 mb-4 text-center">Equipamento atual</h3>
          <div className="grid grid-cols-3 grid-rows-4 gap-3 max-w-sm mx-auto">
            {DISPLAY_SLOTS.map((slot) => (
              <EquipmentSlot key={slot.key} slot={slot} player={player} busy={busy} onAction={onAction} />
            ))}
          </div>
        </GameCard>

        <GameCard className="p-4">
          <h3 className="font-heading text-amber-100 mb-3">Bônus equipados</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-amber-900/40 bg-black/20 p-3">
              <p className="text-[10px] text-amber-200/45">Ataque</p>
              <p className="font-heading text-orange-300">+{totals.atk}</p>
            </div>
            <div className="rounded-lg border border-amber-900/40 bg-black/20 p-3">
              <p className="text-[10px] text-amber-200/45">Defesa</p>
              <p className="font-heading text-emerald-300">+{totals.def}</p>
            </div>
            <div className="rounded-lg border border-amber-900/40 bg-black/20 p-3">
              <p className="text-[10px] text-amber-200/45">Velocidade</p>
              <p className="font-heading text-sky-300">+{totals.spd}</p>
            </div>
            <div className="rounded-lg border border-amber-900/40 bg-black/20 p-3">
              <p className="text-[10px] text-amber-200/45">Ki</p>
              <p className="font-heading text-violet-300">+{totals.ki}</p>
            </div>
          </div>
        </GameCard>
      </div>

      {equipment.length === 0 ? (
        <GameCard className="p-5 text-sm text-amber-200/45">Você ainda não possui equipamentos.</GameCard>
      ) : (
        groups.map((group) => {
          const rows = equipment.filter((item) => item.category === group.key);
          if (rows.length === 0) return null;
          return (
            <section key={group.key}>
              <h3 className="font-heading text-amber-100 mb-3">{group.icon} {group.label}</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {rows.map((item) => {
                  const total = unitsOf(player.items, item.id);
                  const equippedSlots: EquippedSlot[] =
                    group.key === 'accessory'
                      ? (['accessory', 'accessory2'] as const).filter(
                          (slot) => (player.items[slot] ?? null) === item.id
                        )
                      : ((player.items[group.key] ?? null) === item.id ? [group.key] : []);
                  const equipped = equippedSlots.length > 0;
                  const sellable = item.price > 0 ? total - equippedSlots.length : 0;
                  const q = Math.min(sellQty[item.id] ?? 1, Math.max(1, sellable));
                  return (
                    <GameCard key={item.id} className={`p-4 ${equipped ? 'border-emerald-700/50 bg-emerald-950/15' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-3xl" aria-hidden>{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-heading text-amber-100">{item.name}</p>
                            {equippedSlots.map((slot) => (
                              <Chip key={slot} className="bg-emerald-950/50 text-emerald-300 border-emerald-700/50">
                                {slot === 'accessory' ? 'Acessório I' : slot === 'accessory2' ? 'Acessório II' : 'equipado'}
                              </Chip>
                            ))}
                            {total > 1 && <Chip className="bg-black/40 text-amber-200/70 border-amber-900/50">×{total}</Chip>}
                          </div>
                          <p className="text-xs text-amber-200/50 mt-1">{item.description}</p>
                          {itemBonusText(item) && (
                            <p className="text-[11px] text-emerald-300/75 mt-1">{itemBonusText(item)}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {group.key === 'accessory' ? (
                          <>
                            {(['accessory', 'accessory2'] as const).map((slot) => {
                              const active = (player.items[slot] ?? null) === item.id;
                              const otherSlot = slot === 'accessory' ? 'accessory2' : 'accessory';
                              const sameInOther = (player.items[otherSlot] ?? null) === item.id;
                              const canUseSecondCopy = !sameInOther || total >= 2;
                              return (
                                <GameButton
                                  key={slot}
                                  size="sm"
                                  variant={active ? 'ghost' : 'primary'}
                                  disabled={busy || (!active && !canUseSecondCopy)}
                                  onClick={() =>
                                    active
                                      ? onAction({ type: 'unequip', slot })
                                      : onAction({ type: 'equip', itemId: item.id, slot })
                                  }
                                >
                                  {active ? 'Remover' : 'Equipar'} {slot === 'accessory' ? 'I' : 'II'}
                                </GameButton>
                              );
                            })}
                          </>
                        ) : (
                          <GameButton
                            size="sm"
                            variant={equipped ? 'ghost' : 'primary'}
                            disabled={busy}
                            onClick={() =>
                              equipped
                                ? onAction({ type: 'unequip', slot: group.key })
                                : onAction({ type: 'equip', itemId: item.id, slot: group.key })
                            }
                          >
                            {equipped ? 'Desequipar' : 'Equipar'}
                          </GameButton>
                        )}
                        <span className="flex-1" />
                        {sellable > 0 ? (
                          <SellControls
                            item={item}
                            count={sellable}
                            busy={busy}
                            value={q}
                            onChange={(v) => setSellQty((m) => ({ ...m, [item.id]: v }))}
                            onSell={() => sell(item.id)}
                          />
                        ) : item.price <= 0 ? (
                          <span className="text-[11px] text-sky-300/60 italic">feito na Oficina</span>
                        ) : equipped && total === 1 ? (
                          <span className="text-[11px] text-amber-200/40 italic">desequipe para vender</span>
                        ) : null}
                      </div>
                    </GameCard>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

export function InventoryPanel({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean>;
  busy: boolean;
}) {
  const [tab, setTab] = useState<InventoryTab>('items');

  return (
    <div className="space-y-6">
      <SectionTitle icon="🎒">Inventário</SectionTitle>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Seções do inventário">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`font-heading text-sm px-4 py-2 rounded-lg border whitespace-nowrap transition-all inline-flex items-center gap-2 ${
              tab === item.key
                ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white border-orange-400'
                : 'bg-black/30 text-amber-200/70 border-amber-900/40 hover:border-amber-600/50'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'items' && <ItemInventory player={player} onAction={onAction} busy={busy} />}
      {tab === 'equipment' && <EquipmentInventory player={player} onAction={onAction} busy={busy} />}
      {tab === 'workshop' && <WorkshopPanel player={player} onAction={onAction} busy={busy} embedded />}
    </div>
  );
}
