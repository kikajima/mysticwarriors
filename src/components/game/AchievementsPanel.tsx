'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerView, AchievementView } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { AchievementsSkeleton, fetchPanelJson, LoadFail } from './PanelLoad';
import { Award, Coins, Loader2, Gift, Lock, Check } from 'lucide-react';

const CATEGORY_LABEL: Record<string, string> = {
  battle: '⚔️ Batalha',
  training: '💪 Treino',
  level: '⭐ Nível',
  pvp: '🎯 PvP',
  technique: '🧙 Técnicas',
  guild: '🛡️ Guilda',
  collection: '🎒 Coleção',
  progression: '⚡ Progressão',
  narrative: '📖 Narrativa',
  tournament: '🏟️ Torneio',
};

/**
 * Dados mínimos que a UI precisa para creditar uma coleta de forma
 * OTIMISTA (v0.9.20): o painel não espera o servidor para dar feedback.
 */
export interface ClaimableAchievement {
  achievementId: string;
  name: string;
  rewardZeni: number;
  rewardXp: number;
  rewardCrystals: number;
}

export function AchievementsPanel({
  player,
  onClaim,
}: {
  player: PlayerView;
  /** Coleta otimista: credita + notifica no MESMO tick do clique e
   *  reconcilia com o servidor em seguida. Resolve `true` em sucesso. */
  onClaim: (a: ClaimableAchievement) => Promise<boolean>;
}) {
  // v0.16 — matriz de ocupação: COLETA de conquista NUNCA é bloqueada por
  // ocupação (nem trabalho, nem treino, nem batalha pendente — regra da
  // 3ª ordem; teste anti-drift em tests/occupation-matrix.test.ts).
  const [achievements, setAchievements] = useState<AchievementView[] | null>(null);
  // v0.9.24 (B1): falha de carregamento → estado amigável + retry (8s)
  const [failed, setFailed] = useState(false);

  // v0.9.20 — COLETA OTIMISTA: ids marcados como coletados NO INSTANTE do
  // clique (antes da confirmação do servidor). Se o servidor recusar, o
  // painel desfaz a marcação e recarrega a verdade.
  const [claimedLocal, setClaimedLocal] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetchPanelJson(`/api/game/achievements?playerId=${player.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setAchievements(data.achievements ?? []);
    } catch {
      // v0.9.24 (B1): o LoadFail só aparece enquanto NÃO há lista na
      // tela (refresh pós-ação com dados antigos segue silencioso — o
      // if (!achievements) abaixo é quem decide o que renderizar)
      setFailed(true);
    }
  }, [player.id]);

  useEffect(() => {
    // fetch on mount: setState só ocorre após o await (assíncrono)
     
    load();
  }, [load]);

  // NOTA: marcações otimistas confirmadas pelo servidor (a.claimed) não
  // precisam ser removidas do conjunto — todo ponto da UI que consulta
  // claimedLocal já considera a.claimed primeiro (botão some, chip aparece,
  // contador exclui). O conjunto é minúsculo e morre com o painel.

  /**
   * COLETA (v0.9.20 — padrão optimistic UI):
   *  1. NO MESMO TICK DO CLIQUE: botão vira "✓ Coletado", chip aparece,
   *     o contador diminui e o pai credita o saldo + dispara o toast;
   *  2. a requisição ao servidor sai em paralelo (sem busy global — várias
   *     conquistas podem ser coletadas em sequência rápida);
   *  3. sucesso → reload silencioso da lista (não bloqueia nada);
   *     falha → desfaz a marcação otimista e recarrega a verdade.
   */
  const handleClaim = useCallback(
    (a: AchievementView) => {
      // guarda anti-duplo: cada conquista entra UMA vez por clique
      if (claimedLocal.has(a.achievementId)) return;
      setClaimedLocal((prev) => new Set(prev).add(a.achievementId));
      void onClaim(a).then((ok) => {
        if (ok) {
          load(); // sincroniza em background — nada trava a UI
        } else {
          // servidor recusou → restaura o botão e recarrega a verdade
          setClaimedLocal((prev) => {
            const next = new Set(prev);
            next.delete(a.achievementId);
            return next;
          });
          load();
        }
      });
    },
    [claimedLocal, onClaim, load]
  );

  const grouped = useMemo(() => {
    if (!achievements) return [];
    const map = new Map<string, AchievementView[]>();
    for (const a of achievements) {
      const list = map.get(a.category) ?? [];
      list.push(a);
      map.set(a.category, list);
    }
    return Array.from(map.entries());
  }, [achievements]);

  const totalUnlocked = achievements?.filter((a) => a.unlocked).length ?? 0;
  const totalClaimable =
    achievements?.filter((a) => a.unlocked && !a.claimed && !claimedLocal.has(a.achievementId)).length ?? 0;

  if (!achievements) {
    return (
      <div className="space-y-6">
        <SectionTitle icon="🏆">Conquistas</SectionTitle>
        {failed ? <LoadFail what="As conquistas" onRetry={() => void load()} /> : <AchievementsSkeleton />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon="🏆">Conquistas</SectionTitle>
        <div className="flex gap-2">
          <Chip className="bg-amber-950/50 text-amber-300 border-amber-800/50">
            {totalUnlocked}/{achievements.length} desbloqueadas
          </Chip>
          {totalClaimable > 0 && (
            <Chip className="bg-emerald-950/60 text-emerald-300 border-emerald-700/60 animate-pulse">
              <Gift className="w-3 h-3" /> {totalClaimable} para coletar
            </Chip>
          )}
        </div>
      </div>

      <GameCard className="p-4">
        <p className="text-sm text-amber-200/70 leading-relaxed">
          Conquistas registram sua jornada permanente: batalhas, treinos, níveis, técnicas, guildas e
          coleções. Recompensas incluem Zeni, XP e <span className="text-sky-300">💎 cristais</span> — colete
          uma única vez, para sempre.
        </p>
      </GameCard>

      {grouped.map(([category, list]) => (
        <div key={category}>
          <h3
            className={`font-heading text-amber-100 mb-3 flex items-center gap-2 ${
              category === 'narrative'
                ? 'text-transparent bg-clip-text bg-gradient-to-r from-sky-200 to-cyan-400'
                : category === 'tournament'
                  ? 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-amber-500'
                  : ''
            }`}
          >
            <Award className="w-4 h-4" /> {CATEGORY_LABEL[category] ?? category}
            {category === 'narrative' && (
              <span className="text-[9px] font-normal text-cyan-300/70 border border-cyan-800/50 rounded-full px-2 py-0.5">
                ASCENSÃO Z
              </span>
            )}
            {category === 'tournament' && (
              <span className="text-[9px] font-normal text-yellow-300/70 border border-yellow-700/50 rounded-full px-2 py-0.5">
                GRANDE TORNEIO
              </span>
            )}
          </h3>
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${category === 'narrative' ? 'gap-3' : ''}`}>
            {list.map((a) => {
              const pct = Math.min(100, (a.progress / a.target) * 100);
              const narrative = category === 'narrative';
              const tournament = category === 'tournament';
              // coletada = servidor confirmou OU coleta otimista em curso
              const claimed = a.claimed || claimedLocal.has(a.achievementId);
              return (
                <GameCard
                  key={a.achievementId}
                  className={`p-4 transition-all duration-300 ${
                    narrative
                      ? 'border-cyan-900/50 bg-gradient-to-br from-slate-950/60 to-cyan-950/20 '
                      : tournament
                        ? 'border-yellow-800/50 bg-gradient-to-br from-yellow-950/40 to-amber-950/20 '
                        : ''
                  }${
                    claimed
                      ? 'opacity-60 ring-0'
                      : a.unlocked
                      ? 'ring-1 ring-emerald-500/50'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`text-3xl shrink-0 ${!a.unlocked ? 'grayscale opacity-50' : ''}`} aria-hidden>
                      {a.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <h4 className="font-heading text-amber-100 text-sm">{a.name}</h4>
                        {claimed && (
                          <Chip className="bg-emerald-900/60 text-emerald-300 border-emerald-700/60">✓ coletada</Chip>
                        )}
                        {!a.unlocked && <Lock className="w-3.5 h-3.5 text-amber-200/30" />}
                      </div>
                      <p className="text-[11px] text-amber-200/50 leading-snug">{a.description}</p>

                      {/* progresso */}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-2 bg-black/50 rounded-full overflow-hidden border border-amber-900/40">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              a.unlocked
                                ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                                : 'bg-gradient-to-r from-orange-500 to-amber-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-heading text-[11px] text-amber-200 tabular-nums whitespace-nowrap">
                          {a.progress} / {a.target}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {a.rewardZeni > 0 && (
                          <Chip className="bg-yellow-950/40 text-yellow-300 border-yellow-800/50">
                            <Coins className="w-3 h-3" /> {a.rewardZeni.toLocaleString('pt-BR')}
                          </Chip>
                        )}
                        {a.rewardXp > 0 && (
                          <Chip className="bg-orange-950/40 text-orange-300 border-orange-800/50">⭐ {a.rewardXp}</Chip>
                        )}
                        {a.rewardCrystals > 0 && (
                          <Chip className="bg-sky-950/50 text-sky-300 border-sky-800/50">💎 {a.rewardCrystals}</Chip>
                        )}
                      </div>
                    </div>
                    {a.unlocked && !a.claimed && (
                      <GameButton
                        size="sm"
                        variant={claimedLocal.has(a.achievementId) ? 'ghost' : 'gold'}
                        disabled={claimedLocal.has(a.achievementId)}
                        title="Coletar recompensa (disponível mesmo durante trabalho/treino/luta)"
                        aria-label={`Coletar recompensa de ${a.name}`}
                        onClick={() => handleClaim(a)}
                      >
                        {claimedLocal.has(a.achievementId) ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" /> Coletado
                          </>
                        ) : (
                          <>
                            <Gift className="w-3.5 h-3.5" /> Coletar
                          </>
                        )}
                      </GameButton>
                    )}
                  </div>
                </GameCard>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
