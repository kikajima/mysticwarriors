import { NextResponse } from 'next/server';
import { makeBackupTarGz } from '@/lib/game/persistence';

// =====================================================================
// GET /api/admin/db-export — exportação autenticada do banco completo
// ---------------------------------------------------------------------
// Ferramenta opcional de operação/backup. A autenticação usa somente o
// segredo explícito GM_ADMIN_EXPORT_SECRET; não existe mais segredo de
// beacon nem sincronização com sandbox.
// =====================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const provided = request.headers.get('x-gm-admin-export') ?? '';
  const adminSecret = process.env.GM_ADMIN_EXPORT_SECRET ?? '';
  if (!adminSecret || provided !== adminSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const { body, manifest } = await makeBackupTarGz('export');
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'content-type': 'application/gzip',
        'content-disposition': 'attachment; filename="guerreiros-misticos-backup.tar.gz"',
        'x-gm-accounts': String(manifest.accounts),
        'x-gm-players': String(manifest.humanPlayers),
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[db-export] falha:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'export_failed' }, { status: 500 });
  }
}
