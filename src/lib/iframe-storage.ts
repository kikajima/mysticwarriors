// =====================================================================
// Acesso a cookies dentro do painel de visualização (v0.9.12)
// ---------------------------------------------------------------------
// O jogo pode rodar EMBUTIDO no painel de preview do chat — um IFRAME
// de outro SITE (preview-chat-*.space-z.ai dentro da interface). Nesse
// contexto o navegador pode bloquear cookies de terceiros; a API
// Storage Access (document.requestStorageAccess) desbloqueia o
// armazenamento NÃO particionado (cookies de sessão) mediante um gesto
// do usuário (clique em "Entrar"/"Jogar como convidado").
//
// Tudo aqui é best-effort: falhas são silenciosas e o fluxo segue —
// a verificação real (cookie de sessão presente?) acontece depois do
// login, via /api/auth/session, e em último caso o diálogo explica
// como abrir o jogo em uma aba própria.
// =====================================================================

/** O documento atual roda dentro de um iframe? */
export function runningInsideIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    // acesso cross-origin a window.top lança → assumimos embutido
    return true;
  }
}

/**
 * Pede acesso a armazenamento não particionado (cookies) quando o
 * documento está em contexto de terceiros. SÓ funciona com gesto do
 * usuário (clique/tecla) — chame dentro dos handlers de submit.
 * Resolve true quando o acesso foi concedido (ou já existia).
 */
export async function requestStorageAccessSafely(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const doc = document as Document & { requestStorageAccess?: () => Promise<void> };
  if (typeof doc.requestStorageAccess !== 'function') return false;
  if (typeof window !== 'undefined' && !window.isSecureContext) return false;
  try {
    await doc.requestStorageAccess();
    return true;
  } catch {
    // negado/indisponível — o diagnóstico posterior assume o resto
    return false;
  }
}

/**
 * Confirma que o cookie de sessão do jogo realmente "pegou" no
 * navegador: pergunta ao servidor quem é a conta logada. Devolve
 * false quando não há cookie VÁLIDO (bloqueado, descartado ou
 * expirado) — usado logo após um login bem-sucedido para detectar
 * o bloqueio de cookies de terceiros.
 */
export async function sessionCookieWorks(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { account?: unknown };
    return !!data?.account;
  } catch {
    return false;
  }
}
