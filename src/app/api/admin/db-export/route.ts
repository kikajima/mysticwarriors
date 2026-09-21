import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { makeBackupTarGz } from '@/lib/game/persistence';
import { clientIp, rateLimit } from '@/lib/rate-limit';

// =====================================================================
// GET /api/admin/db-export — exportação autenticada do banco completo
// ---------------------------------------------------------------------
// Ferramenta opcional de operação/backup. O segredo existe SOMENTE em
// GM_ADMIN_EXPORT_SECRET no ambiente do servidor.
//
// A rota é deliberadamente não-descobrível: segredo ausente/incorreto e
// excesso de tentativas respondem 404. A comparação é constant-time.
// =====================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function secretMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

function notFound() {
  return new NextResponse(null, {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function GET(request: Request) {
  const rl = rateLimit(`admin-db-export:${clientIp(request)}`, 5, 15 * 60_000);
  if (!rl.allowed) return notFound();

  const provided = request.headers.get('x-gm-admin-export') ?? '';
  const adminSecret = process.env.GM_ADMIN_EXPORT_SECRET ?? '';
  if (!secretMatches(provided, adminSecret)) return notFound();

  try {
    const { body, manifest } = await makeBackupTarGz('export');
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'content-type': 'application/gzip',
        'content-disposition': 'attachment; filename="guerreiros-misticos-backup.tar.gz"',
        'x-gm-accounts': String(manifest.accounts),
        'x-gm-players': String(manifest.humanPlayers),
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[db-export] falha:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: 'export_failed' },
      { status: 500, headers: { 'cache-control': 'no-store' } }
    );
  }
}
