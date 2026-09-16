import { NextResponse } from 'next/server';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { requirePanelAdmin } from '@/lib/supabase/admin';
import { listGuildsForAdmin } from '@/lib/game/adminErasure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =====================================================================
// GET /api/admin/guilds — lista de GUILDAS com inventário completo (v0.14)
// ---------------------------------------------------------------------
// Fonte: banco local (guildas NÃO são espelhadas na nuvem). Cada linha
// traz o inventário que a confirmação de exclusão exibe: membros (com
// nomes), líder, nível, doações históricas (total + nº de registros),
// convites/solicitações pendentes e membros online (janela 10 min).
//
// v0.15 — a flag isSystem SUMIU do schema (guilda de sistema extinta,
// decisão do dono): TODA guilda listada é de jogador e TODA é excluível
// pelo painel. O mundo começa com ZERO guildas.
//
// AUTORIZAÇÃO: mesma guarda das ações destrutivas (transporte is_admin
// + e-mail ADMIN_EMAIL). Sem/invalid token → 404; não admin → 403.
// =====================================================================

export async function GET(request: Request) {
  try {
    const guard = await requirePanelAdmin(request);
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: { code: guard.code, message: guard.message } },
        { status: guard.status }
      );
    }

    const rl = rateLimit(`admin-guilds:${clientIp(request)}`, LIMITS.supabase.limit, LIMITS.supabase.windowMs);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas consultas. Aguarde um instante.');

    const guilds = await listGuildsForAdmin();
    return ok({ guilds });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST não existe de propósito (mutações vivem em /api/admin/delete-guild). */
export async function POST() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } },
    { status: 404 }
  );
}
