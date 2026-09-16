'use client';

// =====================================================================
// RELÓGIO DO SERVIDOR NO CLIENTE (v0.9.6 — Mudança 1)
// ---------------------------------------------------------------------
// PROBLEMA: o fim de uma profissão é decidido pelo TIMESTAMP gravado no
// servidor (missionEndsAt, UTC), mas o contador da tela usava o relógio
// DO NAVEGADOR. Um relógio local ~2s atrasado fazia um turno de 1:00:00
// "durar" 1:00:02 — a contagem só chegava a zero quando o RELÓGIO ERRADO
// dizia que chegou.
//
// SOLUÇÃO: toda resposta do jogo carrega `serverNow` (hora do servidor no
// momento da resposta). O cliente mede a diferença entre os relógios
// (offset) compensando a latência da requisição, e TODOS os contadores
// passam a contar pela hora AJJUSTADA ao servidor:
//
//   agoraAjustado = Date.now() + offset
//   restante      = fimTimestamp − agoraAjustado
//
// O contador apenas REFRESCA o display (ex.: a cada 250ms) — nunca
// "conta ticks", então aba em segundo plano não acumula atraso: ao voltar,
// o restante é recalculado do timestamp real.
//
// Arredondamento: SEMPRE o mesmo (ceil) em todos os contadores — nunca
// pula nem acumula segundos.
// =====================================================================

import { useEffect, useState } from 'react';

/** Diferença medida entre servidor e navegador (ms). 0 = sem medição. */
let clockOffsetMs = 0;
/** Última medição (epoch local) — para depuração no console. */
let lastSyncAt = 0;

/**
 * Registra a hora do servidor recebida em uma resposta de API.
 *
 * @param serverIso      valor de `serverNow` da resposta (ISO 8601).
 * @param requestStartMs hora local (Date.now()) ANTES do fetch — usada
 *                       junto com a hora DEPOIS da resposta para estimar
 *                       o ponto médio do trânsito e descontar a latência.
 */
export function noteServerTime(serverIso: unknown, requestStartMs?: number): void {
  if (typeof serverIso !== 'string' || serverIso.length < 10) return;
  const t = Date.parse(serverIso);
  if (!Number.isFinite(t)) return;
  const requestEndMs = Date.now();
  // Ponto médio do trânsito: metade da latência é ida, metade volta.
  // O servidor gerou `serverIso` em algum instante entre os dois.
  const localMid = requestStartMs !== undefined ? (requestStartMs + requestEndMs) / 2 : requestEndMs;
  const offset = t - localMid;
  // Sanidade: relógios mais de 1h divergentes são ruído (cookie antigo,
  // resposta cacheada...) — ignora em vez de estragar a contagem.
  if (Math.abs(offset) > 3_600_000) return;
  clockOffsetMs = offset;
  lastSyncAt = requestEndMs;
}

/** Hora "do servidor" estimada AGORA (epoch ms, já com o offset). */
export function serverNowMs(): number {
  return Date.now() + clockOffsetMs;
}

/** Offset medido (ms) — útil para depuração/exibição. */
export function getClockOffsetMs(): number {
  return clockOffsetMs;
}

/** Época local da última sincronização (0 = nunca sincronizou). */
export function getLastClockSyncAt(): number {
  return lastSyncAt;
}

/**
 * Hook: re-renderiza o componente com a hora ajustada ao servidor a cada
 * `intervalMs` (padrão 250ms — refresco de display, barato). A aba em
 * segundo plano recebe throttling do navegador, mas isso não importa:
 * ao voltar, o valor é recalculado do timestamp real (nunca acumula).
 */
export function useServerNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => serverNowMs());
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNowMs()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
