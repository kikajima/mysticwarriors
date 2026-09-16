'use client';

import { useState } from 'react';
import { GameButton } from './Bits';
import { Cookie, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { requestStorageAccessSafely, sessionCookieWorks } from '@/lib/iframe-storage';

/**
 * v0.9.12 — Diálogo "cookies bloqueados pelo painel".
 *
 * Cenário real (diagnóstico do dev.log): o dono entrou pelo painel de
 * visualização do chat (iframe cross-site). O login respondia 200, mas
 * o navegador descartava o cookie de sessão → a criação de personagem
 * voltava 401 e o jogo travava na porta. Este diálogo transforma aquele
 * 401 mudo em uma orientação clara: abrir em aba própria (cookies de
 * primeira parte, sempre funcionam) ou tentar desbloquear o storage.
 */
export function CookieBlockedDialog({ onResolved }: { onResolved: () => void }) {
  const [testing, setTesting] = useState(false);

  const openInNewTab = () => {
    window.open(window.location.href, '_blank', 'noopener');
  };

  const retry = async () => {
    setTesting(true);
    try {
      // gesto do clique no botão: única janela em que o navegador aceita
      // o pedido de acesso a storage de terceiros
      const granted = await requestStorageAccessSafely();
      if (granted) {
        // com o acesso liberado, o boot da página reconecta a sessão
        // (cookie novo via /api/auth/guest ou ponte Supabase) — recarrega
        // em vez de tentar remendar o estado em memória
        window.location.reload();
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cookie-blocked-title"
    >
      <div className="w-full max-w-md bg-[#1e1710] border border-amber-700/60 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Cookie className="w-9 h-9 text-amber-400 shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1.5">
              <h2 id="cookie-blocked-title" className="font-heading text-lg text-amber-100">
                O painel está bloqueando os cookies do jogo
              </h2>
              <p className="text-sm text-amber-200/70 leading-relaxed">
                Você entrou pelo painel de visualização, e o navegador descartou a sessão do
                jogo dentro dele. Seu login <span className="text-amber-100">não foi perdido</span> —
                basta abrir o jogo em uma aba própria.
              </p>
            </div>
          </div>

          <div className="bg-black/40 border border-amber-900/50 rounded-lg p-3 text-xs text-amber-200/60 leading-relaxed">
            <span className="text-amber-200/90 font-heading">Por que isso acontece?</span> O jogo
            roda embutido no painel (um iframe de outro site). Navegadores modernos bloqueiam
            cookies de terceiros nesse contexto para proteger sua privacidade.
          </div>

          <div className="flex flex-col gap-2">
            <GameButton onClick={openInNewTab} className="w-full">
              <span className="inline-flex items-center justify-center gap-2 w-full">
                <ExternalLink className="w-4 h-4" aria-hidden />
                Abrir o jogo em nova aba
              </span>
            </GameButton>
            <button
              type="button"
              onClick={retry}
              disabled={testing}
              className="w-full text-sm text-amber-200/60 hover:text-amber-100 disabled:opacity-50 transition-colors font-heading inline-flex items-center justify-center gap-1.5 py-2"
            >
              {testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  Testando permissão…
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                  Já permiti — testar de novo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
