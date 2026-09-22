'use client';

import { useEffect, useRef, useState } from 'react';
import type { BattleResult, PlayerView } from '@/lib/game/types';
import { dominantCosmeticSet, equippedCosmetic } from '@/lib/game/content/cosmetics';
import { IMPETO } from '@/lib/game/impeto';
import { BATTLE_REVEAL_INTERVAL_MS } from '@/lib/game/rules';
import { serverNowMs } from '@/lib/game/clock';
import { GameButton } from './Bits';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** v0.9.24 (A1) — margem de segurança após endsAt antes de revelar à força. */


/**
 * Log de batalha animado — POPUP OBRIGATÓRIO.
 *
 * IMPORTANTE (v0.4): além do bloqueio visual (clique fora, ESC, X), a
 * batalha agora tem DURAÇÃO SERVER-SIDE (Activity.endsAt): o botão
 * "Continuar" só aparece quando TODOS os rounds foram revelados E o
 * término definido pelo servidor chegou. Recarregar a página NÃO pula
 * a atividade — ela é retomada pelo restante do tempo.
 *
 * Todas as barras usam EXATAMENTE os valores calculados pelo servidor
 * (playerStartHp/EndHp/MaxHp, enemyStartHp/EndHp/MaxHp) — o componente
 * NUNCA recalcula HP máximo com fórmula própria.
 */
export function BattleLogDialog({
  battle,
  player,
  lockUntil,
  onClose,
}: {
  battle: BattleResult | null;
  player?: Pick<PlayerView, 'cosmetics'>;
  /** ISO timestamp: término server-side da atividade (enquanto houver, NÃO fecha) */
  lockUntil?: string;
  onClose: () => void;
}) {
  // estado de revelação vive no wrapper — quem controla o Dialog sabe
  // se a batalha já terminou (finished) e só então permite fechar
  const [revealed, setRevealed] = useState(0);
  // ajuste durante o render (padrão React): nova batalha → zera a revelação
  const [prevBattle, setPrevBattle] = useState(battle);
  if (battle !== prevBattle) {
    setPrevBattle(battle);
    setRevealed(0);
  }

  // countdown do término server-side — valor DERIVADO de um tick de relógio
  // (setState apenas no callback do interval — sem efeito em cascata)
  // v0.9.24 (A1): tick pelo RELÓGIO DO SERVIDOR (serverNowMs) — endsAt é
  // um timestamp do servidor; relógio do navegador atrasado fazia o
  // cronômetro demorar (ou nunca chegar) a zero.
  const [nowTick, setNowTick] = useState(() => serverNowMs());
  useEffect(() => {
    if (!lockUntil) return;
    const timer = setInterval(() => setNowTick(serverNowMs()), 500);
    return () => clearInterval(timer);
  }, [lockUntil]);
  const lockRemaining = lockUntil ? Math.max(0, new Date(lockUntil).getTime() - nowTick) : 0;

  useEffect(() => {
    if (!battle) return;
    const total = battle.rounds.length;
    // v0.9.21 (correção 2): o intervalo vem da MESMA constante que a
    // duração server-side da atividade (ACTIVITY_DURATION.battlePerRoundMs)
    // — servidor e animação terminam JUNTOS. Antes o replay (480ms/entrada)
    // corria solto enquanto a atividade expirava em ~5s e o fundo
    // atualizava no meio da luta.
    const interval = setInterval(() => {
      setRevealed((r) => {
        if (r >= total) {
          clearInterval(interval);
          return r;
        }
        return r + 1;
      });
    }, BATTLE_REVEAL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [battle]);

  // a luta "terminou" quando todos os rounds foram revelados E a
  // duração server-side (se houver) esgotou; o resultado nunca antecipa a última rodada
  const finished = battle
    ? revealed >= battle.rounds.length && lockRemaining <= 0
    : false;
  const equipped = player?.cosmetics?.equipped ?? {};
  const victoryPose = equippedCosmetic(equipped, 'pose')?.victoryPresentation;
  const activeVictorySet = dominantCosmeticSet(equipped);
  const victorySet = activeVictorySet?.activeMilestone.victoryCss
    ? {
        icon: activeVictorySet.set.icon,
        setName: activeVictorySet.set.name,
        label: activeVictorySet.activeMilestone.name,
        css: activeVictorySet.activeMilestone.victoryCss,
      }
    : undefined;

  return (
    <Dialog
      open={battle !== null}
      onOpenChange={(open) => {
        // só aceita fechar (fora/ESC/X) se a batalha já terminou
        if (!open && finished) onClose();
      }}
    >
      {battle && (
        <BattleContent
          key={battle.rounds.length + battle.enemyName + battle.xpGain}
          battle={battle}
          finished={finished}
          revealed={revealed}
          lockRemaining={lockRemaining}
          victoryPose={victoryPose}
          victorySet={victorySet}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function BattleContent({
  battle,
  finished,
  revealed,
  lockRemaining,
  victoryPose,
  victorySet,
  onClose,
}: {
  battle: BattleResult;
  finished: boolean;
  revealed: number;
  lockRemaining: number;
  victoryPose?: { icon: string; label: string; css: string };
  victorySet?: { icon: string; setName: string; label: string; css: string };
  onClose: () => void;
}) {
  const visibleRounds = battle.rounds.slice(0, revealed);
  const lastRound = visibleRounds[visibleRounds.length - 1];

  // v0.9.21 — AUTO-SCROLL do log: cada rodada nova aparece ABAIXO da
  // dobra do contêiner (max-h-64); sem isto o jogador perde os rounds
  // finais — inclusive a rodada de ⚖️ DECISÃO — escondidas embaixo.
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revealed]);

  // HP/Ki atuais conforme o servidor (sem recalcular nada)
  const playerHp = finished ? battle.playerEndHp : lastRound?.playerHp ?? battle.playerStartHp;
  const playerKi = lastRound?.playerKi ?? null;
  const enemyHp = lastRound?.enemyHp ?? battle.enemyStartHp;
  const enemyKi = lastRound?.enemyKi ?? null;
  // v0.9.13 — Ímpeto atual de cada lado (instantâneo do round revelado)
  const playerImpeto = lastRound?.playerImpeto ?? IMPETO.start;
  const enemyImpeto = lastRound?.enemyImpeto ?? IMPETO.start;

  // null-check obrigatório (o contrato permite firstAction: null)
  const firstAttackerText =
    battle.firstAction === null
      ? null
      : battle.firstAction.isPlayer
        ? `⚡ ${'Você'} desferiu o primeiro golpe!`
        : `⚡ ${battle.enemyName} começou atacando!`;

  return (
    <DialogContent
      // v0.9.21 (correção 2): overlay PRÓPRIO do combate — mais escuro e
      // com blur: o fundo fica esmaecido e ilegível durante a luta (o
      // overlay padrão black/50 deixava painéis do torneio nítidos).
      overlayClassName="bg-black/85 backdrop-blur-md"
      className="bg-[#1a130c] border-amber-800/60 max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0"
      showCloseButton={finished}
      onPointerDownOutside={(e) => {
        if (!finished) e.preventDefault(); // bloqueia clique fora durante a luta
      }}
      onInteractOutside={(e) => {
        if (!finished) e.preventDefault();
      }}
      onEscapeKeyDown={(e) => {
        if (!finished) e.preventDefault(); // bloqueia ESC durante a luta
      }}
    >
      <DialogHeader className="p-4 pb-2 border-b border-amber-900/40">
        <DialogTitle className="font-heading text-amber-100 flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {battle.enemyEmoji}
          </span>
          Você vs {battle.enemyName}
        </DialogTitle>
        <DialogDescription className="text-amber-200/50 text-xs">
          Batalha turno a turno — Adversário nível {battle.opponentLevel}
        </DialogDescription>
      </DialogHeader>

      {/* Barras de vida, Ki e Ímpeto (valores do servidor) */}
      <div className="px-4 pt-3 space-y-2">
        {/* v0.9.21 (correção 1): a cor reflete o estado no resultado — a
            barra do jogador NÃO fica verde quando ele foi nocauteado */}
        <HpBar
          name="Você"
          hp={playerHp}
          max={battle.playerMaxHp}
          color={
            finished && !battle.won && playerHp <= 1
              ? 'from-red-600 to-rose-900'
              : 'from-emerald-500 to-green-600'
          }
        />
        {playerKi !== null && (
          <KiBar name="Seu Ki" ki={playerKi} max={Math.max(playerKi, 1)} color="from-sky-500 to-cyan-400" />
        )}
        <ImpetoBar name="Seu Ímpeto" value={playerImpeto} side="player" />
        <HpBar
          name={battle.enemyName}
          hp={Math.max(0, enemyHp)}
          max={battle.enemyMaxHp}
          color={finished && battle.won && enemyHp <= 0 ? 'from-stone-600 to-stone-800' : 'from-red-500 to-rose-700'}
        />
        {enemyKi !== null && (
          <KiBar name={`Ki de ${battle.enemyName}`} ki={enemyKi} max={Math.max(enemyKi, 1)} color="from-purple-500 to-fuchsia-400" />
        )}
        <ImpetoBar name={`Ímpeto de ${battle.enemyName}`} value={enemyImpeto} side="enemy" />
        {firstAttackerText && (
          <p className="text-[11px] text-amber-200/70 font-heading text-center">{firstAttackerText}</p>
        )}
      </div>

      {/* Log de rounds */}
      <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-3 max-h-64 space-y-1.5">
        {visibleRounds.map((round, i) => (
          <div
            key={i}
            className={`slide-in text-xs rounded-lg px-3 py-2 border ${
              round.decision === 'round-limit'
                ? 'bg-gradient-to-r from-yellow-950/90 to-amber-900/40 border-yellow-500/80 text-yellow-100 shadow-lg shadow-yellow-900/40'
                : round.impetoEvent === 'quebra-de-limite'
                ? 'bg-gradient-to-r from-yellow-950/80 to-orange-950/60 border-yellow-500/70 text-yellow-100 shadow-lg shadow-yellow-900/30'
                : round.impetoEvent === 'segundo-vento'
                ? 'bg-gradient-to-r from-sky-950/80 to-cyan-950/60 border-sky-400/70 text-sky-100 shadow-lg shadow-sky-900/30'
                : round.impetoEvent === 'reroll'
                ? 'bg-gradient-to-r from-emerald-950/70 to-teal-950/50 border-emerald-600/60 text-emerald-100'
                : round.impetoEvent === 'reposition'
                ? 'bg-gradient-to-r from-violet-950/70 to-fuchsia-950/50 border-violet-500/60 text-violet-100'
                : round.impetoEvent === 'exaustao'
                ? 'bg-gradient-to-r from-slate-900/70 to-teal-950/40 border-slate-500/50 text-slate-200'
                : round.impetoEvent === 'heroic-defense'
                ? 'bg-cyan-950/60 border-cyan-700/60 text-cyan-100'
                : round.action === 'dodge'
                ? 'bg-slate-900/50 border-slate-700/50 text-slate-300'
                : round.action === 'technique'
                ? round.attacker === 'player'
                  ? 'bg-gradient-to-r from-yellow-950/70 to-orange-950/50 border-yellow-600/60 text-yellow-200 shadow-md shadow-yellow-900/20'
                  : 'bg-gradient-to-r from-purple-950/70 to-fuchsia-950/50 border-purple-600/60 text-purple-200 shadow-md shadow-purple-900/20'
                : round.attacker === 'player'
                ? round.action === 'energy'
                  ? 'bg-rose-950/50 border-rose-800/50 text-rose-200'
                  : 'bg-orange-950/50 border-orange-800/50 text-orange-200'
                : round.action === 'energy'
                ? 'bg-purple-950/50 border-purple-800/50 text-purple-200'
                : 'bg-red-950/50 border-red-900/50 text-red-200'
            }`}
          >
            <span className="text-amber-200/40 font-heading mr-2">R{round.round}{' '}</span>
            {/* v0.9.24 (A3): TODO marcador termina com {' '} — espaço REAL
                entre marcador e nome (o mr-1 de 4px era lido como texto
                colado: "COMBOArruaceiro", "TÉCNICAPríncipe Aisurom"). */}
            {round.decision === 'round-limit' && (
              <span className="font-heading font-bold mr-1.5 text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-amber-400 animate-pulse">
                ⚖️ DECISÃO{' '}
              </span>
            )}
            {round.action === 'technique' && (
              <span className="font-heading font-bold mr-1.5 animate-pulse">
                {round.attacker === 'player' ? '🔥 TÉCNICA' : '💢 TÉCNICA INIMIGA'}{' '}
              </span>
            )}
            {round.action === 'energy' && '💥 '}
            {round.impetoEvent === 'combo' && (
              <span className="font-heading font-bold mr-1.5 text-orange-300">👊 COMBO{' '}</span>
            )}
            {round.impetoEvent === 'reroll' && (
              <span className="font-heading font-bold mr-1.5 text-emerald-300">🎯 DESTINO{' '}</span>
            )}
            {round.impetoEvent === 'reposition' && (
              <span className="font-heading font-bold mr-1.5 text-violet-300">🌀 REPOSICIONAMENTO{' '}</span>
            )}
            {round.impetoEvent === 'exaustao' && (
              <span className="font-heading font-bold mr-1.5 text-teal-300">💧 EXAUSTÃO{' '}</span>
            )}
            {round.impetoEvent === 'quebra-de-limite' && (
              <span className="font-heading font-bold mr-1.5 text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-500 animate-pulse">
                ⚡ QUEBRA DE LIMITE{' '}
              </span>
            )}
            {/* v0.9.17 — Segundo Vento (Cap. 29): o milagre completo */}
            {round.impetoEvent === 'segundo-vento' && (
              <span className="font-heading font-bold mr-1.5 text-transparent bg-clip-text bg-gradient-to-r from-sky-200 to-cyan-400 animate-pulse">
                🌬️ SEGUNDO VENTO{' '}
              </span>
            )}
            {round.text}
          </div>
        ))}
        {!finished && (
          <p className="text-center text-amber-200/30 text-xs animate-pulse font-heading">
            ⚡ a luta acontece...
            {lockRemaining > 0 ? ` (${Math.ceil(lockRemaining / 1000)}s)` : ''}
          </p>
        )}
      </div>

      {/* Resultado — só aparece (e só permite fechar) quando TERMINA */}
      {finished && (
        <div className="p-4 border-t border-amber-900/40 slide-in">
          {battle.won ? (
            <div className="text-center">
              <p className="font-display text-4xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-500 mb-1">
                VITÓRIA!
              </p>
              {victoryPose || victorySet ? (
                <div
                  className={`mx-auto mb-3 max-w-sm rounded-xl border p-3 font-heading victory-pose-enter ${
                    victoryPose?.css ?? 'border-amber-700/50 bg-amber-950/35 text-amber-200'
                  } ${victorySet?.css ?? ''}`}
                >
                  <span className="mr-2 text-2xl" aria-hidden>{victoryPose?.icon ?? victorySet?.icon}</span>
                  {victoryPose?.label ?? victorySet?.label}
                  {victorySet ? (
                    <p className="mt-1 text-[10px] font-normal opacity-75">
                      {victorySet.icon} {victorySet.setName} · {victorySet.label}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p className="text-sm text-amber-200/80 mb-3">
                +{battle.zeniGain.toLocaleString('pt-BR')} Créditos • +{battle.xpGain.toLocaleString('pt-BR')} XP
                {battle.crystalsGain ? ` • +${battle.crystalsGain} 💎` : ''}
                {battle.zeniStolen ? ` • roubou ${battle.zeniStolen.toLocaleString('pt-BR')} Créditos` : ''}
                {battle.dragonBallStolen
                  ? ` • roubou ${battle.dragonBallStolenStar ? `a Chave do Horizonte nº ${battle.dragonBallStolenStar}` : `${battle.dragonBallStolen} Chave do Horizonte`}`
                  : ''}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-display text-4xl text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-700 mb-1">
                DERROTA...
              </p>
              {/* v0.9.21 (correção 1): a mensagem acompanha o que a barra
                  mostra — nocaute (0 HP) → resgate com 1 de vida; decisão
                  dos jurados (limite de rodadas) → vida final mantida. */}
              <p className="text-sm text-amber-200/60 mb-3">
                {battle.playerEndHp <= 0 ? (
                  <>
                    Você foi resgatado com 1 de vida. Ainda ganhou{' '}
                    {battle.xpGain.toLocaleString('pt-BR')} XP de experiência.
                    {battle.zenkaiGranted ? ' Resiliência Estelar ativada: +1 Força!' : ''}
                  </>
                ) : (
                  <>
                    A luta foi às {battle.rounds[battle.rounds.length - 1]?.round ?? '—'} rodadas sem
                    nocaute — a decisão dos jurados foi contra você. Saiu do ringue com{' '}
                    <span className="text-amber-300 font-heading">{battle.playerEndHp} de vida</span> e
                    ainda ganhou {battle.xpGain.toLocaleString('pt-BR')} XP de experiência.
                    {battle.zenkaiGranted ? ' Resiliência Estelar ativada: +1 Força!' : ''}
                  </>
                )}
              </p>
            </div>
          )}
          <div className="flex justify-center">
            <GameButton onClick={onClose} aria-label="Fechar resultado da batalha">
              Continuar
            </GameButton>
          </div>
        </div>
      )}
    </DialogContent>
  );
}

function HpBar({ name, hp, max, color }: { name: string; hp: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] font-heading text-amber-200/70 mb-0.5">
        <span>{name}</span>
        <span>
          {Math.max(0, Math.round(hp))} / {max} HP
        </span>
      </div>
      <div className="h-3 bg-black/60 rounded-full overflow-hidden border border-amber-900/40">
        <div
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KiBar({ name, ki, max, color }: { name: string; ki: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (ki / max) * 100)) : 0;
  return (
    <div className="opacity-80">
      <div className="flex justify-between text-[10px] font-heading text-amber-200/50 mb-0.5">
        <span>{name}</span>
        <span>{Math.max(0, Math.round(ki))}</span>
      </div>
      <div className="h-1.5 bg-black/60 rounded-full overflow-hidden border border-amber-900/30">
        <div
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * v0.9.13 — Medidor de ÍMPETO (Cap. 7 do ASCENSÃO Z): chamas 0–6
 * alimentadas pelo instantâneo de cada round do servidor. A chama
 * "acesa" tem brilho dourado; a apagada é um traço escuro — a leitura
 * é instantânea mesmo sem ler números (acessibilidade: aria-label
 * descreve o estado em texto).
 */
function ImpetoBar({ name, value, side }: { name: string; value: number; side: 'player' | 'enemy' }) {
  const v = Math.max(0, Math.min(IMPETO.max, Math.floor(value)));
  return (
    <div
      className="flex items-center justify-between"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={IMPETO.max}
      aria-valuenow={v}
      aria-label={`${name}: ${v} de ${IMPETO.max}`}
    >
      <span className="text-[10px] font-heading text-amber-200/50 flex items-center gap-1">
        <span aria-hidden>🔥</span> {name}
      </span>
      <span className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: IMPETO.max }, (_, i) => {
          const lit = i < v;
          return (
            <span
              key={i}
              title={lit ? `Ímpeto ${i + 1}` : undefined}
              className={`inline-block w-[9px] h-[13px] rounded-[2px] transition-all duration-300 ${
                lit
                  ? side === 'player'
                    ? 'bg-gradient-to-b from-yellow-300 to-orange-500 shadow-[0_0_6px_rgba(251,146,60,0.55)]'
                    : 'bg-gradient-to-b from-rose-300 to-red-500 shadow-[0_0_6px_rgba(244,63,94,0.45)]'
                  : 'bg-stone-900/90 border border-amber-900/30'
              } ${lit ? 'animate-[impeto-flicker_1.1s_ease-in-out_infinite]' : ''}`}
              style={lit ? { animationDelay: `${(i % 3) * 0.18}s` } : undefined}
            />
          );
        })}
      </span>
    </div>
  );
}
