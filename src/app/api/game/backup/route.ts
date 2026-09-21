import { NextResponse } from 'next/server';
import { makeBackupTarGz } from '@/lib/game/persistence';
import { requirePanelAdmin } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';

// =====================================================================
// GET /api/game/backup — backup administrativo do banco completo
// ---------------------------------------------------------------------
// PostgreSQL: export lógico tar.gz (game.json + manifest.json).
// SQLite legado/teste: custom.db + manifest + avatares.
// Exige a mesma autorização Supabase do painel administrativo.
// =====================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const guard = await requirePanelAdmin(request);
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status }
    );
  }

  const rl = rateLimit(`admin-backup:${clientIp(request)}`, 3, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'Muitas exportações seguidas. Aguarde alguns minutos.' } },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    const { body } = await makeBackupTarGz('user-backup');
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'content-type': 'application/gzip',
        'content-disposition': `attachment; filename="guerreiros-backup-${stamp}.tar.gz"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[backup] falha:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Falha ao gerar backup.' } },
      { status: 500 }
    );
  }
}
