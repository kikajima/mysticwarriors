import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { requirePanelAdmin } from '@/lib/supabase/admin';
import { deleteCharacterAdmin } from '@/lib/game/adminErasure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =====================================================================
// POST /api/admin/delete-character — EXCLUSÃO DESTRUTIVA de UM
// personagem, NAS DUAS CAMADAS (v0.14)
// ---------------------------------------------------------------------
// FLUXO (ver src/lib/game/adminErasure.ts):
//  1. AUTORIZAÇÃO (esta rota): Bearer token Supabase → RPC is_admin()
//     (TRANSPORTE, modelo v0.9) → e-mail da sessão === ADMIN_EMAIL
//     (AUTORIZAÇÃO v0.14 — src/lib/adminIdentity.ts, constante única);
//  2. PROTEÇÕES server-side: bot · próprio personagem do admin ·
//     nome digitado ≠ nome do alvo (v0.15 — a proteção "líder da
//     guilda do sistema" foi REMOVIDA: guilda de sistema não existe
//     mais);
//  3. NUVEM primeiro (RPC admin_delete_personagem — apaga SÓ o alvo,
//     com backup; pré-cheque da RPC antes de tocar em qualquer coisa);
//  4. LOCAL: cascade do schema (+ auto-dissolução se o alvo lidera
//     guilda comum — regra v0.12 de erasure total);
//  5. PÓS-EXCLUSÃO: matriz anti-órfã automática (a MESMA da suíte) —
//     órfão = operação REPORTADA como falha;
//  6. AUDITORIA: linha em AdminActionLog (ok/partial/failed/blocked).
//
// STATUS: sem/invalid token → 404 (rota invisível); autenticado não
// admin → 403 (existe, proibida).
// =====================================================================

const deleteSchema = z.object({
  characterId: z.string().min(5).max(64),
  ownerId: z.string().max(80).nullable().optional(),
  confirmName: z.string().min(1, 'Digite o nome do personagem para confirmar.').max(40),
});

export async function POST(request: Request) {
  try {
    const guard = await requirePanelAdmin(request);
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: { code: guard.code, message: guard.message } },
        { status: guard.status }
      );
    }

    // ação destrutiva manual: limite APERTADO (10 por 5 min por origem)
    const rl = rateLimit(`admin-delete-char:${clientIp(request)}`, 10, 5 * 60_000);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas exclusões seguidas. Aguarde alguns minutos.');

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dados inválidos.');
    }

    const report = await deleteCharacterAdmin({
      characterId: parsed.data.characterId,
      ownerId: parsed.data.ownerId ?? null,
      confirmName: parsed.data.confirmName,
      adminEmail: guard.email,
      adminSupabaseUserId: guard.supabaseUserId,
      accessToken: guard.token,
    });

    // blocked/failed/partial NÃO são exceções — são relatórios honestos
    // (a auditoria já registrou cada um deles). HTTP 200 com status
    // interno; falhas de validação/proteção seguem 400 via ApiError.
    return ok({
      status: report.status,
      message: report.message,
      layers: report.layers,
      orphanCheck: report.orphanCheck,
      guildDissolved: report.guildDissolved ?? null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** GET não existe de propósito (rota não-descobrível). */
export async function GET() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } },
    { status: 404 }
  );
}
