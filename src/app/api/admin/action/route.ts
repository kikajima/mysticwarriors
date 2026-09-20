import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import {
  extractBearerToken,
  verifySupabaseAdmin,
  adminGetCloudCharacterState,
  adminUpsertCloudCharacter,
  adminUpdateCloudCharacterState,
} from '@/lib/supabase/admin';
import {
  applyAdminActionLocal,
  buildCloudCharacterRow,
  patchCloudCharacterState,
  patchCloudResetCharacterState,
  type AdminCharacterRow,
} from '@/lib/game/adminActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =====================================================================
// POST /api/admin/action — ações do painel sobre PERSONAGENS (v0.9.6)
// ---------------------------------------------------------------------
// FLUXO DE AUTORIZAÇÃO (inegociável, mantido da v0.9): o token Supabase
// do usuário vem no cabeçalho Authorization; o servidor pergunta ao
// SUPABASE (RPC is_admin, security definer) se é a conta administradora.
// Não sendo, a rota responde 404 — como se não existisse.
//
// v0.9.6 (Mudança 4): o ALVO é sempre um PERSONAGEM (characterId):
//  * BANCO LOCAL (Prisma): estado vivo — o jogador online vê na hora;
//  * NUVEM (tabela `personagens`): o efeito é espelhado NA LINHA DO
//    PERSONAGEM — sobrevive a limpezas do banco local. Para alvos que
//    só existem na nuvem, o patch é aplicado DIRETAMENTE no estado.
// =====================================================================

function notFound(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } },
    { status: 404 }
  );
}

const intField = z
  .number()
  .int()
  .refine((v) => Math.abs(v) <= 1_000_000_000, 'Valor fora do limite permitido.');

const actionSchema = z.object({
  characterId: z.string().min(5).max(64),
  ownerId: z.string().max(80).nullable().optional(),
  action: z.enum([
    'grant',
    'set_stats',
    'set_progress',
    'restore_energy',
    'restore_health',
    'accelerate_activity',
    'finish',
    'grant_dragon_ball',
    'grant_craft_material',
    'grant_crafted_item',
    'reset',
    'grant_item',
    'grant_cosmetic',
    'grant_transformation',
  ]),
  zeniDelta: intField.optional(),
  crystalDelta: intField.optional(),
  ballDelta: intField.optional(),
  xpGain: intField.optional(),
  strength: intField.optional(),
  defense: intField.optional(),
  speed: intField.optional(),
  ki: intField.optional(),
  level: intField.optional(),
  xp: intField.optional(),
  itemId: z.string().max(64).optional(),
  cosmeticId: z.string().max(64).optional(),
  transformationId: z.string().max(64).optional(),
  dragonBallStar: z.number().int().min(1).max(7).optional(),
  materialId: z.string().max(64).optional(),
  craftedItemId: z.string().max(64).optional(),
  quantity: z.number().int().min(1).max(999).optional(),
});

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request);
    const isAdmin = await verifySupabaseAdmin(token);
    if (!isAdmin || !token) return notFound();

    const rl = rateLimit(`admin-action:${clientIp(request)}`, 60, 5 * 60_000);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas ações seguidas. Aguarde um instante.');

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dados inválidos.');
    }
    const input = parsed.data;
    const isCloudKey = !!input.ownerId && !input.ownerId.startsWith('local:');

    // ===== aplica no banco LOCAL (alvo = o personagem) =====
    const local = await applyAdminActionLocal({
      characterId: input.characterId,
      ownerId: input.ownerId ?? null,
      action: input.action,
      zeniDelta: input.zeniDelta,
      crystalDelta: input.crystalDelta,
      ballDelta: input.ballDelta,
      xpGain: input.xpGain,
      strength: input.strength,
      defense: input.defense,
      speed: input.speed,
      ki: input.ki,
      level: input.level,
      xp: input.xp,
      itemId: input.itemId,
      cosmeticId: input.cosmeticId,
      transformationId: input.transformationId,
      dragonBallStar: input.dragonBallStar,
      materialId: input.materialId,
      craftedItemId: input.craftedItemId,
      quantity: input.quantity,
    });

    let cloudUpdated = false;
    let message = local.message;

    if (local.ok) {
      // ===== espelha na NUVEM: linha completa e fresca do personagem =====
      if (isCloudKey && token) {
        const row = await buildCloudCharacterRow(input.characterId);
        if (row) {
          cloudUpdated = await adminUpsertCloudCharacter(token, row);
        }
      }
    } else if (isCloudKey && token) {
      // ===== personagem só existe na NUVEM → patch direto no estado =====
      const current = await adminGetCloudCharacterState(token, input.characterId);
      if (current !== null) {
        if (input.action === 'grant_dragon_ball' || (input.action === 'grant' && input.ballDelta)) {
          message =
            'Esferas do Dragão são globais e não podem ser alteradas apenas pelo snapshot da nuvem. ' +
            'O personagem precisa existir no servidor atual para receber uma estrela específica.';
        } else {
          const patched =
            input.action === 'reset'
              ? patchCloudResetCharacterState(current)
              : patchCloudCharacterState(current, {
                  zeniDelta: input.zeniDelta,
                  crystalDelta: input.crystalDelta,
                  xpGain: input.xpGain,
                  strength: input.strength,
                  defense: input.defense,
                  speed: input.speed,
                  ki: input.ki,
                  level: input.level,
                  xp: input.xp,
                  restoreEnergy: input.action === 'restore_energy',
                  restoreHealth: input.action === 'restore_health',
                  accelerateActivity:
                    input.action === 'accelerate_activity' || input.action === 'finish',
                  itemId: input.itemId,
                  materialId: input.action === 'grant_craft_material' ? input.materialId : undefined,
                  materialQuantity: input.action === 'grant_craft_material' ? input.quantity : undefined,
                  craftedItemId: input.action === 'grant_crafted_item' ? input.craftedItemId : undefined,
                  craftedItemQuantity: input.action === 'grant_crafted_item' ? input.quantity : undefined,
                  cosmeticId: input.cosmeticId,
                  transformationId: input.transformationId,
                });
          if (patched) {
            cloudUpdated = await adminUpdateCloudCharacterState(token, input.characterId, patched);
            if (cloudUpdated) {
              message = `Aplicado direto no progresso salvo na nuvem — valerá quando o jogador entrar.`;
            }
          }
        }
      } else {
        message = 'Este personagem não tem progresso na nuvem nem estado local — nada a fazer.';
      }
    }

    const character: AdminCharacterRow | null = local.character;
    return ok({
      message,
      character,
      cloudUpdated,
      localApplied: local.ok,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
