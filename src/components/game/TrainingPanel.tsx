'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  TRAINING_MASTERS,
  TECHNIQUES,
  TRAIN_ENERGY_COST,
  getTechnique,
  trainingCost,
  trainingGain,
  STRATEGY_LIST,
  TRANSFORMATIONS,
  getTransformation,
  RACES,
} from '@/lib/game/constants';
import type { PlayerView, Loadout, LoadoutSlot, TechniqueDef } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { Swords, Shield, Gauge, Sparkles, Coins, Zap, Lock, Check, GraduationCap, Brain, Swords as SwordsIcon } from 'lucide-react';

const STATS = [
  { key: 'strength', label: 'Força', icon: <Swords className="w-5 h-5" />, color: 'text-orange-400', ring: 'ring-orange-500/30' },
  { key: 'defense', label: 'Defesa', icon: <Shield className="w-5 h-5" />, color: 'text-emerald-400', ring: 'ring-emerald-500/30' },
  { key: 'speed', label: 'Velocidade', icon: <Gauge className="w-5 h-5" />, color: 'text-amber-300', ring: 'ring-amber-400/30' },
  { key: 'ki', label: 'Ki', icon: <Sparkles className="w-5 h-5" />, color: 'text-rose-400', ring: 'ring-rose-500/30' },
] as const;

type StatKey = (typeof STATS)[number]['key'];

type Tab = 'train' | 'loadout' | 'strategy' | 'transform';

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'train', label: 'Atributos & Mestres', icon: '💪' },
  { key: 'loadout', label: 'Loadout de Batalha', icon: '🎯' },
  { key: 'strategy', label: 'Estratégia', icon: '🧠' },
  { key: 'transform', label: 'Transformações', icon: '⚡' },
];

function techniqueDetailLabels(tech: TechniqueDef): string[] {
  const labels = [
    `Poder ×${tech.power.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ];
  if (tech.accuracy !== 0) {
    labels.push(`Precisão ${tech.accuracy > 0 ? '+' : ''}${Math.round(tech.accuracy * 100)}%`);
  }
  if (tech.effects?.defensePierce) {
    labels.push(`Ignora ${Math.round(tech.effects.defensePierce * 100)}% DEF`);
  }
  if (tech.effects?.selfHealPct) {
    labels.push(`Cura ${Math.round(tech.effects.selfHealPct * 100)}% HP`);
  }
  return labels;
}

export function TrainingPanel({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean | void>;
  busy: boolean;
}) {
  const [tab, setTab] = useState<Tab>('train');
  const [selectedSlot, setSelectedSlot] = useState<LoadoutSlot>('1');

  const learned = useMemo(
    () => player.techniques.map((id) => getTechnique(id)).filter((t): t is NonNullable<typeof t> => Boolean(t)),
    [player.techniques]
  );

  const myTransformations = useMemo(
    () => TRANSFORMATIONS.filter((t) => t.race === player.race || t.race === 'any').sort((a, b) => a.order - b.order),
    [player.race]
  );

  // v0.9 — TREINO INSTANTÂNEO: o servidor aplica o ganho na hora; aqui
  // apenas repassamos o resultado para disparar a micro-animação do botão.
  const handleAction = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      return (await onAction(payload)) === true;
    },
    [onAction]
  );

  return (
    <div className="space-y-6">
      <SectionTitle icon="🥋">Sala do Guerreiro</SectionTitle>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`font-heading text-sm px-4 py-2 rounded-lg border whitespace-nowrap transition-all ${
              tab === t.key
                ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white border-orange-400'
                : 'bg-black/30 text-amber-200/70 border-amber-900/40 hover:border-amber-600/50'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'train' && <TrainTab player={player} onAction={handleAction} busy={busy} learned={learned} />}
      {tab === 'loadout' && (
        <LoadoutTab player={player} onAction={onAction} busy={busy} learned={learned} selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot} />
      )}
      {tab === 'strategy' && <StrategyTab player={player} onAction={onAction} busy={busy} />}
      {tab === 'transform' && <TransformTab player={player} onAction={onAction} busy={busy} transformations={myTransformations} />}
    </div>
  );
}

// ===== TAB: TREINO + MESTRES =====

function TrainTab({
  player,
  onAction,
  busy,
  learned,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  learned: ReturnType<typeof getTechnique>[];
}) {
  // v0.9 — "puladinha" do botão após um treino aplicado com sucesso
  const [bounce, setBounce] = useState<string | null>(null);

  const handleTrain = async (statKey: 'strength' | 'defense' | 'speed' | 'ki') => {
    const ok = await onAction({ type: 'train', stat: statKey });
    if (ok) {
      setBounce(statKey);
      setTimeout(() => setBounce((b) => (b === statKey ? null : b)), 320);
    }
  };
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {STATS.map((stat) => {
          const value = player[stat.key];
          const cost = trainingCost(value, player.race);
          const gain = trainingGain(player.items.owned, stat.key);
          const canAfford = player.zeni >= cost && player.energy >= TRAIN_ENERGY_COST;
          return (
            <GameCard key={stat.key} className={`p-5 ring-1 ${stat.ring}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-black/40 rounded-lg">{stat.icon}</div>
                  <div>
                    <h3 className={`font-heading text-lg ${stat.color}`}>{stat.label}</h3>
                    <p className="text-xs text-amber-200/40">valor atual</p>
                  </div>
                </div>
                <span className="font-heading text-4xl text-amber-100">{value}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-amber-200/60">
                  <p className="flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-yellow-500" />
                    {cost.toLocaleString('pt-BR')} Zeni
                  </p>
                  <p className="flex items-center gap-1 mt-0.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> {TRAIN_ENERGY_COST} energia
                    {gain > 1 && <span className="text-emerald-400 font-heading"> • rende +{gain}</span>}
                  </p>
                </div>
                <GameButton
                  onClick={() => handleTrain(stat.key)}
                  disabled={!canAfford || busy || value >= 999}
                  className={bounce === stat.key ? 'animate-train-pop' : undefined}
                >
                  {value >= 999 ? 'MÁXIMO' : `Treinar +${gain}`}
                </GameButton>
              </div>

            </GameCard>
          );
        })}
      </div>

      {/* ===== Mestres ===== */}
      <SectionTitle icon="🧙">Mestres & Técnicas</SectionTitle>

      <GameCard className="p-4">

        {learned.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {learned.map((tech) => {
              const equipped = (['1', '2', '3', 'S'] as const).some((s) => player.loadout[s] === tech!.id);
              return (
                <Chip
                  key={tech!.id}
                  className={
                    tech!.type === 'energy'
                      ? 'bg-rose-950/50 text-rose-300 border-rose-800/50'
                      : 'bg-orange-950/50 text-orange-300 border-orange-800/50'
                  }
                >
                  {tech!.icon} {tech!.name}
                  {equipped ? ' ✓' : ''}
                </Chip>
              );
            })}
          </div>
        )}
      </GameCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {TRAINING_MASTERS.map((master) => {
          const masterTechniques = master.techniques
            .map((id) => TECHNIQUES.find((t) => t.id === id))
            .filter(Boolean) as typeof TECHNIQUES;
          return (
            <GameCard key={master.id} className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${master.gradient} flex items-center justify-center text-3xl shrink-0 border border-amber-700/40 shadow-lg shadow-black/30`}
                  role="img"
                  aria-label={`Mestre ${master.name}`}
                >
                  {master.emoji}
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading text-amber-100 text-lg leading-tight">{master.name}</h3>
                  <p className="text-xs text-amber-200/50">
                    {master.title} • 📍 {master.location}
                  </p>
                  <p className="text-[11px] text-amber-200/40 italic mt-1 leading-snug">{master.quote}</p>
                </div>
              </div>

              <div className="space-y-2">
                {masterTechniques.map((tech) => {
                  const isLearned = player.techniques.includes(tech.id);
                  const levelOk = player.level >= tech.minLevel;
                  const canLearn = !isLearned && levelOk && player.zeni >= tech.price;
                  return (
                    <div
                      key={tech.id}
                      className={`rounded-lg border px-3 py-2.5 ${
                        isLearned
                          ? 'bg-emerald-950/30 border-emerald-800/40'
                          : !levelOk
                          ? 'bg-black/30 border-amber-900/30 opacity-70'
                          : 'bg-black/30 border-amber-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <p className="text-sm text-amber-100 flex items-center gap-1.5 flex-wrap">
                            <span aria-hidden>{tech.icon}</span> {tech.name}
                            <Chip
                              className={
                                tech.type === 'energy'
                                  ? 'bg-rose-950/60 text-rose-300 border-rose-800/50'
                                  : 'bg-orange-950/60 text-orange-300 border-orange-800/50'
                              }
                            >
                              {tech.type === 'energy' ? '✨ Ki' : '⚔️ Força'}
                            </Chip>
                            {tech.category === 'supreme' && (
                              <Chip className="bg-purple-950/60 text-purple-300 border-purple-800/50">SUPREMA</Chip>
                            )}
                          </p>
                          <p className="text-[11px] text-amber-200/50 mt-1 leading-snug">{tech.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          {techniqueDetailLabels(tech).map((label) => (
                            <Chip key={label} className="bg-black/40 text-amber-200/70 border-amber-900/50">{label}</Chip>
                          ))}
                          <Chip className="bg-black/40 text-sky-300/80 border-sky-900/50">{tech.kiCost} Ki</Chip>
                          {tech.minLevel > 1 && (
                            <Chip className="bg-black/40 text-amber-200/60 border-amber-900/50">Nv {tech.minLevel}+</Chip>
                          )}
                        </div>
                        {isLearned ? (
                          <Chip className="bg-emerald-900/60 text-emerald-300 border-emerald-700/60">
                            <Check className="w-3 h-3" /> dominada
                          </Chip>
                        ) : !levelOk ? (
                          <span className="text-[11px] text-amber-200/50 flex items-center gap-1 whitespace-nowrap">
                            <Lock className="w-3 h-3" /> Nível {tech.minLevel}
                          </span>
                        ) : (
                          <GameButton
                            size="sm"
                            variant="gold"
                            onClick={() => onAction({ type: 'learn_technique', techniqueId: tech.id })}
                            disabled={!canLearn || busy}
                          >
                            <GraduationCap className="w-4 h-4" /> {tech.price.toLocaleString('pt-BR')} Zeni
                          </GameButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </GameCard>
          );
        })}
      </div>
    </>
  );
}

// ===== TAB: LOADOUT =====

function LoadoutTab({
  player,
  onAction,
  busy,
  learned,
  selectedSlot,
  setSelectedSlot,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void;
  busy: boolean;
  learned: ReturnType<typeof getTechnique>[];
  selectedSlot: LoadoutSlot;
  setSelectedSlot: (s: LoadoutSlot) => void;
}) {
  const loadout = player.loadout;

  return (
    <>

      {/* Slots */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['1', '2', '3', 'S'] as const).map((slot) => {
          const tech = loadout[slot] ? getTechnique(loadout[slot]!) : null;
          const isSupreme = slot === 'S';
          return (
            <GameCard
              key={slot}
              className={`p-4 cursor-pointer transition-all ${selectedSlot === slot ? 'ring-2 ring-orange-500/60' : ''} ${
                isSupreme ? 'border-purple-800/50' : ''
              }`}
            >
              <button className="w-full text-left" onClick={() => setSelectedSlot(slot)}>
                <p className="text-[10px] uppercase tracking-widest text-amber-200/40 font-heading mb-2">
                  {isSupreme ? '⭐ Técnica Suprema' : `Técnica ${slot}`}
                </p>
                {tech ? (
                  <div className="text-center">
                    <p className="text-3xl mb-1" aria-hidden>
                      {tech.icon}
                    </p>
                    <p className="font-heading text-amber-100 text-sm leading-tight">{tech.name}</p>

                  </div>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-3xl text-amber-200/20 mb-1" aria-hidden>
                      ＋
                    </p>
                    <p className="text-xs text-amber-200/30 italic">vazio</p>
                  </div>
                )}
              </button>
              {tech && (
                <button
                  onClick={() => onAction({ type: 'equip_technique', slot, techniqueId: null })}
                  disabled={busy}
                  className="w-full mt-2 text-[10px] text-red-300/70 hover:text-red-300 font-heading"
                >
                  remover
                </button>
              )}
            </GameCard>
          );
        })}
      </div>

      {/* Técnicas aprendidas */}
      <div>
        <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2">
          <SwordsIcon className="w-4 h-4" /> Equipar no slot {selectedSlot === 'S' ? 'Supremo' : selectedSlot}
        </h3>
        {learned.length === 0 ? (
          <GameCard className="p-6 text-center text-amber-200/50 text-sm">
            Você ainda não domina nenhuma técnica. Aprenda com os mestres na aba "Atributos & Mestres"!
          </GameCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {learned.map((tech) => {
              const slotNow = (['1', '2', '3', 'S'] as const).find((s) => loadout[s] === tech!.id);
              const validSlot = tech!.category === 'supreme' ? ['S'] : ['1', '2', '3'];
              const slotCompatible = validSlot.includes(selectedSlot);
              return (
                <GameCard key={tech!.id} className={`p-4 ${!slotCompatible ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-amber-100 flex items-center gap-1.5">
                        <span className="text-xl" aria-hidden>
                          {tech!.icon}
                        </span>
                        {tech!.name}
                        {tech!.category === 'supreme' && (
                          <Chip className="bg-purple-950/60 text-purple-300 border-purple-800/50">S</Chip>
                        )}
                      </p>
                      <p className="text-[11px] text-amber-200/50 mt-1 leading-snug">{tech!.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {techniqueDetailLabels(tech!).map((label) => (
                          <Chip key={label} className="bg-black/40 text-amber-200/70 border-amber-900/50">{label}</Chip>
                        ))}
                        <Chip className="bg-black/40 text-sky-300/80 border-sky-900/50">{tech!.kiCost} Ki</Chip>
                      </div>
                    </div>
                    {slotNow ? (
                      <Chip className="bg-emerald-900/60 text-emerald-300 border-emerald-700/60 shrink-0">
                        <Check className="w-3 h-3" /> slot {slotNow === 'S' ? 'S' : slotNow}
                      </Chip>
                    ) : (
                      <GameButton
                        size="sm"
                        disabled={busy || !slotCompatible}
                        onClick={() => onAction({ type: 'equip_technique', slot: selectedSlot, techniqueId: tech!.id })}
                      >
                        equipar
                      </GameButton>
                    )}
                  </div>
                </GameCard>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ===== TAB: ESTRATÉGIA =====

function StrategyTab({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void;
  busy: boolean;
}) {
  return (
    <>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {STRATEGY_LIST.map((s) => {
          const active = player.strategy === s.id;
          return (
            <GameCard key={s.id} className={`p-5 ${active ? 'ring-2 ring-orange-500/60' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <span className="text-3xl" aria-hidden>
                  {s.icon}
                </span>
                {active && (
                  <Chip className="bg-orange-900/60 text-orange-300 border-orange-700/60">ativa</Chip>
                )}
              </div>
              <h3 className="font-heading text-amber-100 text-lg">{s.name}</h3>
              <p className="text-xs text-amber-200/55 mt-1 leading-relaxed">{s.description}</p>

              <GameButton
                className="w-full mt-3"
                variant={active ? 'ghost' : 'primary'}
                disabled={busy || active}
                onClick={() => onAction({ type: 'set_strategy', strategy: s.id })}
              >
                {active ? 'Em uso' : 'Adotar estratégia'}
              </GameButton>
            </GameCard>
          );
        })}
      </div>
    </>
  );
}

// ===== TAB: TRANSFORMAÇÕES =====

function TransformTab({
  player,
  onAction,
  busy,
  transformations,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void;
  busy: boolean;
  transformations: ReturnType<typeof getTransformation>[];
}) {
  const owned = new Set(player.transformationsOwned);
  const race = RACES[player.race];

  const checkReq = (tr: NonNullable<ReturnType<typeof getTransformation>>): { ok: boolean; missing: string[] } => {
    const missing: string[] = [];
    if (player.level < tr.minLevel) missing.push(`Nível ${tr.minLevel}`);
    if (tr.requiredStats) {
      if (tr.requiredStats.strength && player.strength < tr.requiredStats.strength) missing.push(`Força ${tr.requiredStats.strength}`);
      if (tr.requiredStats.defense && player.defense < tr.requiredStats.defense) missing.push(`Defesa ${tr.requiredStats.defense}`);
      if (tr.requiredStats.speed && player.speed < tr.requiredStats.speed) missing.push(`Velocidade ${tr.requiredStats.speed}`);
      if (tr.requiredStats.ki && player.ki < tr.requiredStats.ki) missing.push(`Ki ${tr.requiredStats.ki}`);
    }
    if (tr.requiresTransformation && !owned.has(tr.requiresTransformation)) {
      missing.push(getTransformation(tr.requiresTransformation)?.name ?? tr.requiresTransformation);
    }
    if (tr.requiredTechnique && !player.techniques.includes(tr.requiredTechnique)) {
      missing.push(`Técnica ${getTechnique(tr.requiredTechnique)?.name ?? tr.requiredTechnique}`);
    }
    return { ok: missing.length === 0, missing };
  };

  const orders = [...new Set(transformations.map((t) => t!.order))].sort((a, b) => a - b);

  return (
    <>

      {/* Árvore por profundidade */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-black/40 border border-amber-800/50 flex items-center justify-center text-xl" aria-hidden>
            🧍
          </div>
          <div>
            <p className="font-heading text-amber-100 text-sm">Forma Base</p>
            <p className="text-[11px] text-amber-200/40">Todo guerreiro começa daqui</p>
          </div>
          {!player.transformation && (
            <Chip className="bg-emerald-900/60 text-emerald-300 border-emerald-700/60 ml-2">ativa</Chip>
          )}
        </div>

        {orders.map((order) => (
          <div key={order} className="relative pl-5 border-l-2 border-amber-900/40 ml-5 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-amber-200/30 font-heading -ml-5">
              camada {order}
            </p>
            {transformations
              .filter((t) => t!.order === order)
              .map((tr) => {
                const isOwned = owned.has(tr!.id);
                const isActive = player.transformation?.id === tr!.id;
                const req = checkReq(tr!);
                return (
                  <GameCard
                    key={tr!.id}
                    className={`p-4 ${isActive ? 'ring-2 ring-purple-500/60' : ''} ${!isOwned && !req.ok ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tr!.color} flex items-center justify-center text-2xl shrink-0 border border-amber-700/40`}
                        aria-hidden
                      >
                        {tr!.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-heading text-amber-100 text-sm">{tr!.name}</h4>
                          {isActive && (
                            <Chip className="bg-purple-900/60 text-purple-300 border-purple-700/60">ativa</Chip>
                          )}
                          {isOwned && !isActive && (
                            <Chip className="bg-emerald-900/50 text-emerald-300 border-emerald-800/50">desbloqueada</Chip>
                          )}
                        </div>
                        <p className="text-xs text-amber-200/55 mt-1.5 leading-relaxed">{tr!.description}</p>

                        {!isOwned && req.missing.length > 0 && (
                          <p className="text-[11px] text-red-300/70 mt-1.5">🔒 Requisitos: {req.missing.join(' · ')}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {!isOwned ? (
                          <GameButton
                            size="sm"
                            variant="gold"
                            disabled={busy || !req.ok}
                            onClick={() => onAction({ type: 'unlock_transformation', transformationId: tr!.id })}
                          >
                            Desbloquear
                          </GameButton>
                        ) : !isActive ? (
                          <GameButton
                            size="sm"
                            disabled={busy}
                            onClick={() => onAction({ type: 'activate_transformation', transformationId: tr!.id })}
                          >
                            Ativar
                          </GameButton>
                        ) : (
                          <GameButton
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => onAction({ type: 'activate_transformation', transformationId: null })}
                          >
                            Voltar à base
                          </GameButton>
                        )}
                      </div>
                    </div>
                  </GameCard>
                );
              })}
          </div>
        ))}
      </div>
    </>
  );
}
