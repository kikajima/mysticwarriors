'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PROFESSIONS,
  PROFESSION_RANKS,
  PROFESSION_MAX_RANK,
  getProfession,
  professionRankTitle,
  professionXpReward,
} from '@/lib/game/constants';
import { useServerNow } from '@/lib/game/clock';
import type { PlayerView, QuestView } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { fetchPanelJson, LoadFail, QuestsSkeleton } from './PanelLoad';
import { Zap, Coins, Timer, Hourglass, Gift, CalendarDays, Loader2, TrendingUp, Award, Sparkles, XCircle } from 'lucide-react';

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

type Tab = 'professions' | 'quests';

export function ProfessionsPanel({
  player,
  onAction,
  busy,
  onRefresh,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void;
  busy: boolean;
  /** v0.9.2: busca estado fresco quando o turno acaba na tela — o botão
   * "Receber pagamento" aparece em ~1s em vez de esperar o polling de 15s */
  onRefresh?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('professions');
  // v0.9.6 (Mudança 1): contador pelo RELÓGIO DO SERVIDOR — o fim do
  // turno é um timestamp do servidor (missionEndsAt, UTC); contar pelo
  // relógio do navegador atrasava/adiantava o "pronto!" conforme o
  // dispositivo. Refresco de 250ms: só atualiza o display, nunca conta
  // ticks (aba em segundo plano não acumula erro — ao voltar, o restante
  // é recalculado do timestamp real).
  const now = useServerNow(250);
  // v0.9.6 (Mudança 2): confirmação de cancelamento AMARRADA ao turno —
  // se o turno muda (cancelado/coletado/expirou), a confirmação some
  // sozinha (estado derivado, sem efeito colateral).
  const [confirmCancelKey, setConfirmCancelKey] = useState<string | null>(null);

  // Interpretação UNIFICADA pelo servidor (mesma da v0.4):
  //  * activeMission = timer do trabalho CORRENDO (bloqueia ações);
  //  * claimableMission = terminou, aguardando coleta (NÃO bloqueia).
  const active = player.activeMission;
  const claimable = player.claimableMission;
  const missionKey = active ? `${active.missionId}:${active.endsAt}` : null;
  // confirmação visível SÓ enquanto o MESMO turno estiver em andamento
  const confirmCancel = confirmCancelKey !== null && confirmCancelKey === missionKey;
  const runningProf = active ? getProfession(active.missionId) : null;
  const claimableProf = claimable ? getProfession(claimable.missionId) : null;
  const currentProf = runningProf ?? claimableProf ?? null;
  const jobDone = !!claimableProf;
  const remaining = active ? new Date(active.endsAt).getTime() - now : 0;
  const totalMs = currentProf ? currentProf.durationMin * 60000 : 0;
  const progressPct =
    active && currentProf
      ? Math.max(0, Math.min(100, ((totalMs - remaining) / totalMs) * 100))
      : jobDone
        ? 100
        : 0;

  // progresso por profissão (rank/completions) — fonte: servidor
  const profProgress = player.professions ?? {};

  // v0.9.2 — o cronômetro chegou a zero NA TELA: busca estado fresco UMA
  // vez por turno para revelar o botão "Receber pagamento" na hora
  // (antes: esperava silenciosamente o polling de 15s)
  const expiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || remaining > 0) return;
    const key = `${active.missionId}:${active.endsAt}`;
    if (expiredRef.current === key) return;
    expiredRef.current = key;
    onRefresh?.();
  }, [active?.missionId, active?.endsAt, remaining, active, onRefresh]);

  return (
    <div className="space-y-6">
      <SectionTitle icon="💼">Profissões</SectionTitle>

      <div className="flex gap-2" role="tablist">
        {(
          [
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

      {tab === 'professions' ? (
        <>
          <GameCard className="p-4">
            <p className="text-sm text-amber-200/70 leading-relaxed">
              Cada profissão tem um turno de <span className="text-amber-100">1 hora</span> que rende{' '}
              <span className="text-yellow-400">Zeni</span>, <span className="text-orange-400">XP</span> e pode render{' '}
              <span className="text-yellow-300">Esferas do Dragão</span>. Conclua turnos para ser{' '}
              <span className="text-emerald-300">promovido</span> — cada promoção paga um bônus e aumenta o salário,
              até <span className="text-amber-100">5x o valor inicial</span>.
            </p>
            <div className="flex items-center gap-2 mt-3 text-xs text-emerald-300/80">
              <Zap className="w-4 h-4 text-emerald-400" /> Trabalhar não gasta energia — só o seu tempo.
            </div>
          </GameCard>

          {/* Trabalho em andamento */}
          {(active || claimable) && currentProf && (
            <GameCard className="p-5 border-orange-600/50" glow={jobDone}>
              <div className="flex items-start gap-4">
                <div className="text-4xl shrink-0 mt-1" aria-hidden>
                  {jobDone ? '🎁' : currentProf.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-heading text-amber-100 leading-tight">
                      {currentProf.name} —{' '}
                      {professionRankTitle(currentProf, profProgress[currentProf.id]?.rank ?? 1)}
                    </h3>
                    <Chip
                      className={
                        jobDone
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
                          : 'bg-orange-950/60 text-orange-300 border-orange-800/50'
                      }
                    >
                      {jobDone ? <Gift className="w-3 h-3" /> : <Hourglass className="w-3 h-3" />}
                      {jobDone ? 'pagamento pronto!' : 'em turno'}
                    </Chip>
                  </div>

                  {!jobDone && (
                    <>
                      <p className="font-heading text-2xl text-amber-200 tabular-nums my-2">⏳ {formatCountdown(remaining)}</p>
                      <div className="h-3 bg-black/50 rounded-full overflow-hidden border border-amber-900/40 mb-3">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-1000"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-amber-200/40">
                        Volte quando o turno acabar para receber o pagamento.
                      </p>
                      {/* v0.9.6 (Mudança 2): cancelar o turno em andamento —
                          confirmação em DOIS cliques contra toque acidental.
                          Sem recompensa alguma (nem parcial); a profissão
                          fica livre para começar de novo na hora. */}
                      <div className="mt-3">
                        {confirmCancel ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2">
                            <span className="text-xs text-red-200/90 leading-snug">
                              Cancelar o turno? Você <b>não recebe nada</b> (nem parcial) e o trabalho fica livre para
                              recomeçar.
                            </span>
                            <div className="flex gap-2">
                              <GameButton
                                size="sm"
                                variant="ghost"
                                className="!border-red-800/60 !text-red-200"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmCancelKey(null);
                                  onAction({ type: 'cancel_mission' });
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
                        O turno foi concluído! Colete seu pagamento:{' '}
                        <span className="text-yellow-300">
                          +
                          {(
                            PROFESSION_RANKS[(profProgress[currentProf.id]?.rank ?? 1) - 1]?.zeni ?? 300
                          ).toLocaleString('pt-BR')}{' '}
                          Zeni
                        </span>{' '}
                        e{' '}
                        <span className="text-orange-300">
                          +
                          {professionXpReward(profProgress[currentProf.id]?.rank ?? 1, player.level)} XP
                        </span>
                        .
                      </p>
                      <GameButton variant="gold" className="mt-1" onClick={() => onAction({ type: 'claim_mission' })} disabled={busy}>
                        <Gift className="w-4 h-4" /> Receber pagamento
                      </GameButton>
                    </>
                  )}
                </div>
              </div>
            </GameCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {PROFESSIONS.map((prof) => {
              const prog = profProgress[prof.id] ?? { rank: 1, completions: 0 };
              const rank = prog?.rank ?? 1;
              const completions = prog?.completions ?? 0;
              const tier = PROFESSION_RANKS[rank - 1];
              const maxRank = rank >= PROFESSION_MAX_RANK;
              const xpReward = professionXpReward(rank, player.level);
              const isActive = active?.missionId === prof.id || claimable?.missionId === prof.id;
              const blockedByActive = (!!active || !!claimable) && !isActive;
              const canWork = !blockedByActive;
              const promotePct = maxRank ? 100 : Math.min(100, (completions / tier.completionsToPromote) * 100);
              return (
                <GameCard
                  key={prof.id}
                  className={`p-5 relative overflow-hidden ${blockedByActive ? 'opacity-60' : ''} ${
                    isActive ? 'border-orange-500/60' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-3xl shrink-0 mt-1" aria-hidden>
                      {prof.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-heading text-amber-100 leading-tight">{prof.name}</h3>
                        <Chip className="bg-purple-950/50 text-purple-300 border-purple-800/50">
                          <Award className="w-3 h-3" /> {professionRankTitle(prof, rank)}
                        </Chip>
                      </div>
                      <p className="text-xs text-amber-200/50 mt-1 leading-relaxed">{prof.description}</p>
                    </div>
                    {tier.dragonBallChance > 0 && (
                      <Chip className="bg-yellow-950/60 text-yellow-300 border-yellow-700/50 shrink-0">
                        <span title="Chance de Esfera do Dragão por turno">🔮 {Math.round(tier.dragonBallChance * 100)}%</span>
                      </Chip>
                    )}
                  </div>

                  {/* Progresso da promoção */}
                  <div className="mb-3">
                    {maxRank ? (
                      <div className="flex items-center gap-2 text-sm text-yellow-300 bg-yellow-950/30 rounded-lg px-3 py-2 border border-yellow-800/40">
                        <Sparkles className="w-4 h-4" /> Rank máximo — salário pleno!
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[11px] text-amber-200/60 mb-1">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> Próxima promoção: {professionRankTitle(prof, rank + 1)}
                          </span>
                          <span className="tabular-nums">
                            {completions}/{tier.completionsToPromote} turnos
                          </span>
                        </div>
                        <div className="h-2 bg-black/50 rounded-full overflow-hidden border border-amber-900/40">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400 rounded-full transition-all duration-500"
                            style={{ width: `${promotePct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-emerald-300/70 mt-1">
                          Bônus de promoção: +{PROFESSION_RANKS[rank].promotionBonus.toLocaleString('pt-BR')} Zeni
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Chip className="bg-slate-950/50 text-slate-300 border-slate-700/50">
                      <Timer className="w-3 h-3" /> 1 hora
                    </Chip>
                    <Chip className="bg-yellow-950/40 text-yellow-300 border-yellow-800/50">
                      <Coins className="w-3 h-3" /> {tier.zeni.toLocaleString('pt-BR')}
                    </Chip>
                    <Chip className="bg-orange-950/40 text-orange-300 border-orange-800/50">⭐ {xpReward.toLocaleString('pt-BR')} XP</Chip>
                  </div>

                  {isActive ? (
                    <div className="flex items-center gap-2 text-orange-300 text-sm bg-orange-950/40 rounded-lg px-3 py-2 border border-orange-800/50">
                      <Hourglass className="w-4 h-4 animate-pulse" /> Turno em andamento
                    </div>
                  ) : blockedByActive ? (
                    <div
                      className="flex items-center gap-2 text-amber-200/50 text-sm bg-black/30 rounded-lg px-3 py-2"
                      title="Você já está em um turno de trabalho"
                    >
                      <Hourglass className="w-4 h-4" /> Você já está em um turno
                    </div>
                  ) : (
                    <GameButton
                      onClick={() => onAction({ type: 'mission', professionId: prof.id })}
                      disabled={!canWork || busy}
                      className="w-full"
                    >
                      Trabalhar (1h)
                    </GameButton>
                  )}
                </GameCard>
              );
            })}
          </div>
        </>
      ) : (
        <QuestsTab player={player} onAction={onAction} busy={busy} />
      )}
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
      <GameCard className="p-4">
        <p className="text-sm text-amber-200/70 leading-relaxed">
          <span className="text-amber-100">Missões diárias</span> resetam todos os dias à meia-noite (horário de
          Brasília) e as <span className="text-amber-100">semanais</span> toda segunda-feira. Recompensas incluem{' '}
          <span className="text-sky-300">💎 cristais</span> para a loja de cosméticos!
        </p>
      </GameCard>

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
