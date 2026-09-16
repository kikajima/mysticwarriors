'use client';

import { useEffect } from 'react';

/** Registra o service worker do PWA + dispara analytics da landing. */
export function PwaBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // registra o service worker
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // registro best-effort — não bloqueia o jogo
      });
    }

    // analytics de visita (apenas na landing, sem dados pessoais)
    const isLanding = window.location.pathname === '/';
    if (isLanding) {
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'visit_landing' }),
        keepalive: true,
      }).catch(() => undefined);
    }
    if (window.location.pathname === '/jogar') {
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'click_play' }),
        keepalive: true,
      }).catch(() => undefined);
    }
  }, []);

  return null;
}
