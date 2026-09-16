import { NextResponse } from 'next/server';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { requirePanelAdmin } from '@/lib/supabase/admin';
import { listAuditLogs } from '@/lib/game/adminErasure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =====================================================================
// GET /api/admin/audit-log — LOG DE AÇÕES ADMINISTRATIVAS (v0.14)
// ---------------------------------------------------------------------
// As exclusões do painel (personagem/guilda) registram cada tentativa
// em AdminActionLog: timestamp, e-mail do admin, alvo (nome/tipo),
// camadas (local/nuvem), resultado (ok/partial/failed/blocked) e
// detalhes (inventário do que morreu, erros, gatilho). Esta rota
// alimenta a seção "Ações administrativas" do painel — o antídoto ao
// "apagaram e ninguém sabe quem".
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

    const rl = rateLimit(`admin-audit:${clientIp(request)}`, LIMITS.supabase.limit, LIMITS.supabase.windowMs);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas consultas. Aguarde um instante.');

    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? '50');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

    const logs = await listAuditLogs(limit);
    return ok({ logs });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST não existe de propósito (o log é append-only pelas exclusões). */
export async function POST() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } },
    { status: 404 }
  );
}
