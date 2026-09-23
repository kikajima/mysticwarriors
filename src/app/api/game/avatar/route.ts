import { db } from '@/lib/db';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { LIMITS, rateLimit } from '@/lib/rate-limit';
import { trackEvent } from '@/lib/analytics';
import {
  MAX_AVATAR_BYTES,
  fetchExternalImage,
  saveAvatarFile,
  validateImageBytes,
} from '@/lib/avatars';
import { SUPABASE_URL } from '@/lib/supabase/config';
import { isPostgresDatabase } from '@/lib/game/persistence';

// =====================================================================
// POST /api/game/avatar — troca REAL do avatar do personagem
// ---------------------------------------------------------------------
// Três modos, um único destino: o avatarUrl persistido no personagem.
//
//  * JSON { playerId, type: 'url', url }
//      → o servidor BAIXA a imagem (https, anti-SSRF, timeout 8s,
//        teto 5MB, Content-Type), valida a decodificação real (sharp)
//        e valida o conteúdo. Em PostgreSQL preserva a URL HTTPS; no
//        SQLite legado pode espelhar localmente. Conteúdo inválido,
 //        timeout e bloqueio de provedor são detectados imediatamente.
//
//  * FormData { playerId, type: 'upload', file }
//      → JPG/PNG/WebP até 5MB, magic bytes + decodificação completa
//        (sharp re-encoda uma miniatura para provar integridade).
//
//  * JSON { playerId, type: 'storage', url }   (v0.9.4)
//      → imagem enviada pelo PRÓPRIO jogador direto ao Supabase
//        Storage (bucket público "avatars", pasta {userId}/). O
//        servidor valida: URL do NOSSO projeto + pasta da PRÓPRIA
//        conta vinculada — ninguém aponta o avatar para o arquivo
//        de outro usuário. A imagem vive na nuvem (sobrevive a
//        limpezas do servidor) e a URL entra no snapshot da conta.
//
// Segurança:
//  * posse validada por requirePlayer (403 para personagem de outro);
//  * nome do arquivo 100% controlado pelo servidor (modos url/upload);
//  * falha NUNCA apaga o avatar anterior (só grava depois de validar);
//  * o "Avatar atualizado" só acontece com o resultado PERSISTIDO e
//    a URL acessível (a resposta devolve o avatarUrl definitivo).
// =====================================================================

const MAX_URL_LENGTH = 500;

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();

    const rl = rateLimit(`avatar:${auth.session.id}`, LIMITS.avatar.limit, LIMITS.avatar.windowMs);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', 'Muitas alterações de avatar. Aguarde um minuto.');
    }

    const contentType = request.headers.get('content-type') ?? '';
    let playerId: string | undefined;
    let newAvatarUrl: string;
    let mode: 'url' | 'upload' | 'storage';

    if (contentType.includes('multipart/form-data')) {
      // ===== MODO UPLOAD =====
      mode = 'upload';
      const form = await request.formData();
      playerId = String(form.get('playerId') ?? '');
      if (!playerId) throw new ApiError('VALIDATION_ERROR', 'playerId é obrigatório.');
      const file = form.get('file');
      if (!(file instanceof File)) {
        throw new ApiError('AVATAR_INVALID_TYPE', 'Envie um arquivo de imagem.');
      }
      if (file.size > MAX_AVATAR_BYTES) {
        throw new ApiError('AVATAR_TOO_LARGE');
      }

      const player = await requirePlayer(auth, playerId);

      // valida o CONTEÚDO real: magic bytes + decodificação completa
      const bytes = Buffer.from(await file.arrayBuffer());
      const kind = await validateImageBytes(bytes);

      // só grava DEPOIS de validar — o avatar anterior permanece se falhar
      newAvatarUrl = await saveAvatarFile(player.id, kind, bytes);
      await db.player.update({ where: { id: player.id }, data: { avatarUrl: newAvatarUrl } });
      await trackEvent('avatar_updated', { playerId: player.id, accountId: auth.account.id, metadata: { mode } });
    } else {
      // ===== MODO URL / STORAGE (JSON) =====
      const body = (await request.json()) as { playerId?: string; type?: string; url?: string };
      mode = body.type === 'storage' ? 'storage' : 'url';
      playerId = body.playerId;
      if (!playerId) throw new ApiError('VALIDATION_ERROR', 'playerId é obrigatório.');

      const url = String(body.url ?? '').trim();
      if (!url || url.length > MAX_URL_LENGTH) {
        throw new ApiError('AVATAR_INVALID_URL', 'URL de imagem inválida ou muito longa.');
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new ApiError('AVATAR_INVALID_URL', 'URL de imagem inválida ou insegura.');
      }
      // APENAS http/https — bloqueia javascript:, data:, file:, vbscript: etc.
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new ApiError('AVATAR_INVALID_URL', 'URL de imagem inválida ou insegura.');
      }
      if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost')) {
        throw new ApiError('AVATAR_INVALID_URL', 'Endereços locais não são permitidos.');
      }

      const player = await requirePlayer(auth, playerId);

      if (mode === 'url' && isPostgresDatabase()) {
        // Produção não faz fetch server-side de URL arbitrária. Mesmo com
        // resolução DNS prévia, DNS rebinding poderia trocar um host público
        // por endereço interno entre a validação e a conexão. No ambiente
        // persistente, avatares customizados devem usar o Storage da própria
        // conta, eliminando completamente essa superfície de SSRF.
        throw new ApiError(
          'AVATAR_INVALID_URL',
          'Por segurança, use o upload de imagem para salvar seu avatar na nuvem.'
        );
      }

      if (mode === 'storage') {
        // ===== v0.9.4 — URL do Supabase Storage do PRÓPRIO usuário =====
        // A imagem já está na nuvem (enviada pelo navegador com a sessão
        // do jogador). Aqui só CONFIRMAMOS a posse: a URL precisa ser do
        // nosso projeto, do bucket avatars, e da pasta da conta vinculada.
        const expectedPrefix = `${SUPABASE_URL}/storage/v1/object/public/avatars/`;
        if (!url.startsWith(expectedPrefix)) {
          throw new ApiError('AVATAR_INVALID_URL', 'URL de avatar da nuvem inválida.');
        }
        const rest = url.slice(expectedPrefix.length);
        const folder = decodeURIComponent(rest.split('/')[0] ?? '');
        if (!auth.account.supabaseUserId || folder !== auth.account.supabaseUserId) {
          throw new ApiError('FORBIDDEN', 'Este avatar não pertence à sua conta.');
        }
        newAvatarUrl = url;
      } else {
        // baixa com proteção completa (https exigido no fetch, anti-SSRF,
        // redirects manuais, timeout, teto de bytes, content-type)
        const bytes = await fetchExternalImage(parsed.toString());
        const kind = await validateImageBytes(bytes);

        // PostgreSQL/Render Free não tem filesystem persistente. Depois de
        // validar integralmente a imagem, preservamos a URL HTTPS original.
        // Uploads de arquivo continuam preferindo Supabase Storage no cliente.
        newAvatarUrl = isPostgresDatabase() ? parsed.toString() : await saveAvatarFile(player.id, kind, bytes);
      }
      await db.player.update({ where: { id: player.id }, data: { avatarUrl: newAvatarUrl } });
      await trackEvent('avatar_updated', { playerId: player.id, accountId: auth.account.id, metadata: { mode } });
    }

    return ok({ avatarUrl: newAvatarUrl, mode });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/game/avatar — remove o avatar customizado (volta ao da raça). */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth();
    const rl = rateLimit(`avatar:${auth.session.id}`, LIMITS.avatar.limit, LIMITS.avatar.windowMs);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED');

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    if (!playerId) throw new ApiError('VALIDATION_ERROR', 'playerId é obrigatório.');

    const player = await requirePlayer(auth, playerId);
    await db.player.update({ where: { id: player.id }, data: { avatarUrl: null } });
    return ok({ avatarUrl: null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
