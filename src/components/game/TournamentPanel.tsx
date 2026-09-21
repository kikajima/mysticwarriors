'use client';

import { useMemo } from 'react';
import {
  BATTLE_ENERGY_COST,
  TOURNAMENT_ROUNDS,
  TOURNAMENT_ENTRY_FEE,
  fighterForRound,
  roundDef,
  tournamentZeniReward,
  tournamentXpReward,
  fightersForRound,
  type TournamentFighter,
} from '@/lib/game/constants';
import { useServerNow } from '@/lib/game/clock';
import { getPowerScale } from '@/lib/game/powerScale';
import type { PlayerView } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import {
  Trophy,
  Swords,
  Lock,
  Check,
  Crown,
  Timer,
  Loader2,
  Heart,
  Zap,
  ArrowUp,
  ArrowDown,
  Hourglass,
  Sparkles,
  Coins,
} from 'lucide-react';

// =====================================================================
// TORNEIO DE ARTES MARCIAIS (v0.9.18) — a chave de 8 do Grande Torneio
// ---------------------------------------------------------------------
// Caminho do guerreiro (quartas → semi → final → cinturão), card da luta
// atual com o adversário elástico, premiação por rodada e cooldown do
// comitê. A fonte da verdade é SEMPRE o servidor (Player.tournament +
// runningActivity); aqui apenas se REFLETE o estado.
// =====================================================================

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Chips de estilo do lutador (viés de distribuição do poder). */
function BiasChips({ fighter }: { fighter: TournamentFighter }) {
  const entries: Array<{ label: string; value: number }> = [
    { label: 'Força', value: fighter.bias.atk },
    { label: 'Ki', value: fighter.bias.ki },
    { label: 'Velocidade', value: fighter.bias.spd },
    { label: 'Defesa', value: fighter.bias.def },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((e) => {
        const up = e.value >= 1.05;
        const down = e.value <= 0.95;
        return (
          <span
            key={e.label}
            title={`Tendência de ${e.label}: ${e.value > 1 ? '+' : ''}${Math.round((e.value - 1) * 100)}%`}
          >
            <Chip
              className={
                up
                  ? 'bg-red-950/60 text-red-300 border-red-800/60'
                  : down
                    ? 'bg-slate-900/60 text-slate-400 border-slate-700/60'
                    : 'bg-amber-900/40 text-amber-200 border-amber-700/50'
              }
            >
              {up ? <ArrowUp className="w-3 h-3" /> : down ? <ArrowDown className="w-3 h-3" /> : null}
              {e.label}
            </Chip>
          </span>
        );
      })}
    </div>
  );
}

export function TournamentPanel({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: { type: string }) => void;
  busy: boolean;
}) {
  const t = player.tournament;
  const now = useServerNow(1000);
  const inRun = t.round > 0;
  const round = Math.max(1, t.round);
  const running = player.runningActivity;
  const runningMs = running ? new Date(running.endsAt).getTime() - now : 0;
  const runningExpired = !!running && runningMs <= 0;

  // cooldown do comitê (só existe fora de campanha)
  const cooldownMs = !inRun && t.cooldownEndsAt
    ? Math.max(0, new Date(t.cooldownEndsAt).getTime() - now)
    : 0;

  // adversário da luta atual (em campanha) OU prévia da próxima abertura
  const fighter = useMemo(
    () => fighterForRound(inRun ? round : 1, inRun ? t.runCount : t.runCount + 1),
    [inRun, round, t.runCount]
  );

  // poder estimado do adversário (espelha o cálculo do servidor — o
  // scouter do card mostra a MESMA ordem de grandeza que a engine usa)
  const oppPower = Math.round(player.derived.power * roundDef(inRun ? round : 1).powerMult);
  const oppScale = getPowerScale(oppPower);

  const tooHurt = player.hp < Math.max(20, Math.floor(player.derived.maxHp * 0.2));
  const noEnergy = player.energy < BATTLE_ENERGY_COST;
  const onMission = !!player.activeMission;
  // v0.9.24 (C1) — taxa de inscrição do comitê: só na ABERTURA da
  // campanha (lutas 2 e 3 de uma campanha em andamento não pagam nada)
  const needsFee = !inRun;
  const noFee = needsFee && player.zeni < TOURNAMENT_ENTRY_FEE;

  // fila de bloqueios — o PRIMEIRO verdadeiro vira o motivo do botão
  const block = running
    ? {
        why: runningExpired
          ? 'Confirmando resultado da luta…'
          : `Luta em andamento (${formatCountdown(Math.max(0, runningMs))})`,
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
      }
    : onMission
      ? { why: 'Torneio liberado só após o fim do turno de trabalho', icon: <Hourglass className="w-4 h-4" /> }
      : cooldownMs > 0
        ? { why: `Comitê reorganiza a chave — ${formatCountdown(cooldownMs)}`, icon: <Timer className="w-4 h-4" /> }
        : tooHurt
          ? { why: 'Ferido demais — cure-se antes de subir no ringue', icon: <Heart className="w-4 h-4" /> }
          : noEnergy
            ? { why: `Energia insuficiente (${BATTLE_ENERGY_COST} por luta)`, icon: <Zap className="w-4 h-4" /> }
            : noFee
              ? { why: `Inscrição custa ${TOURNAMENT_ENTRY_FEE.toLocaleString('pt-BR')} Zeni — você tem ${player.zeni.toLocaleString('pt-BR')}`, icon: <Coins className="w-4 h-4" /> }
              : null;

  const canFight = !busy && !block;

  const rewards = TOURNAMENT_ROUNDS.map((r) => ({
    ...r,
    zeni: tournamentZeniReward(r.round, player.level),
    xp: tournamentXpReward(r.round, player.level),
  }));

  return (
    <div className="space-y-6">
      <SectionTitle icon="🏟️">Torneio de Artes Marciais</SectionTitle>

      {/* ===== CARD DA ARENA (apresentação + palmarés) ===== */}
      <GameCard className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-600/10 pointer-events-none" />
        <div className="relative p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-700 flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-amber-900/40">
              🏟️
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-amber-100 text-lg leading-tight">Arena do Grande Torneio</h3>

            </div>
          </div>

          {/* Palmarés */}
          {(t.titles > 0 || t.roundWins > 0 || t.bestRound > 0) && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-black/30 border border-yellow-800/50 px-3 py-2 text-center">
                <div className="font-heading text-yellow-300 text-lg leading-none">{t.titles}</div>
                <div className="text-[10px] text-amber-200/50 mt-1">
                  {t.titles === 1 ? 'Cinturão' : 'Cinturões'}
                </div>
              </div>
              <div className="rounded-lg bg-black/30 border border-amber-800/50 px-3 py-2 text-center">
                <div className="font-heading text-amber-300 text-lg leading-none">{t.roundWins}</div>
                <div className="text-[10px] text-amber-200/50 mt-1">Lutas vencidas</div>
              </div>
              <div className="rounded-lg bg-black/30 border border-orange-800/50 px-3 py-2 text-center">
                <div className="font-heading text-orange-300 text-lg leading-none">
                  {t.bestRound === 0 ? '—' : t.bestRound === 3 ? '🏆' : `${t.bestRound}/3`}
                </div>
                <div className="text-[10px] text-amber-200/50 mt-1">Melhor campanha</div>
              </div>
            </div>
          )}

          {/* Faixa do campeão (títulos > 0) — brilho metálico varrendo */}
          {t.titles > 0 && (
            <div className="mt-3 relative overflow-hidden rounded-lg border border-yellow-600/60 bg-gradient-to-r from-yellow-600/25 via-amber-500/15 to-yellow-600/25 px-4 py-2 flex items-center justify-center gap-2">
              <div className="absolute inset-0 belt-shine pointer-events-none" aria-hidden />
              <Crown className="w-4 h-4 text-yellow-400" />
              <span className="font-heading text-yellow-200 text-sm tracking-wide">
                {t.titles === 1 ? 'CAMPEÃO DO GRANDE TORNEIO' : `${t.titles}× CAMPEÃO DO GRANDE TORNEIO`}
              </span>
              <Crown className="w-4 h-4 text-yellow-400" />
            </div>
          )}
        </div>
      </GameCard>

      {/* ===== CAMINHO DO GUERREIRO (a chave, rodada a rodada) ===== */}
      <GameCard className="p-4 sm:p-5">
        <h3 className="font-heading text-amber-100 mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          Caminho do Guerreiro
          {inRun && (
            <Chip className="ml-auto bg-orange-950/70 text-orange-300 border-orange-700/60">
              Campanha #{t.runCount} · {t.wins}/3 vitórias
            </Chip>
          )}
        </h3>

        <ol className="relative space-y-3" aria-label="Rodadas do torneio">
          {/* trilho vertical conectando as rodadas */}
          <span
            className="absolute left-[22px] top-6 bottom-8 w-0.5 bg-gradient-to-b from-amber-600/40 via-amber-800/30 to-yellow-600/30 pointer-events-none"
            aria-hidden
          />
          {TOURNAMENT_ROUNDS.map((r) => {
            const beaten = inRun && r.round < round;
            const isCurrent = inRun && r.round === round;
            const locked = !isCurrent && !beaten;
            const rFighter = fighterForRound(r.round, t.runCount);
            return (
              <li key={r.round} className="relative flex items-center gap-3">
                {/* nó da rodada */}
                <span
                  className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center shrink-0 border-2 font-heading text-sm transition-all ${
                    beaten
                      ? 'bg-emerald-900/80 border-emerald-600/70 text-emerald-300'
                      : isCurrent
                        ? 'bg-gradient-to-br from-yellow-500 to-amber-700 border-yellow-400 text-amber-950 round-current'
                        : 'bg-black/40 border-amber-900/50 text-amber-200/30'
                  }`}
                  aria-hidden
                >
                  {beaten ? <Check className="w-5 h-5" /> : isCurrent ? <Swords className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                </span>

                {/* corpo da rodada */}
                <div
                  className={`flex-1 min-w-0 rounded-lg border px-3 py-2 transition-all ${
                    isCurrent
                      ? 'border-yellow-500/50 bg-gradient-to-r from-yellow-950/60 to-amber-950/40'
                      : beaten
                        ? 'border-emerald-800/40 bg-emerald-950/20'
                        : 'border-amber-900/30 bg-black/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-heading text-xs uppercase tracking-wider ${
                        isCurrent ? 'text-yellow-300' : beaten ? 'text-emerald-300/80' : 'text-amber-200/40'
                      }`}
                    >
                      {r.name}
                    </span>
                    <span className={`text-sm font-medium ${beaten ? 'text-amber-200/50 line-through' : 'text-amber-100'}`}>
                      {rFighter.emoji} {rFighter.name}
                    </span>
                    {isCurrent && (
                      <span className="ml-auto text-[10px] font-heading text-yellow-400/90 animate-pulse" aria-hidden>
                        ● AGORA
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-amber-200/40 mt-0.5">
                    {locked ? 'Aguardando sua campanha chegar aqui' : rFighter.epithet}
                  </div>
                </div>
              </li>
            );
          })}

          {/* nó do CINTURÃO */}
          <li className="relative flex items-center gap-3">
            <span
              className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center shrink-0 border-2 ${
                t.titles > 0
                  ? 'bg-gradient-to-br from-yellow-400 to-amber-600 border-yellow-300 text-amber-950 round-current'
                  : 'bg-black/40 border-amber-900/50 text-amber-200/30'
              }`}
              aria-hidden
            >
              <Crown className="w-5 h-5" />
            </span>
            <div
              className={`flex-1 rounded-lg border px-3 py-2 ${
                t.titles > 0
                  ? 'border-yellow-500/50 bg-gradient-to-r from-yellow-950/60 to-amber-950/40'
                  : 'border-amber-900/30 bg-black/20 opacity-60'
              }`}
            >
              <div className="font-heading text-xs uppercase tracking-wider text-yellow-300/80">Cinturão do Campeão</div>
              <div className="text-[11px] text-amber-200/40 mt-0.5">
                Vença a Grande Final e junte-se aos imortais do ringue
              </div>
            </div>
          </li>
        </ol>
      </GameCard>

      {/* ===== LUTA ATUAL / PRÓXIMA INSCRIÇÃO ===== */}
      <GameCard className={`relative overflow-hidden border-yellow-700/40 ${inRun && !running ? 'arena-spotlight' : ''}`}>
        <div className="relative p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* retrato do lutador */}
            <div
              className={`w-20 h-20 rounded-xl bg-gradient-to-br ${fighter.color} flex items-center justify-center text-4xl shrink-0 shadow-lg shadow-black/40 border border-black/40 self-center sm:self-start`}
              role="img"
              aria-label={`Retrato de ${fighter.name}`}
            >
              {fighter.emoji}
            </div>

            <div className="flex-1 min-w-0 self-center sm:self-start">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip
                  className={
                    inRun
                      ? 'bg-orange-950/70 text-orange-300 border-orange-700/60'
                      : 'bg-slate-900/70 text-slate-300 border-slate-700/60'
                  }
                >
                  {inRun ? roundDef(round).name : 'Próxima inscrição'}
                </Chip>
                {inRun && (
                  <Chip className="bg-amber-900/40 text-amber-200 border-amber-700/50">
                    Aventura #{t.runCount}
                  </Chip>
                )}
              </div>
              <h3 className="font-heading text-amber-100 text-xl mt-2 leading-tight">
                {fighter.name}
              </h3>
              <p className="text-xs text-yellow-400/80 font-medium">{fighter.epithet}</p>
              <p className="text-xs text-amber-200/60 italic mt-2 leading-relaxed">{fighter.taunt}</p>

              <div className="flex items-center gap-2 mt-3 text-xs">
                <span className="text-amber-200/50">Poder de scouter:</span>
                <span className="font-heading text-amber-300">{oppPower.toLocaleString('pt-BR')}</span>
                <span className="text-amber-200/40">·</span>
                <span className="text-amber-200/70">
                  {oppScale.scale.emoji} {oppScale.scale.nome}
                </span>
              </div>

              <div className="mt-3">
                <BiasChips fighter={fighter} />
              </div>
            </div>
          </div>

          {/* barra de ação */}
          <div className="mt-4 pt-4 border-t border-amber-900/40 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 text-xs text-amber-200/60 leading-relaxed">
              {inRun ? (
                <>
                  Sua vida atual:{' '}
                  <span className={tooHurt ? 'text-red-400 font-heading' : 'text-emerald-400 font-heading'}>
                    {player.hp}/{player.derived.maxHp}
                  </span>{' '}
                  · Premiação:{' '}
                  <span className="text-amber-300 font-heading">
                    +{tournamentZeniReward(round, player.level).toLocaleString('pt-BR')} Zeni
                  </span>
                  {' · '}
                  <span className="text-amber-300 font-heading">
                    +{tournamentXpReward(round, player.level)} XP
                  </span>
                  {round === 3 && (
                    <>
                      {' · '}
                      <span className="text-yellow-300 font-heading">CINTURÃO</span>
                    </>
                  )}
                </>
              ) : cooldownMs > 0 ? (
                <span className="text-amber-200/80">
                  <Timer className="w-3.5 h-3.5 inline -mt-0.5" /> O comitê reorganiza a chave — liberado em{' '}
                  <span className="font-heading text-amber-300">{formatCountdown(cooldownMs)}</span>.
                </span>
              ) : (
                <>
                  Inscrição aberta! Taxa do comitê:{' '}
                  <span className="text-amber-300 font-heading">{TOURNAMENT_ENTRY_FEE.toLocaleString('pt-BR')} Zeni</span>{' '}
                  (cobrada na estreia). A chave fecha com você nas{' '}
                  <span className="text-amber-300 font-heading">Quartas de Final</span> contra {fighter.emoji}{' '}
                  {fighter.name}.
                </>
              )}
            </div>

            <div className="shrink-0">
              {canFight ? (
                <GameButton
                  variant="gold"
                  size="lg"
                  onClick={() => onAction({ type: 'tournament_fight' })}
                  className="w-full sm:w-auto"
                >
                  <Swords className="w-5 h-5" />
                  {inRun ? `Lutar ${roundDef(round).short}` : 'Inscrever no Torneio'}
                </GameButton>
              ) : (
                <GameButton variant="ghost" size="lg" disabled className="w-full sm:w-auto">
                  {block?.icon}
                  <span className="max-w-[240px] truncate">{block?.why}</span>
                </GameButton>
              )}
            </div>
          </div>
        </div>
      </GameCard>

      {/* ===== PREMIAÇÃO ===== */}
      <GameCard className="p-4 sm:p-5">
        <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" /> Premiação por Rodada
        </h3>
        <div className="space-y-2">
          {rewards.map((r) => {
            const champion = r.round === 3;
            return (
              <div
                key={r.round}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  champion
                    ? 'border-yellow-600/50 bg-gradient-to-r from-yellow-950/50 to-amber-950/30'
                    : 'border-amber-900/30 bg-black/20'
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-heading shrink-0 ${
                    champion ? 'bg-yellow-500/20 text-yellow-300' : 'bg-amber-900/30 text-amber-300'
                  }`}
                >
                  {r.round}
                </span>
                <span className={`font-medium flex-1 min-w-0 ${champion ? 'text-yellow-200' : 'text-amber-100/90'}`}>
                  {r.name}
                </span>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <span className="text-amber-300 font-heading">{r.zeni.toLocaleString('pt-BR')} Zeni</span>
                  <span className="text-amber-200/40">·</span>
                  <span className="text-amber-300 font-heading">{r.xp} XP</span>
                  {champion && (
                    <Chip className="bg-yellow-950/70 text-yellow-300 border-yellow-700/60">👑 Cinturão</Chip>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </GameCard>

      {/* ===== ELenco (sabores da chave) ===== */}
      <GameCard className="p-4 sm:p-5">
        <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-amber-400" /> Elenco do Torneio
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[fightersForRound(1), fightersForRound(2), fightersForRound(3)].map((cast, i) => (
            <div key={i} className="rounded-lg bg-black/20 border border-amber-900/30 p-2.5">
              <div className="text-[10px] font-heading uppercase tracking-wider text-amber-200/40 mb-1.5">
                {['Quartas', 'Semifinal', 'Grande Final'][i]}
              </div>
              <div className="space-y-1">
                {cast.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs text-amber-200/70">
                    <span className="text-base leading-none" aria-hidden>{f.emoji}</span>
                    <span className="truncate">{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

      </GameCard>
    </div>
  );
}
