// Hook de instrumentação do Next.js — roda uma vez por processo servidor
// e aplica a inicialização de persistência antes da primeira request.
// Em produção o SQLite deve estar em Persistent Disk do Render.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { bootPersistence } = await import('@/lib/game/persistence');
    await bootPersistence();
  } catch (err) {
    console.error('[instrumentation] falha ao inicializar persistência:', err);
  }
}
