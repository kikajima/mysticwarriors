import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { makeBackupTarGz } from '@/lib/game/persistence';

// =====================================================================
// GET /api/game/backup — backup manual do usuário logado
// ---------------------------------------------------------------------
// Rede de segurança última (camada 6): baixa o estado completo do jogo
// (banco + avatares) como tar.gz. Exige sessão válida — nenhum segredo.
// O arquivo pode ser entregue ao suporte (upload no chat) para restaurar
// os dados em db/production-snapshot/ caso TODAS as outras camadas falhem.
//
// Nota de privacidade: o tar contém o banco inteiro (é um deployment
// single-tenant; hashes de senha são scrypt+salt). Comentário no topo de
// persistence.ts explica as camadas.
// =====================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAuth();
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
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
}
