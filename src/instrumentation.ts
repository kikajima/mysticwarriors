// Hook de instrumentação do Next.js — roda UMA vez por processo servidor
// (dev e standalone), antes da primeira request. É a âncora da camada de
// persistência: reconciliação anti-wipe + migrações de schema no boot.
//
// Guardas:
//  * apenas runtime Node (nunca Edge);
//  * bootPersistence nunca lança (internamente envolve tudo em try/catch);
//  * no sandbox de desenvolvimento o beacon fica DESATIVADO (sem
//    GM_BEACON_TARGET) — o boot vira praticamente um no-op barato.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { bootPersistence } = await import('@/lib/game/persistence');
    await bootPersistence();
  } catch (err) {
    console.error('[instrumentation] falha ao inicializar persistência:', err);
  }
}
