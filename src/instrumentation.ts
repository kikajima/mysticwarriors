// Hook de instrumentação do Next.js — roda uma vez por processo servidor.
// Em produção inicializa o PostgreSQL autoritativo do Supabase; em testes
// SQLite, mantém o boot legado/migrador hermético.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { bootPersistence } = await import('@/lib/game/persistence');
    await bootPersistence();
  } catch (err) {
    console.error('[instrumentation] falha ao inicializar persistência:', err);
  }
}
