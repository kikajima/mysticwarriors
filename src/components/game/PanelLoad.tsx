'use client';

// =====================================================================
// v0.9.24 (B1) — INFRAESTRUTURA DE CARREGAMENTO DOS PAINÉIS
// ---------------------------------------------------------------------
// Playtest: 5 telas (ranking, guildas, conquistas, missões, chefe)
// passavam 3-6s num "Carregando..." seco, sem timeout nem retry.
// Aqui vive o padrão único para TODAS elas:
//   1. fetch com TIMEOUT (~8s, AbortController) — nenhuma tela fica
//      presa para sempre numa requisição morta;
//   2. SKELETON visual temático no lugar do texto seco — a estrutura
//      da tela aparece imediatamente (percepção de velocidade);
//   3. falha total → estado vazio AMIGÁVEL + botão "Tentar novamente".
// A causa da lentidão original era o cold start do deploy (FASE 0);
// isto é a camada de resiliência — o diagnóstico está no relatório.
// =====================================================================

import { Skeleton } from '@/components/ui/skeleton';
import { GameButton } from './Bits';
import { CloudOff, RotateCw } from 'lucide-react';

/** Timeout padrão de carregamento de painéis (8s). */
export const PANEL_FETCH_TIMEOUT_MS = 8_000;

/**
 * fetch com timeout — devolve a Response ou lança (AbortError) quando o
 * servidor não responde em `timeoutMs`. Painéis que já têm dados
 * continuam mostrando o dado antigo (refresh silencioso); o timeout só
 * decide quando o "Carregando..." vira estado de erro.
 */
export async function fetchPanelJson(
  url: string,
  timeoutMs = PANEL_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// =====================================================================
// ESTADO DE FALHA — vazio amigável + retry
// =====================================================================

export function LoadFail({
  onRetry,
  what,
}: {
  onRetry: () => void;
  what: string;
}) {
  return (
    <div
      className="rounded-xl border border-red-900/40 bg-black/25 p-8 text-center"
      role="alert"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center">
          <CloudOff className="w-7 h-7 text-red-400" aria-hidden />
        </div>
        <div>
          <h3 className="font-heading text-amber-100 text-lg">{what} não carregou</h3>
          <p className="text-sm text-amber-200/60 mt-1 leading-relaxed max-w-sm mx-auto">
            A conexão com o servidor demorou demais. Seus dados estão salvos —
            tente de novo em instantes.
          </p>
        </div>
        <GameButton size="sm" onClick={onRetry} className="mt-1">
          <RotateCw className="w-3.5 h-3.5" /> Tentar novamente
        </GameButton>
      </div>
    </div>
  );
}

// =====================================================================
// SKELETONS — um por painel, na ESTRUTURA real da tela (a moldura
// aparece antes dos dados; nada de "Carregando..." seco)
// =====================================================================

function SkeletonShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-900/40 bg-black/25 p-4 sm:p-5 space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando conteúdo…</span>
      {children}
    </div>
  );
}

/** Ranking: linhas com posição + nome + poder. */
export function RankingSkeleton() {
  return (
    <SkeletonShell>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-5 w-28 rounded-full" />
      </div>
      <div className="space-y-2 pt-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-amber-900/25 bg-black/20 px-3 py-2.5"
          >
            <Skeleton className="w-7 h-7 rounded-md shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-16 rounded-md shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}

/** Guildas: card grande + linhas de guilda. */
export function GuildsSkeleton() {
  return (
    <SkeletonShell>
      <div className="flex items-center gap-3">
        <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-2.5 w-full rounded-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-amber-900/25 bg-black/20 px-3 py-3 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}

/** Conquistas: grade de cards com ícone + título + barra. */
export function AchievementsSkeleton() {
  return (
    <SkeletonShell>
      <Skeleton className="h-6 w-52" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-amber-900/25 bg-black/20 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3.5 w-full max-w-[140px]" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}

/** Missões diárias: cards com ícone + barra de progresso. */
export function QuestsSkeleton() {
  return (
    <SkeletonShell>
      <Skeleton className="h-6 w-40" />
      <div className="space-y-3 pt-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-amber-900/25 bg-black/20 p-4 flex items-start gap-3">
            <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="h-2.5 w-full rounded-full" />
              <div className="flex gap-1.5">
                <Skeleton className="h-4 w-14 rounded-full" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}

/** Ameaça universal: card do chefe com HP global. */
export function BossSkeleton() {
  return (
    <SkeletonShell>
      <div className="flex items-center gap-2">
        <Skeleton className="w-5 h-5 rounded-full" />
        <Skeleton className="h-6 w-48 max-w-full" />
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <Skeleton className="w-20 h-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex-1 w-full space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <Skeleton className="h-5 w-full rounded-full" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}
