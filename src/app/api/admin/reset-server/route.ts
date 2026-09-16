import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import {
  extractBearerToken,
  verifySupabaseAdmin,
  adminResetCloud,
  explainCloudResetError,
  cloudResetRpcStatus,
  explainCloudResetProbe,
} from '@/lib/supabase/admin';
import { performServerReset } from '@/lib/game/serverReset';

// =====================================================================
// POST /api/admin/reset-server — RESET GERAL do banco do jogo (v0.9.10)
// ---------------------------------------------------------------------
// v0.9.10.1 — o botão limpa SERVIDOR E NUVEM num clique só:
//   1. performServerReset: backup VACUUM INTO → wipe completo do banco
//      do jogo (SQLite) → re-seed de bots → temporada nova;
//   2. adminResetCloud: RPC admin_reset_cloud no SUPABASE (security
//      definer + is_admin) — backup da nuvem em *_backup_reset → apaga
//      TODAS as linhas de `personagens` → limpa progresso dos profiles.
//
// v0.9.10.2 — PRÉ-CHEQUE OBRIGATÓRIO: antes de apagar QUALQUER coisa,
// a rota confirma que a RPC admin_reset_cloud está instalada (probe
// com confirmação inválida). Sem ela, o reset sai PELA METADE
// (servidor limpo, nuvem suja — o ranking da nuvem continuaria
// mostrando personagens antigos, como na regressão relatada). A rota
// se RECUSA a resetar (412) com a instrução exata — nada é apagado.
//
// Se o passo 2 falhar depois do wipe do servidor (ex.: Supabase caiu
// no meio), o resultado é reportado como RESET PARCIAL com instrução
// explícita — JAMAIS silencioso. A defesa extra do
// /api/game/cloud-restore (guarda serverResetAt) bloqueia a
// ressurreição de snapshots pré-reset mesmo nessa janela.
//
// FLUXO DE AUTORIZAÇÃO (idêntico ao /api/admin/action): o token Supabase
// vem no cabeçalho Authorization; o servidor pergunta ao SUPABASE (RPC
// is_admin, security definer) se é a conta administradora. Não sendo, a
// rota responde 404 — como se não existisse.
// =====================================================================

function notFound(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } },
    { status: 404 }
  );
}

const resetSchema = z.object({
  confirm: z.literal('RESET', { message: 'Digite RESET para confirmar.' }),
});

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request);
    const isAdmin = await verifySupabaseAdmin(token);
    if (!isAdmin || !token) return notFound();

    // reset geral é raríssimo: limite apertado (3 por 5 min por origem)
    const rl = rateLimit(`admin-reset:${clientIp(request)}`, 3, 5 * 60_000);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas tentativas de reset. Aguarde alguns minutos.');

    const body = await request.json();
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Confirmação inválida.');
    }

    // ===== 0) PRÉ-CHEQUE (v0.9.10.2): a RPC da nuvem precisa estar =====
    // instalada ANTES de apagar qualquer coisa. Sem ela o reset sai pela
    // metade — servidor limpo, nuvem suja, ranking mostrando fantasmas.
    const rpc = await cloudResetRpcStatus(token);
    if (rpc !== 'ready') {
      throw new ApiError('PRECONDITION_FAILED', explainCloudResetProbe(rpc));
    }

    // ===== 1) SERVIDOR: backup + wipe + bots + temporada (SQLite) =====
    const report = await performServerReset(parsed.data.confirm);

    // ===== 2) NUVEM: RPC admin_reset_cloud (Supabase) =====
    // Roda DEPOIS do servidor: se falhar, o servidor já está limpo e a
    // guarda do cloud-restore cobre a janela — o fracasso é reportado
    // alto e claro, nunca engolido.
    const cloud = await adminResetCloud(token, parsed.data.confirm);

    if (!cloud.ok) {
      return ok({
        message:
          `⚠️ RESET PARCIAL: o SERVIDOR foi apagado (backup em ${report.backupPath}, ` +
          `${(report.backupBytes / 1024 / 1024).toFixed(2)} MB; ${report.botsReseeded} bots re-semeados), ` +
          `mas a NUVEM (Supabase) NÃO foi limpa — ${explainCloudResetError(cloud.error)} ` +
          `Os personagens antigos não voltam enquanto a guarda pós-reset estiver ativa, mas rode a RPC ` +
          `para limpar de vez (inclusive o ranking público da nuvem).`,
        report,
        cloud: { ok: false, error: cloud.error },
        cloudOk: false,
      });
    }

    return ok({
      message:
        `Reset geral concluído (servidor + nuvem). Backup do servidor: ${report.backupPath} ` +
        `(${(report.backupBytes / 1024 / 1024).toFixed(2)} MB). Bots re-semeados: ${report.botsReseeded}. ` +
        `Nuvem: ${cloud.report.personagens_apagados} personagem(ns) apagado(s), ` +
        `${cloud.report.perfis_limpos} perfil(is) limpo(s) — backup da nuvem em ` +
        `personagens_backup_reset (${cloud.report.backup_personagens} linhas) e ` +
        `profiles_backup_reset (${cloud.report.backup_perfis} linhas).`,
      report,
      cloud: { ok: true, report: cloud.report },
      cloudOk: true,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** GET não existe de propósito (rota não-descobrível). */
export async function GET() {
  return notFound();
}
