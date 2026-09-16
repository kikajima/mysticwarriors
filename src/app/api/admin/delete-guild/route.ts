import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { requirePanelAdmin } from '@/lib/supabase/admin';
import { deleteGuildAdmin } from '@/lib/game/adminErasure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =====================================================================
// POST /api/admin/delete-guild — EXCLUSÃO DESTRUTIVA de UMA guilda (v0.14)
// ---------------------------------------------------------------------
// ERASURE TOTAL (regra v0.12): linha + cargos + convites + solicitações
// + histórico de doações — nome liberado. Membros ex-guilda ficam SEM
// guilda, íntegros, sem erro. Guilda NÃO é espelhada na nuvem
// (snapshots de personagem não carregam guildId — camada cloud
// "not-mirrored").
//
// PROTEÇÕES server-side: nome digitado ≠ nome da guilda.
// v0.15 — a proteção "guilda do sistema" foi REMOVIDA (OBSOLETA):
// guilda de sistema não existe mais (decisão do dono) — TODA guilda é
// de jogador e TODA é excluível.
//
// PÓS-EXCLUSÃO: matriz anti-órfã automática. AUDITORIA em AdminActionLog.
//
// STATUS: sem/invalid token → 404; autenticado não admin → 403.
// =====================================================================

const deleteSchema = z.object({
  guildId: z.string().min(5).max(64),
  confirmName: z.string().min(1, 'Digite o nome da guilda para confirmar.').max(40),
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

    const rl = rateLimit(`admin-delete-guild:${clientIp(request)}`, 10, 5 * 60_000);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas exclusões seguidas. Aguarde alguns minutos.');

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dados inválidos.');
    }

    const report = await deleteGuildAdmin({
      guildId: parsed.data.guildId,
      confirmName: parsed.data.confirmName,
      adminEmail: guard.email,
    });

    return ok({
      status: report.status,
      message: report.message,
      layers: report.layers,
      orphanCheck: report.orphanCheck,
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
