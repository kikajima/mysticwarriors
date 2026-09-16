import { NextResponse } from 'next/server';
import { beaconSecretOk, makeBackupTarGz } from '@/lib/game/persistence';

// =====================================================================
// GET /api/admin/db-export — exportação autenticada do banco completo
// ---------------------------------------------------------------------
// Usada pelo BUILD (database-runtime-build.sh) para puxar o banco AO VIVO
// da produção antes de empacotar (camada 5 da persistência): fecha a
// janela de dados entre o último beacon e a publicação.
//
// Autenticação: header x-gm-beacon com qualquer segredo válido
// (db/beacon-secrets.txt no destino — o build copia o arquivo para
// dentro do pacote) OU GM_ADMIN_EXPORT_SECRET no ambiente.
// =====================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const provided = request.headers.get('x-gm-beacon') ?? '';
  const adminSecret = process.env.GM_ADMIN_EXPORT_SECRET ?? '';
  const ok =
    (adminSecret !== '' && provided === adminSecret) || (await beaconSecretOk(provided));
  if (!ok) {
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
