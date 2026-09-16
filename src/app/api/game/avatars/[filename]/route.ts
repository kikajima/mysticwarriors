import { readAvatarFile } from '@/lib/avatars';

// =====================================================================
// GET /api/game/avatars/[filename] — serve retratos do armazenamento
// PERSISTENTE (irmão do banco), fora do pacote de build.
//  * nome validado por regex + anti path-traversal (resolução confinada);
//  * Cache-Control imutável: o nome do arquivo carrega timestamp único;
//  * sobrevive a reinício do serviço e a novas publicações.
// =====================================================================

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const file = await readAvatarFile(filename);
  if (!file) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
