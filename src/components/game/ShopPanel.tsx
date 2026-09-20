'use client';

import { useCallback, useEffect, useState } from 'react';
import { SHOP_ITEMS, COSMETICS, PRODUCTS, SHOP_MAX_QUANTITY, TALENTS } from '@/lib/game/constants';
import type { CosmeticDef } from '@/lib/game/content/cosmetics';
import type { TalentDef } from '@/lib/game/content/talents';
import { EQUIPMENT_SLOT_META, EQUIPMENT_SLOTS } from '@/lib/game/types';
import type { EquipmentSlot, PlayerView, ShopItem } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { Coins, Lock, Swords, Shield, Gauge, Sparkles, TrendingUp, Gem, Flame, CheckCircle2 } from 'lucide-react';

const CATEGORIES = [
  { key: 'weapon', label: 'Armas', icon: '⚔️' },
  { key: 'head', label: 'Cabeça', icon: '🪖' },
  { key: 'wrists', label: 'Punhos', icon: '🥊' },
  { key: 'armor', label: 'Torso', icon: '🛡️' },
  { key: 'legs', label: 'Pernas', icon: '👖' },
  { key: 'boots', label: 'Botas', icon: '🥾' },
  { key: 'accessory', label: 'Acessórios', icon: '💍' },
  { key: 'training', label: 'Treino', icon: '🏋️' },
  { key: 'consumable', label: 'Consumíveis', icon: '🧪' },
  { key: 'talents', label: 'Talentos', icon: '🔥' },
  { key: 'cosmetics', label: 'Cosméticos', icon: '✨' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

function slotText(item: ShopItem): string | null {
  if (!EQUIPMENT_SLOTS.includes(item.category as EquipmentSlot)) return null;
  return item.category === 'accessory'
    ? 'Acessório I ou II'
    : EQUIPMENT_SLOT_META[item.category as EquipmentSlot].label;
}

function bonusText(item: ShopItem): string {
  const parts: string[] = [];
  if (item.atk) parts.push(`+${item.atk} ATQ`);
  if (item.def) parts.push(`+${item.def} DEF`);
  if (item.spd) parts.push(`+${item.spd} VEL`);
  if (item.ki) parts.push(`+${item.ki} KI`);
  return parts.join(' ');
}

const STAT_LABEL: Record<string, string> = {
  strength: 'Força',
  defense: 'Defesa',
  speed: 'Velocidade',
  ki: 'Ki',
};

function trainBonusText(item: ShopItem): string {
  const b = item.trainBonus;
  if (!b) return '';
  const parts: string[] = [];
  if (b.all) parts.push(`TODOS +${b.all}`);
  for (const [stat, label] of Object.entries(STAT_LABEL)) {
    const v = (b as Record<string, number | undefined>)[stat];
    if (v) parts.push(`${label} +${v}`);
  }
  return parts.join(' • ');
}

// ===== v0.9.10: helpers de quantidade/preço (EXIBIÇÃO — o servidor
// recalcula tudo na hora da compra/venda e corrige o estado) =====

function priceLabel(item: ShopItem, qty: number): string {
  const total = item.price * qty;
  if (item.currency === 'crystal') {
    return `${total} 💎 ${total === 1 ? 'diamante' : 'diamantes'}`;
  }
  return `${total.toLocaleString('pt-BR')} Zeni`;
}

/** Botão −/qtd/+ compacto (seletor de quantidade da loja). */
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
      <span className="w-8 text-center font-heading text-sm text-amber-100 tabular-nums" aria-live="polite">
        {value}
      </span>
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

export function ShopPanel({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean>;
  busy: boolean;
}) {

  // v0.16 — matriz de ocupação: loja/inventário/cosméticos/talentos
  // LIBERADOS durante o trabalho (só treino, PvE e torneio são negados).
  const [category, setCategory] = useState<CategoryKey>('weapon');
  const [ownedCosmetics, setOwnedCosmetics] = useState<string[]>([]);
  // quantidade por item na compra; posse/uso/venda ficam no Inventário.
  const [buyQty, setBuyQty] = useState<Record<string, number>>({});

  const loadCosmetics = useCallback(async () => {
    try {
      const res = await fetch(`/api/game/achievements?playerId=${player.id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setOwnedCosmetics(data.ownedCosmetics ?? []);
    } catch {
      // silencioso
    }
  }, [player.id]);

  useEffect(() => {
    // fetch on mount/tab: setState só ocorre após o await (assíncrono)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (category === 'cosmetics') loadCosmetics();
  }, [category, loadCosmetics]);

  const items = category === 'cosmetics' || category === 'talents' ? [] : SHOP_ITEMS.filter((i) => i.category === category);
  const buy = (itemId: string) => onAction({ type: 'buy', itemId, quantity: buyQty[itemId] ?? 1 });

  return (
    <div className="space-y-6">
      <SectionTitle icon="🏪">Loja do Mestre Kame</SectionTitle>

      <GameCard className="p-4 flex flex-wrap items-center justify-between gap-3">

        <div className="flex gap-2">
          <Chip className="bg-yellow-950/50 text-yellow-300 border-yellow-700/50 text-sm px-3 py-1">
            <Coins className="w-4 h-4" /> {player.zeni.toLocaleString('pt-BR')} Zeni
          </Chip>
          <Chip className="bg-sky-950/50 text-sky-300 border-sky-700/50 text-sm px-3 py-1">
            <Gem className="w-4 h-4" /> {player.crystals} diamantes
          </Chip>
        </div>
      </GameCard>

      {/* Categorias */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            role="tab"
            aria-selected={category === cat.key}
            onClick={() => setCategory(cat.key)}
            className={`font-heading text-sm px-4 py-2 rounded-lg border whitespace-nowrap transition-all ${
              category === cat.key
                ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white border-orange-400'
                : 'bg-black/30 text-amber-200/70 border-amber-900/40 hover:border-amber-600/50'
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Talentos de Ímpeto (Cap. 7 — ASCENSÃO Z) */}
      {category === 'talents' ? (
        <TalentsSection
          player={player}
          busy={busy}
          onBuy={async (talentId) => {
            await onAction({ type: 'buy_talent', talentId });
          }}
        />
      ) : category === 'cosmetics' ? (
        <CosmeticsSection
          player={player}
          ownedCosmetics={ownedCosmetics}
          busy={busy}
          onBuy={async (cosmeticId) => {
            await onAction({ type: 'buy_cosmetic', cosmeticId });
            loadCosmetics();
          }}
          onEquip={async (cosmeticId) => {
            await onAction({ type: 'equip_cosmetic', cosmeticId });
          }}
          onUnequip={async (cosmeticId) => {
            await onAction({ type: 'unequip_cosmetic', cosmeticId });
          }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const locked = player.level < item.minLevel;
            const crystalItem = item.currency === 'crystal';
            const isConsumable = item.category === 'consumable';
            const q = buyQty[item.id] ?? 1;
            const totalCost = item.price * q;
            const canAfford = crystalItem ? player.crystals >= totalCost : player.zeni >= totalCost;
            const canBuy = !locked && canAfford;
            return (
              <GameCard key={item.id} className={`p-4 flex flex-col ${locked ? 'opacity-60' : ''}`} interactive={!locked}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-3xl shrink-0" aria-hidden>
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-heading text-amber-100 text-sm leading-tight">{item.name}</h4>
                    <p className="text-[11px] text-amber-200/50 mt-1 leading-snug">{item.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {slotText(item) && (
                    <Chip className="bg-sky-950/40 text-sky-300 border-sky-800/50">
                      {EQUIPMENT_SLOT_META[item.category as EquipmentSlot]?.icon ?? '🎒'} Slot: {slotText(item)}
                    </Chip>
                  )}
                  {item.category === 'training' ? (
                    <Chip className="bg-emerald-950/50 text-emerald-300 border-emerald-800/50">
                      <TrendingUp className="w-3 h-3" /> {trainBonusText(item)} por treino
                    </Chip>
                  ) : isConsumable ? (
                    <Chip className="bg-purple-950/50 text-purple-300 border-purple-800/50">vai para o inventário</Chip>
                  ) : (
                    <>
                      {item.atk ? (
                        <Chip className="bg-orange-950/50 text-orange-300 border-orange-800/50">
                          <Swords className="w-3 h-3" /> {bonusText(item)}
                        </Chip>
                      ) : null}
                      {item.def ? (
                        <Chip className="bg-emerald-950/50 text-emerald-300 border-emerald-800/50">
                          <Shield className="w-3 h-3" /> {bonusText(item)}
                        </Chip>
                      ) : null}
                      {item.spd || item.ki ? (
                        <Chip className="bg-amber-950/50 text-amber-200 border-amber-800/50">
                          {item.spd ? <Gauge className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />} {bonusText(item)}
                        </Chip>
                      ) : null}
                    </>
                  )}
                  {item.minLevel > 1 && (
                    <Chip className="bg-black/40 text-amber-200/60 border-amber-900/50">Nv {item.minLevel}+</Chip>
                  )}
                </div>
                <div className="flex-1" />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={`font-heading text-sm flex items-center gap-1 tabular-nums ${crystalItem ? 'text-sky-300' : 'text-yellow-400'}`}
                    title={crystalItem ? 'Diamantes' : 'Zeni'}
                  >
                    {crystalItem ? <Gem className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                    {q > 1 ? (
                      <span>
                        {priceLabel(item, 1)} <span className="text-amber-200/50">×</span> {q} = {priceLabel(item, q)}
                      </span>
                    ) : (
                      priceLabel(item, 1)
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <QtyStepper value={q} max={SHOP_MAX_QUANTITY} onChange={(v) => setBuyQty((m) => ({ ...m, [item.id]: v }))} disabled={busy || locked} />
                    {locked ? (
                      <span className="text-xs text-amber-200/50 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" /> Nível {item.minLevel}
                      </span>
                    ) : (
                      <GameButton size="sm" variant="gold" onClick={() => buy(item.id)} disabled={!canBuy || busy} title={canBuy ? undefined : 'Saldo insuficiente'}>
                        {item.category === 'training' ? 'Instalar' : 'Comprar'}
                        {q > 1 ? ` ×${q}` : ''}
                      </GameButton>
                    )}
                  </span>
                </div>
              </GameCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== v0.9.15: Seção de TALENTOS DE ÍMPETO (Cap. 7 — ASCENSÃO Z) =====

function TalentsSection({
  player,
  busy,
  onBuy,
}: {
  player: PlayerView;
  busy: boolean;
  onBuy: (talentId: string) => void | Promise<void>;
}) {
  const owned = player.talents ?? [];
  return (
    <div className="space-y-4">
      {/* faixa explicativa — liga a aba às regras do Cap. 7 */}
      <GameCard className="p-4 border-orange-900/40 bg-gradient-to-r from-orange-950/30 via-black/30 to-black/30">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/30 to-amber-600/20 border border-orange-700/40 flex items-center justify-center" aria-hidden>
            <Flame className="w-5 h-5 text-orange-300 talent-flame" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-amber-100 text-sm">Talentos de Ímpeto</h3>

          </div>
        </div>
      </GameCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TALENTS.map((talent) => (
          <TalentCard
            key={talent.id}
            talent={talent}
            owned={owned.includes(talent.id)}
            level={player.level}
            zeni={player.zeni}
            busy={busy}
            onBuy={() => onBuy(talent.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TalentCard({
  talent,
  owned,
  level,
  zeni,
  busy,
  onBuy,
}: {
  talent: TalentDef;
  owned: boolean;
  level: number;
  zeni: number;
  busy: boolean;
  onBuy: () => void;
}) {
  const locked = !owned && level < talent.minLevel;
  const canAfford = zeni >= talent.price;
  const canBuy = !owned && !locked && canAfford && !busy;
  return (
    <GameCard
      className={`p-4 flex flex-col relative overflow-hidden transition-all ${
        owned
          ? 'border-amber-500/60 talent-owned-glow'
          : locked
            ? 'opacity-60'
            : 'hover:border-orange-500/50'
      }`}
      interactive={!owned && !locked}
    >
      {/* brilho decorativo de fundo para o talento dominado */}
      {owned && (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-600/10 pointer-events-none" aria-hidden />
      )}
      <div className="flex items-start gap-3 mb-3 relative">
        <div
          className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl border ${
            owned
              ? 'bg-gradient-to-br from-amber-500/30 to-orange-600/20 border-amber-500/50'
              : 'bg-gradient-to-br from-orange-950/60 to-black/40 border-orange-800/50'
          }`}
          aria-hidden
        >
          {talent.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-heading text-amber-100 text-sm leading-tight">{talent.name}</h4>
            {owned ? (
              <Chip className="bg-amber-950/60 text-amber-300 border-amber-600/50 text-[10px] uppercase tracking-wide">
                <CheckCircle2 className="w-3 h-3" /> Dominado
              </Chip>
            ) : (
              <Chip className="bg-orange-950/50 text-orange-300 border-orange-800/50 text-[10px] uppercase tracking-wide">
                <Flame className="w-3 h-3" /> {talent.impetoCost} Ímpeto{talent.impetoCost > 1 ? 's' : ''} por uso
              </Chip>
            )}
          </div>

        </div>
      </div>

      <div className="mt-auto pt-2 border-t border-amber-900/30 relative">
        {owned ? (
          <p className="text-xs text-amber-300/80 font-heading flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 talent-flame" /> Ativo em todas as batalhas deste guerreiro
          </p>
        ) : locked ? (
          <p className="text-xs text-amber-200/50 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Requer nível {talent.minLevel} (você está no {level})
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Chip
              className={`text-sm px-3 py-1 ${
                canAfford
                  ? 'bg-yellow-950/50 text-yellow-300 border-yellow-700/50'
                  : 'bg-red-950/40 text-red-300 border-red-900/50'
              }`}
            >
              <Coins className="w-4 h-4" /> {talent.price.toLocaleString('pt-BR')} Zeni
            </Chip>
            <GameButton onClick={onBuy} disabled={!canBuy} variant="primary" className="text-xs">
              {canAfford ? 'Dominar talento' : 'Zeni insuficiente'}
            </GameButton>
          </div>
        )}
      </div>
    </GameCard>
  );
}

// ===== Seção de cosméticos =====

function CosmeticsSection({
  player,
  ownedCosmetics,
  busy,
  onBuy,
  onEquip,
  onUnequip,
}: {
  player: PlayerView;
  ownedCosmetics: string[];
  busy: boolean;
  onBuy: (cosmeticId: string) => void;
  onEquip: (cosmeticId: string) => void;
  onUnequip: (cosmeticId: string) => void;
}) {
  const owned = new Set(ownedCosmetics);
  // equipados DESTE personagem (posse é por conta — ver CosmeticsView)
  const equipped = player.cosmetics?.equipped ?? {};
  const rarityClass: Record<CosmeticDef['rarity'], string> = {
    comum: 'bg-amber-950/50 text-amber-300 border-amber-800/50',
    raro: 'bg-sky-950/50 text-sky-300 border-sky-800/50',
    'épico': 'bg-purple-950/50 text-purple-300 border-purple-800/50',
    'lendário': 'bg-yellow-950/60 text-yellow-300 border-yellow-700/60',
  };
  const SLOT_LABEL: Record<string, string> = {
    aura: 'Aura',
    outfit: 'Roupa',
    avatar: 'Avatar',
    frame: 'Moldura',
    title: 'Título',
    pose: 'Pose',
    effect: 'Efeito',
    background: 'Fundo',
    card: 'Card',
  };

  return (
    <>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {COSMETICS.map((c) => {
          const isOwned = owned.has(c.id);
          const isEquipped = equipped[c.slot] === c.id;
          const canBuy = !isOwned && player.crystals >= c.price;
          return (
            <GameCard
              key={c.id}
              className={`p-4 transition-all ${isEquipped ? 'border-yellow-600/70 shadow-md shadow-yellow-900/30' : isOwned ? 'opacity-90' : ''}`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div
                  className={`w-12 h-12 rounded-xl bg-black/40 border border-amber-800/40 flex items-center justify-center text-2xl shrink-0 ${
                    isEquipped ? (c.avatarGlowCss ?? c.previewCss ?? '') : (c.previewCss ?? '')
                  }`}
                  aria-hidden
                >
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-heading text-amber-100 text-sm leading-tight">{c.name}</h4>
                    <Chip className={rarityClass[c.rarity]}>{c.rarity}</Chip>
                  </div>
                  <p className="text-[11px] text-amber-200/50 mt-1 leading-snug">{c.description}</p>
                  <p className="text-[10px] text-amber-200/30 mt-1 uppercase tracking-wide">{SLOT_LABEL[c.slot] ?? c.slot}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading text-sky-300 text-sm flex items-center gap-1">
                  <Gem className="w-4 h-4" /> {c.price} cristais
                </span>
                {isOwned ? (
                  isEquipped ? (
                    <div className="flex flex-col items-end gap-1">
                      <Chip className="bg-yellow-950/70 text-yellow-300 border-yellow-600/60">✓ equipado</Chip>
                      <GameButton
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        title="Remover cosmético"
                        onClick={() => onUnequip(c.id)}
                      >
                        Desequipar
                      </GameButton>
                    </div>
                  ) : (
                    <GameButton
                      size="sm"
                      variant="gold"
                      disabled={busy}
                      title="Ativar o efeito deste cosmético"
                      onClick={() => onEquip(c.id)}
                    >
                      Equipar
                    </GameButton>
                  )
                ) : (
                  <GameButton size="sm" variant="gold" disabled={!canBuy || busy} onClick={() => onBuy(c.id)}>
                    Comprar
                  </GameButton>
                )}
              </div>
            </GameCard>
          );
        })}
      </div>

      {/* Produtos futuros */}
      <div>
        <h3 className="font-heading text-amber-100 mb-3">Em breve</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PRODUCTS.map((p) => (
            <GameCard key={p.id} className="p-4 opacity-70">
              <h4 className="font-heading text-amber-100 text-sm mb-1">{p.name}</h4>
              <p className="text-[11px] text-amber-200/50">{p.description}</p>
              <ul className="text-[11px] text-amber-200/40 mt-2 space-y-0.5 list-disc list-inside">
                {(p.vipBenefits ?? p.passBenefits?.premium ?? []).slice(0, 3).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <Chip className="mt-3 bg-black/40 text-amber-200/50 border-amber-900/50">🔒 em breve</Chip>
            </GameCard>
          ))}
        </div>
      </div>
    </>
  );
}
