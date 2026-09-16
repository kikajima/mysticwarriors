'use client';

import { BookOpen } from 'lucide-react';

// =====================================================================
// ÍCONE DA WIKI — ponto de entrada compartilhado (v0.9.22)
// ---------------------------------------------------------------------
// MESMO ícone visual no Login (AuthGate) e na Visão Geral (header do
// jogo) para consistência. Abre /wiki SEMPRE em nova aba com
// rel="noopener noreferrer" — o estado do jogo (energia, timers, luta
// em andamento) permanece intacto na aba original.
// =====================================================================

export function WikiIconLink({ variant = 'header' }: { variant?: 'header' | 'corner' }) {
  return (
    <a
      href="/wiki"
      target="_blank"
      rel="noopener noreferrer"
      title="Wiki — Manual do jogo"
      aria-label="Wiki — Manual do jogo (abre em nova aba)"
      className={`rounded-lg border border-amber-900/40 bg-black/40 text-amber-200/70 hover:text-amber-100 hover:border-amber-600/60 hover:bg-black/60 transition-all active:scale-95 flex items-center justify-center ${
        variant === 'header' ? 'p-2' : 'w-10 h-10 shadow-lg shadow-black/40'
      }`}
    >
      <BookOpen className="w-5 h-5" aria-hidden />
    </a>
  );
}
