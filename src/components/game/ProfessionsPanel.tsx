'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PROFESSIONS,
  PROFESSION_LEVELS,
  PROFESSION_MASTERY_HOURS,
  PROFESSION_SHIFTS,
  professionMaterialRequiredLevel,
  getProfession,
  professionLevel,
  professionLevelTitle,
  professionHoursIntoLevel,
  professionShiftRewards,
  academicXpBonusPct,
  DRAGON_BALL_SEARCH_ENERGY_COST,
  DRAGON_BALL_SEARCH_SHIFTS,
  getItem,
} from '@/lib/game/constants';
import { useServerNow } from '@/lib/game/clock';
import type { PlayerView, QuestView } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { fetchPanelJson, LoadFail, QuestsSkeleton } from './PanelLoad';
import { Coins, Timer, Hourglass, Gift, CalendarDays, Loader2, TrendingUp, Sparkles, XCircle } from 'lucide-react';

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'pronto!';
  // Arredondamento ÚNICO em toda a UI: sempre ceil — o display nunca diz
  // "pronto" antes de o SERVIDOR considerar pronto (v0.9.6, Mudança 1).
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

type Tab = 'search' | 'professions' | 'quests';

interface MaterialView {
  itemId: string;
  quantity: number;
  name: string;
  professionId: string | null;
  rarity: 'common' | 'rare' | null;
  tier: number | null;
  icon: string;
}

const ATTRIBUTE_LABEL: Record<string, string> = {
  strength: 'Força',
  defense: 'Defesa',
  speed: 'Velocidade',
  ki: 'Ki',
};

export function ProfessionsPanel({
  player,
  onAction,
  busy,
  onRefresh,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean>;
  busy: boolean;
  /** Busca estado fresco quando o turno acaba na tela. */
  onRefresh?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('professions');
  const [selectedHours, setSelectedHours] = useState<1 | 2 | 4 | 8>(1);
  const [materials, setMaterials] = useState<MaterialView[] | null>(null);
  const [materialsFailed, setMaterialsFailed] = useState(false);
  const now = useServerNow(250);
  const [confirmCancelKey, setConfirmCancelKey] = useState<string | null>(null);

  const active = player.activeMission;
  const claimable = player.claimableMission;
  const missionKey = active ? `${active.missionId}:${active.endsAt}` : null;
  const confirmCancel = confirmCancelKey !== null && confirmCancelKey === missionKey;
  const runningProf = active ? getProfession(active.missionId) : null;
  const claimableProf = claimable ? getProfession(claimable.missionId) : null;
  const currentProf = runningProf ?? claimableProf ?? null;
  const currentHours = active?.hours ?? claimable?.hours ?? 1;
  const jobDone = !!claimableProf;
  const remaining = active ? new Date(active.endsAt).getTime() - now : 0;
  const totalMs = active
    ? Math.max(1, new Date(active.endsAt).getTime() - new Date(active.startedAt).getTime())
    : currentHours * 3600_000;
  const progressPct =
    active && currentProf
      ? Math.max(0, Math.min(100, ((totalMs - remaining) / totalMs) * 100))
      : jobDone
        ? 100
        : 0;

  const profProgress = player.professions ?? {};
  const academicBonus = academicXpBonusPct(profProgress);

  const loadMaterials = useCallback(async () => {
    setMaterialsFailed(false);
    try {
      const res = await fetchPanelJson(`/api/game/professions?playerId=${player.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setMaterials(Array.isArray(data.materials) ? data.materials : []);
    } catch {
      setMaterialsFailed(true);
    }
  }, [player.id]);

  useEffect(() => {
    if (tab === 'professions') void loadMaterials();
  }, [tab, loadMaterials]);

  const expiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || remaining > 0) return;
    const key = `${active.missionId}:${active.endsAt}`;
    if (expiredRef.current === key) return;
    expiredRef.current = key;
    onRefresh?.();
  }, [active?.missionId, active?.endsAt, remaining, active, onRefresh]);

  const currentProgress = currentProf
    ? profProgress[currentProf.id] ?? {
        hours: 0,
        lifetimeHours: 0,
        prestige: 0,
        statMilliRemainder: 0,
        cycleStatGranted: 0,
      }
    : null;
  const currentPreview =
    currentProf && currentProgress
      ? professionShiftRewards(currentProgress.hours, currentHours, player.level)
      : null;

  return (
    <div className="space-y-6">
      <SectionTitle icon="🧭">Atividades</SectionTitle>

      <div className="flex gap-2" role="tablist">
        {(
          [
            { key: 'search', label: '🔮 Busca' },
            { key: 'professions', label: '💼 Profissões' },
            { key: 'quests', label: '📅 Diárias & Semanais' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`font-heading text-sm px-4 py-2 rounded-lg border transition-all ${
              tab === t.key
                ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white border-orange-400'
                : 'bg-black/30 text-amber-200/70 border-amber-900/40 hover:border-amber-600/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'search' ? (
        <DragonBallSearchTab player={player} onAction={onAction} busy={busy} />
      ) : tab === 'professions' ? (
        <>
          <GameCard className="p-4">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="font-heading text-amber-100">Duração do próximo turno</h3>
                <p className="text-xs text-amber-200/50 mt-1">
                  O XP do trabalho escala diretamente com o nível do personagem. Quanto maior o turno, maior também o bônus de XP e de chance de material raro.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PROFESSION_SHIFTS.map((shift) => (
                  <button
                    key={shift.hours}
                    type="button"
                    disabled={!!active || !!claimable}
                    onClick={() => setSelectedHours(shift.hours)}
                    className={`rounded-lg border px-2 py-2 text-center transition-all disabled:opacity-40 ${
                      selectedHours === shift.hours
                        ? 'border-orange-400 bg-orange-950/60 text-orange-200'
                        : 'border-amber-900/40 bg-black/20 text-amber-200/70 hover:border-amber-600/60'
                    }`}
                  >
                    <span className="font-heading block">{shift.hours}h</span>
                    <span className="text-[10px]">
                      {shift.efficiency <= 1
                        ? 'XP/raros base'
                        : `+${Math.round((shift.efficiency - 1) * 100)}% XP/raros`}
                    </span>
                  </button>
                ))}
              </div>
              {academicBonus > 0 && (
                <p className="text-xs text-sky-300/80">
                  🎓 Acadêmico: +{academicBonus.toLocaleString('pt-BR')}% de XP global ativo.
                </p>
              )}
            </div>
          </GameCard>

          {(active || claimable) && currentProf && currentProgress && currentPreview && (
            <GameCard className="p-5 border-orange-600/50" glow={jobDone}>
              <div className="flex items-start gap-4">
                <div className="text-4xl shrink-0 mt-1" aria-hidden>
                  {jobDone ? '🎁' : currentProf.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-heading text-amber-100 leading-tight">
                      {currentProf.name} — {professionLevelTitle(professionLevel(currentProgress))}
                    </h3>
                    <Chip
                      className={
                        jobDone
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
                          : 'bg-orange-950/60 text-orange-300 border-orange-800/50'
                      }
                    >
                      {jobDone ? <Gift className="w-3 h-3" /> : <Hourglass className="w-3 h-3" />}
                      {jobDone ? 'coleta pronta!' : `turno de ${currentHours}h`}
                    </Chip>
                  </div>

                  {!jobDone && (
                    <>
                      <p className="font-heading text-2xl text-amber-200 tabular-nums my-2">
                        ⏳ {formatCountdown(remaining)}
                      </p>
                      <div className="h-3 bg-black/50 rounded-full overflow-hidden border border-amber-900/40 mb-3">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-1000"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-amber-200/40">
                        Base do turno: {currentPreview.zeni.toLocaleString('pt-BR')} Zeni · {currentPreview.xp.toLocaleString('pt-BR')} XP · {currentPreview.efficiency <= 1 ? 'sem bônus de duração' : `bônus de duração +${Math.round((currentPreview.efficiency - 1) * 100)}% em XP/raros`}.
                      </p>
                      <div className="mt-3">
                        {confirmCancel ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2">
                            <span className="text-xs text-red-200/90 leading-snug">
                              Cancelar o turno? Você <b>não recebe nada</b> e pode recomeçar imediatamente.
                            </span>
                            <div className="flex gap-2">
                              <GameButton
                                size="sm"
                                variant="ghost"
                                className="!border-red-800/60 !text-red-200"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmCancelKey(null);
                                  void onAction({ type: 'cancel_mission' });
                                }}
                              >
                                <XCircle className="w-3.5 h-3.5" /> Sim, cancelar
                              </GameButton>
                              <GameButton size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmCancelKey(null)}>
                                Voltar
                              </GameButton>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmCancelKey(missionKey)}
                            disabled={busy}
                            className="text-xs text-red-300/70 hover:text-red-300 underline underline-offset-2 disabled:opacity-40"
                          >
                            Cancelar turno (sem recompensa)
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {jobDone && (
                    <>
                      <p className="text-sm text-emerald-300/90 my-2">
                        Turno de {currentHours}h concluído. Base prevista:{' '}
                        <span className="text-yellow-300">+{currentPreview.zeni.toLocaleString('pt-BR')} Zeni</span>{' '}
                        e <span className="text-orange-300">+{currentPreview.xp.toLocaleString('pt-BR')} XP</span>.
                        Bônus raciais, de guilda e Acadêmico são fechados pelo servidor na coleta.
                      </p>
                      <GameButton
                        variant="gold"
                        className="mt-1"
                        onClick={async () => {
                          const ok = await onAction({ type: 'claim_mission' });
                          if (ok !== false) void loadMaterials();
                        }}
                        disabled={busy}
                      >
                        <Gift className="w-4 h-4" /> Receber pagamento e loot
                      </GameButton>
                    </>
                  )}
                </div>
              </div>
            </GameCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {PROFESSIONS.map((prof) => {
              const prog = profProgress[prof.id] ?? {
                hours: 0,
                lifetimeHours: 0,
                prestige: 0,
                statMilliRemainder: 0,
                cycleStatGranted: 0,
              };
              const level = professionLevel(prog);
              const tier = PROFESSION_LEVELS[level - 1];
              const mastered = prog.hours >= PROFESSION_MASTERY_HOURS;
              const hoursInto = professionHoursIntoLevel(prog.hours);
              const progressTarget = tier.hoursInLevel;
              const careerPct = mastered ? 100 : Math.min(100, (hoursInto / progressTarget) * 100);
              const preview = professionShiftRewards(prog.hours, selectedHours, player.level);
              const shift = PROFESSION_SHIFTS.find((s) => s.hours === selectedHours)!;
              const rarePct = tier.rareChance * shift.efficiency * 100;
              const isActive = active?.missionId === prof.id || claimable?.missionId === prof.id;
              const blockedByActive = (!!active || !!claimable) && !isActive;
              const attributeLabel = prof.attribute ? ATTRIBUTE_LABEL[prof.attribute] : null;

              return (
                <GameCard
                  key={prof.id}
                  className={`p-5 relative overflow-hidden ${blockedByActive ? 'opacity-60' : ''} ${
                    isActive ? 'border-orange-500/60' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-3xl shrink-0 mt-1" aria-hidden>{prof.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-heading text-amber-100 leading-tight">{prof.name}</h3>
                        <Chip className="bg-purple-950/50 text-purple-300 border-purple-800/50">
                          {professionLevelTitle(level)}
                        </Chip>
                      </div>
                      <p className="text-xs text-amber-200/50 mt-1 leading-relaxed">{prof.description}</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[11px] text-amber-200/60 mb-1">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {mastered ? 'Carreira completa' : `Progresso do Nível ${level}`}
                      </span>
                      <span className="tabular-nums">
                        {mastered
                          ? `${PROFESSION_MASTERY_HOURS.toLocaleString('pt-BR')}h / ${PROFESSION_MASTERY_HOURS.toLocaleString('pt-BR')}h`
                          : `${hoursInto}h / ${progressTarget}h`}
                      </span>
                    </div>
                    <div className="h-2 bg-black/50 rounded-full overflow-hidden border border-amber-900/40">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400 rounded-full transition-all duration-500"
                        style={{ width: `${careerPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-amber-200/45 mt-1">
                      {prog.hours.toLocaleString('pt-BR')}h no ciclo · {prog.lifetimeHours.toLocaleString('pt-BR')}h históricas
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Chip className="bg-slate-950/50 text-slate-300 border-slate-700/50">
                      <Timer className="w-3 h-3" /> {selectedHours}h
                    </Chip>
                    <Chip className="bg-yellow-950/40 text-yellow-300 border-yellow-800/50">
                      <Coins className="w-3 h-3" /> ~{preview.zeni.toLocaleString('pt-BR')}
                    </Chip>
                    <Chip className="bg-orange-950/40 text-orange-300 border-orange-800/50">
                      ⭐ ~{preview.xp.toLocaleString('pt-BR')} XP
                    </Chip>
                    {attributeLabel ? (
                      <Chip className="bg-emerald-950/40 text-emerald-300 border-emerald-800/50">
                        +{Math.trunc(preview.attributeMilli / 1000).toLocaleString('pt-BR')} {attributeLabel}
                      </Chip>
                    ) : (
                      <Chip className="bg-sky-950/40 text-sky-300 border-sky-800/50">
                        🎓 XP global +{(level * 0.5).toLocaleString('pt-BR')}%
                      </Chip>
                    )}
                    <Chip className="bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-800/50">
                      💎 raro ~{rarePct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%/h
                    </Chip>
                  </div>

                  <p className="text-[11px] text-amber-200/45 mb-3">
                    XP: {tier.xpPerPlayerLevel} × seu nível por hora, antes do bônus de duração. Materiais também evoluem com a carreira: T1/Nv.1, T2/Nv.2, T3/Nv.4, T4/Nv.6 e T5/Nv.8. Comum: 1–2 unidades por hora garantidas entre os Tiers já desbloqueados. Turnos mais longos aumentam a chance de raro por hora.
                  </p>

                  {isActive ? (
                    <div className="flex items-center gap-2 text-orange-300 text-sm bg-orange-950/40 rounded-lg px-3 py-2 border border-orange-800/50">
                      <Hourglass className="w-4 h-4 animate-pulse" /> Turno em andamento
                    </div>
                  ) : blockedByActive ? (
                    <div className="flex items-center gap-2 text-amber-200/50 text-sm bg-black/30 rounded-lg px-3 py-2">
                      <Hourglass className="w-4 h-4" /> Você já está em um turno
                    </div>
                  ) : (
                    <GameButton
                      onClick={() => onAction({ type: 'mission', professionId: prof.id, hours: selectedHours })}
                      disabled={busy}
                      className="w-full"
                    >
                      Trabalhar ({selectedHours}h)
                    </GameButton>
                  )}
                </GameCard>
              );
            })}
          </div>

          <GameCard className="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-heading text-amber-100">Bolsa de materiais</h3>
                <p className="text-xs text-amber-200/50">Drops profissionais guardados no inventário relacional.</p>
              </div>
              <button
                type="button"
                className="text-xs text-amber-300/70 hover:text-amber-200"
                onClick={() => void loadMaterials()}
              >
                atualizar
              </button>
            </div>
            {materialsFailed && !materials ? (
              <LoadFail what="Os materiais profissionais" onRetry={() => void loadMaterials()} />
            ) : materials === null ? (
              <div className="flex items-center gap-2 text-sm text-amber-200/50">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando materiais…
              </div>
            ) : materials.length === 0 ? (
              <p className="text-sm text-amber-200/50">Nenhum material ainda. Conclua um turno para começar a coletar.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {materials.map((m) => (
                  <div key={m.itemId} className="rounded-lg border border-amber-900/30 bg-black/20 px-3 py-2 flex items-center gap-2">
                    <span className="text-xl" aria-hidden>{m.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-amber-100 truncate">{m.name}</div>
                      <div className="text-[10px] text-amber-200/45">
                        Tier {m.tier ?? '?'} · {m.rarity === 'rare' ? 'raro' : 'comum'}
                        {m.tier ? ` · libera no Nv. ${professionMaterialRequiredLevel(m.tier as 1 | 2 | 3 | 4 | 5)}` : ''}
                      </div>
                    </div>
                    <span className="font-heading text-amber-200 tabular-nums">×{m.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </GameCard>
        </>
      ) : (
        <QuestsTab player={player} onAction={onAction} busy={busy} />
      )}
    </div>
  );
}

function DragonBallSearchTab({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean>;
  busy: boolean;
}) {
  const complete = player.dragonBalls >= 7;
  const now = useServerNow(1000);
  const [selectedHours, setSelectedHours] = useState<1 | 2 | 4 | 8 | 12>(4);
  const search = player.runningActivity?.kind === 'dragon_ball_search' ? player.runningActivity : null;
  const accessory = player.items.accessory ? getItem(player.items.accessory) : null;
  const itemBonus = Math.max(0, accessory?.dragonBallSearchChanceBonus ?? 0);
  const baseChance = DRAGON_BALL_SEARCH_SHIFTS.find((shift) => shift.hours === selectedHours)?.chance ?? 0;
  const chance = Math.min(0.2, baseChance + itemBonus);
  const remaining = search ? Math.max(0, new Date(search.endsAt).getTime() - now) : 0;
  const totalHours = search ? Math.max(1, Math.ceil((new Date(search.endsAt).getTime() - new Date(search.startedAt).getTime()) / 3600000)) : 0;
  const countdown = remaining > 0
    ? `${Math.floor(remaining / 3600000)}h ${String(Math.floor((remaining % 3600000) / 60000)).padStart(2, '0')}m`
    : 'pronta para concluir';
  return (
    <div className="space-y-4">
      <GameCard className="p-6 border-yellow-700/50" glow={complete}>
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="text-6xl shrink-0 text-center" aria-hidden>🔮</div>
          <div className="flex-1">
            <h3 className="font-heading text-xl text-amber-100">Busca pelas Esferas</h3>
            <p className="text-sm text-amber-200/60 mt-1 leading-relaxed">Escolha quanto tempo seu radar ficará procurando. Quanto maior o turno, maior a chance, até 20%. Cada busca encontra no máximo uma esfera.</p>
            {search && (
              <div className="mt-3 rounded-lg border border-orange-700/50 bg-orange-950/30 p-3">
                <p className="font-heading text-orange-200">Busca em andamento: {totalHours}h</p>
                <p className="text-2xl text-amber-100 tabular-nums mt-1">⏳ {countdown}</p>
                <p className="text-xs text-amber-200/50">A esfera será aplicada apenas quando a busca terminar.</p>
              </div>
            )}
            {!search && (
              <div className="grid grid-cols-5 gap-2 mt-4">
                {DRAGON_BALL_SEARCH_SHIFTS.map((shift) => (
                  <button
                    key={shift.hours}
                    type="button"
                    onClick={() => setSelectedHours(shift.hours)}
                    disabled={busy || complete}
                    className={`rounded-lg border px-2 py-2 text-center transition-all disabled:opacity-40 ${selectedHours === shift.hours ? 'border-yellow-400 bg-yellow-950/60 text-yellow-200' : 'border-amber-900/40 bg-black/20 text-amber-200/70'}`}
                  >
                    <span className="font-heading block">{shift.hours}h</span>
                    <span className="text-[10px]">{Math.round(Math.min(0.2, shift.chance + itemBonus) * 100)}%</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <Chip className="bg-yellow-950/50 text-yellow-300 border-yellow-800/50">🔮 {player.dragonBalls}/7 coletadas</Chip>
              <Chip className="bg-amber-950/50 text-amber-200 border-amber-800/50">⚡ -{DRAGON_BALL_SEARCH_ENERGY_COST} energia</Chip>
              <Chip className="bg-sky-950/50 text-sky-300 border-sky-800/50">🎯 {Math.round(chance * 100)}% de chance</Chip>
              {itemBonus > 0 && <Chip className="bg-emerald-950/50 text-emerald-300 border-emerald-800/50">📟 +{Math.round(itemBonus * 100)}% do acessório</Chip>}
            </div>
          </div>
          <GameButton
            variant="gold"
            className="shrink-0"
            disabled={busy || complete || !!search || player.energy < DRAGON_BALL_SEARCH_ENERGY_COST}
            onClick={() => void onAction({ type: 'search_dragon_ball', hours: selectedHours })}
          >
            {complete ? 'Conjunto completo' : search ? 'Busca em andamento' : player.energy < DRAGON_BALL_SEARCH_ENERGY_COST ? 'Sem energia' : `Iniciar busca (${selectedHours}h)`}
          </GameButton>
        </div>
      </GameCard>
      <GameCard className="p-4">
        <p className="text-xs text-amber-200/55 leading-relaxed">
          ⚔️ Uma vitória no PvP também pode roubar 1 Esfera do Dragão do adversário. Proteja sua coleção escolhendo bem seus duelos.
        </p>
      </GameCard>
    </div>
  );
}

// ===== Quests diárias/semanais =====

function QuestsTab({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [quests, setQuests] = useState<QuestView[] | null>(null);
  // v0.9.24 (B1): falha de carregamento → estado amigável + retry (8s)
  const [questsFailed, setQuestsFailed] = useState(false);

  const load = useCallback(async () => {
    setQuestsFailed(false);
    try {
      const res = await fetchPanelJson(`/api/game/quests?playerId=${player.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setQuests(data.quests ?? []);
    } catch {
      // v0.9.24 (B1): o LoadFail só aparece sem lista na tela — o
      // if (!quests) abaixo é quem decide o que renderizar
      setQuestsFailed(true);
    }
  }, [player.id]);

  useEffect(() => {
    // fetch on mount: setState só ocorre após o await (assíncrono)

    load();
  }, [load]);

  if (!quests) {
    return (
      <div className="space-y-4">
        {questsFailed ? (
          <LoadFail what="As missões diárias" onRetry={() => void load()} />
        ) : (
          <QuestsSkeleton />
        )}
      </div>
    );
  }

  const daily = quests.filter((q) => q.kind === 'daily');
  const weekly = quests.filter((q) => q.kind === 'weekly');

  const renderQuest = (q: QuestView) => {
    const pct = Math.min(100, (q.progress / q.target) * 100);
    return (
      <GameCard key={q.questId} className={`p-4 ${q.ready && !q.claimed ? 'ring-1 ring-emerald-500/50' : q.claimed ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="text-3xl shrink-0 mt-0.5" aria-hidden>
            {q.claimed ? '✅' : q.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className="font-heading text-amber-100 text-sm">{q.name}</h4>
              {q.claimed ? (
                <Chip className="bg-emerald-900/60 text-emerald-300 border-emerald-700/60">concluída</Chip>
              ) : q.ready ? (
                <Chip className="bg-yellow-900/60 text-yellow-300 border-yellow-700/60 animate-pulse">pronta!</Chip>
              ) : null}
            </div>
            <p className="text-[11px] text-amber-200/50">{q.description}</p>

            {/* Progresso */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-2.5 bg-black/50 rounded-full overflow-hidden border border-amber-900/40">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    q.ready ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-orange-500 to-amber-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-heading text-xs text-amber-200 tabular-nums whitespace-nowrap">
                {q.progress} / {q.target}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {q.rewardZeni > 0 && (
                <Chip className="bg-yellow-950/40 text-yellow-300 border-yellow-800/50">
                  <Coins className="w-3 h-3" /> {q.rewardZeni.toLocaleString('pt-BR')}
                </Chip>
              )}
              {q.rewardXp > 0 && (
                <Chip className="bg-orange-950/40 text-orange-300 border-orange-800/50">⭐ {q.rewardXp} XP</Chip>
              )}
              {q.rewardCrystals > 0 && (
                <Chip className="bg-sky-950/50 text-sky-300 border-sky-800/50">💎 {q.rewardCrystals}</Chip>
              )}
            </div>
          </div>
          {q.ready && !q.claimed && (
            <GameButton
              size="sm"
              variant="gold"
              disabled={busy}
              onClick={async () => {
                // v0.9.24 (B2): recompensa anunciada no card → delta
                // otimista CONSISTENTE (XP + level-up + carry atômicos);
                // a resposta do servidor reconcilia com a verdade.
                await onAction({
                  type: 'claim_quest',
                  questId: q.questId,
                  optimistic: { zeni: q.rewardZeni, xp: q.rewardXp, crystals: q.rewardCrystals },
                });
                load();
              }}
            >
              <Gift className="w-3.5 h-3.5" /> Coletar
            </GameButton>
          )}
        </div>
      </GameCard>
    );
  };

  return (
    <div className="space-y-6">

      <div>
        <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Diárias
        </h3>
        <div className="space-y-3">{daily.map(renderQuest)}</div>
      </div>

      <div>
        <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2">
          <Timer className="w-4 h-4" /> Semanais
        </h3>
        <div className="space-y-3">{weekly.map(renderQuest)}</div>
      </div>
    </div>
  );
}
