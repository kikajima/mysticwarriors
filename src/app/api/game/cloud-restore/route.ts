import { db } from '@/lib/db';
import { ApiError, toErrorResponse, ok } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { playerToView, computeDerived } from '@/lib/game/engine';
import { MAX_CHARACTERS_PER_ACCOUNT } from '@/lib/game/content/world';
import { getCraftRecipe } from '@/lib/game/content/crafting';
import { DAILY_QUESTS, WEEKLY_QUESTS } from '@/lib/game/content/quests';
import { dailyPeriod, weeklyPeriod } from '@/lib/progression';
import { filterStaleRows } from '@/lib/game/resetGuard';
import {
  sanitizeCloudCharacterState,
  cloudCharacterToPlayerData,
  type CloudCharacterSnapshot,
} from '@/lib/supabase/progress';
import { trackEvent } from '@/lib/analytics';
import { loadAuthoritativeCloudCharacters, verifySupabaseIdentity } from '@/lib/supabase/serverCloud';

// =====================================================================
// POST /api/game/cloud-restore — restaura personagens da nuvem
// ---------------------------------------------------------------------
// Etapa 12: o navegador NÃO envia mais estado de jogo para restauração.
// O servidor identifica a conta pela sessão local, valida o Bearer Supabase
// contra o supabaseUserId vinculado e lê public.personagens diretamente pela
// conexão PostgreSQL autoritativa. Assim, payloads fabricados pelo cliente
// nunca viram Player local.
//
// v0.9.10.1 — GUARDA ANTI-RESSURREIÇÃO PÓS-RESET: se o servidor foi
// resetado (GameMeta.serverResetAt), snapshots da nuvem ANTERIORES ao
// reset são DESCARTADOS (com log — nada some em silêncio). Sem isto, o
// espelho da nuvem devolvia personagens com todo o progresso antigo no
// primeiro login após um "Reset geral do servidor". O formato v2 legado
// (profiles.progresso, sem timestamp) é bloqueado inteiro pós-reset —
// por construção ele só pode ser pré-reset.
//
// Regras de segurança:
//  - exige conta VINCULADA ao Supabase (convidados não restauram);
//  - exige Bearer válido do MESMO usuário Supabase vinculado;
//  - ignora/rejeita qualquer estado enviado pelo navegador;
//  - só restaura quando a conta local está SEM personagens (o local vence);
//  - o estado lido server-side ainda passa pela sanitização completa;
//  - o id da linha vira o id do Player local (chave estável).
// =====================================================================

interface PlayerLookup {
  player: {
    findFirst: (args: { where: { name: string }; select: { id: true } }) => Promise<{ id: string } | null>;
  };
}

/** Nome único global (bots incluídos): base, "base 2", "base 3"... */
async function uniquePlayerName(tx: PlayerLookup, base: string): Promise<string> {
  if (!(await tx.player.findFirst({ where: { name: base }, select: { id: true } }))) return base;
  for (let n = 2; n < 40; n++) {
    const candidate = `${base.slice(0, 17)} ${n}`;
    if (!(await tx.player.findFirst({ where: { name: candidate }, select: { id: true } }))) return candidate;
  }
  return `Guerreiro-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Converte as linhas cruas de `personagens` em snapshots sanitizados.
 * Linhas inválidas são descartadas (nunca derrubam a restauração toda).
 * O `atualizado_em` da linha viaja junto — a guarda pós-reset precisa
 * dele para decidir se o snapshot é anterior ao último reset geral.
 */
function sanitizeCharacterRows(
  raw: unknown
): { char: CloudCharacterSnapshot; ativo: boolean; atualizadoEm: unknown }[] {
  if (!Array.isArray(raw)) return [];
  const out: { char: CloudCharacterSnapshot; ativo: boolean; atualizadoEm: unknown }[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const row of raw.slice(0, MAX_CHARACTERS_PER_ACCOUNT)) {
    if (!isRecord(row) || !isRecord(row.estado)) continue;
    try {
      const char = sanitizeCloudCharacterState(row.estado);
      // id da linha (chave estável) vence o id dentro do estado
      const rowId = typeof row.id === 'string' && row.id.length >= 8 && row.id.length <= 64 ? row.id : null;
      const finalChar = rowId ? { ...char, id: rowId } : char;
      if (finalChar.id && seenIds.has(finalChar.id)) continue;
      if (seenNames.has(finalChar.name)) continue;
      seenIds.add(finalChar.id ?? finalChar.name);
      seenNames.add(finalChar.name);
      out.push({ char: finalChar, ativo: row.ativo === true, atualizadoEm: row.atualizado_em ?? null });
    } catch {
      // personagem inválido nesta linha — segue para as próximas
    }
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();

    if (!auth.account.supabaseUserId) {
      throw new ApiError(
        'FORBIDDEN',
        'A restauração na nuvem exige uma conta conectada por e-mail. Use "Salvar meu guerreiro" primeiro.'
      );
    }

    const authHeader = request.headers.get('authorization') ?? '';
    const token = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1]?.trim() ?? '';
    await verifySupabaseIdentity(token, auth.account.supabaseUserId);

    // Payload de estado é proibido: a fonte é exclusivamente o banco.
    const body = await request.json().catch(() => ({}));
    if (
      body &&
      typeof body === 'object' &&
      ('personagens' in body || 'progresso' in body || 'estado' in body)
    ) {
      throw new ApiError('VALIDATION_ERROR', 'Estado de restauração não pode ser enviado pelo cliente.');
    }

    const cloudRows = await loadAuthoritativeCloudCharacters(auth.account.supabaseUserId);
    if (!cloudRows) {
      throw new ApiError('PRECONDITION_FAILED', 'Restauração autoritativa da nuvem indisponível neste ambiente.');
    }

    // ===== linhas v3 lidas server-side =====
    // v0.9.10.1: marcador do último reset geral — presente, snapshots
    // pré-reset são descartados (a nuvem seria o único jeito de um
    // personagem antigo voltar depois de um "Reset geral do servidor").
    const serverResetAt = await db.gameMeta
      .findUnique({ where: { key: 'serverResetAt' } })
      .then((m) => m?.value ?? null)
      .catch(() => null);

    let restoreList: { char: CloudCharacterSnapshot; ativo: boolean; atualizadoEm: unknown }[] = [];
    let staleDropped = 0;
    if (cloudRows.length > 0) {
      const sanitized = sanitizeCharacterRows(cloudRows);
      const filtered = filterStaleRows(sanitized, serverResetAt);
      restoreList = filtered.kept;
      staleDropped = filtered.dropped;
      if (staleDropped > 0) {
        console.warn(
          `[cloud-restore] servidor resetado em ${serverResetAt} — ${staleDropped} snapshot(s) da nuvem ` +
            `PRÉ-RESET descartado(s) (sem ressurreição).`
        );
      }
    }

    const existing = await db.player.findMany({
      where: { accountId: auth.account.id, isBot: false },
      orderBy: { createdAt: 'asc' },
    });

    // LOCAL VENCE: conta já tem personagens → nada a restaurar (o próximo
    // save na nuvem sobrescreve as linhas com o estado local atual).
    if (existing.length > 0 || restoreList.length === 0) {
      const reason =
        existing.length > 0 ? 'local-wins' : staleDropped > 0 ? 'stale-cloud-post-reset' : 'empty-cloud';
      return ok({
        restored: 0,
        reason,
        account: auth.account.username,
        characters: existing.map(playerToView),
      });
    }

    const restored = await db.$transaction(async (tx) => {
      // guarda dupla dentro da transação (condição de corrida)
      const count = await tx.player.count({ where: { accountId: auth.account.id, isBot: false } });
      if (count > 0) return [] as string[];

      // v0.9.4 — quests só valem para o período CORRENTE (diárias de
      // ontem regeneram sozinhas; semanais idem na virada da semana)
      const dPeriod = dailyPeriod();
      const wPeriod = weeklyPeriod();
      const questDefs = new Map([...DAILY_QUESTS, ...WEEKLY_QUESTS].map((q) => [q.id, q]));

      const createdIds: string[] = [];
      let activePlayerId: string | null = null;

      for (const { char, ativo } of restoreList.slice(0, MAX_CHARACTERS_PER_ACCOUNT)) {
        const name = await uniquePlayerName(tx, char.name);
        let created;
        try {
          created = await tx.player.create({
            data: {
              ...cloudCharacterToPlayerData(char, name),
              // Esferas são recurso GLOBAL do mundo, não estado restaurável
              // do personagem. A posse real vive em DragonBallPossession.
              dragonBalls: 0,
              accountId: auth.account.id,
            },
          });
        } catch {
          // id da nuvem já existe localmente (ex.: linha de outra conta de
          // teste) → cria com id novo; o save seguinte atualiza a linha da
          // nuvem com o id local (a antiga é limpa pelo sync)
          created = await tx.player.create({
            data: {
              ...cloudCharacterToPlayerData({ ...char, id: null }, name),
              dragonBalls: 0,
              accountId: auth.account.id,
            },
          });
        }
        // normaliza vida/energia pelos máximos derivados (anti-snapshot absurdo)
        const derived = computeDerived(created);
        const hp = Math.max(1, Math.min(created.hp, derived.maxHp));
        const energy = Math.max(0, Math.min(created.energy, derived.maxEnergy));
        if (hp !== created.hp || energy !== created.energy) {
          await tx.player.update({ where: { id: created.id }, data: { hp, energy } });
        }

        // ===== materiais profissionais =====
        // A tabela relacional é autoritativa no jogo; o snapshot é apenas
        // recuperação. IDs e quantidades já foram sanitizados em progress.ts.
        for (const material of char.materials ?? []) {
          await tx.inventoryStack.create({
            data: {
              playerId: created.id,
              itemId: material.itemId,
              quantity: material.quantity,
            },
          });
        }

        // ===== fabricação em andamento =====
        // Ingredientes foram consumidos ANTES do snapshot; restauramos apenas
        // a fila, com saída/timestamps já sanitizados contra o catálogo.
        if (char.craftJob) {
          const recipe = getCraftRecipe(char.craftJob.recipeId);
          if (recipe) {
            const batch = Math.max(
              1,
              Math.trunc(char.craftJob.outputQuantity / Math.max(1, recipe.outputQuantity))
            );
            await tx.craftJob.create({
              data: {
                playerId: created.id,
                recipeId: char.craftJob.recipeId,
                outputItemId: char.craftJob.outputItemId,
                outputQuantity: char.craftJob.outputQuantity,
                outputKind: char.craftJob.outputKind,
                academicLevelStart: char.craftJob.academicLevelStart,
                inputZeni: recipe.costZeni * batch,
                inputIngredients: JSON.stringify(
                  recipe.ingredients.map((ingredient) => ({
                    itemId: ingredient.itemId,
                    quantity: ingredient.quantity * batch,
                  }))
                ),
                startedAt: new Date(char.craftJob.startedAt),
                endsAt: new Date(char.craftJob.endsAt),
              },
            });
          }
        }

        // ===== quests do período atual =====
        // Alvos e RECOMPENSAS vêm sempre dos catálogos do jogo — a nuvem
        // só entrega progresso/coletado (defesa em profundidade).
        for (const q of char.quests) {
          if (q.period !== dPeriod && q.period !== wPeriod) continue;
          const def = questDefs.get(q.questId);
          if (!def || def.kind !== q.kind) continue;
          await tx.questProgress.upsert({
            where: {
              playerId_questId_period: { playerId: created.id, questId: q.questId, period: q.period },
            },
            update: { progress: q.progress, claimed: q.claimed },
            create: {
              playerId: created.id,
              questId: q.questId,
              kind: q.kind,
              period: q.period,
              target: def.target,
              rewardZeni: def.rewardZeni,
              rewardXp: def.rewardXp,
              rewardCrystals: def.rewardCrystals,
              progress: q.progress,
              claimed: q.claimed,
              claimedAt: q.claimed ? new Date() : null,
            },
          });
        }

        // ===== conquistas já coletadas =====
        // O PROGRESSO é derivado dos contadores (já restaurados acima);
        // aqui só marcamos o que já foi coletado para não coletar de novo.
        for (const a of char.achievementsClaimed) {
          const at = a.claimedAt ? new Date(a.claimedAt) : new Date();
          await tx.achievementState.upsert({
            where: {
              playerId_achievementId: { playerId: created.id, achievementId: a.achievementId },
            },
            update: { claimedAt: at, unlockedAt: at },
            create: {
              playerId: created.id,
              achievementId: a.achievementId,
              progress: 0,
              unlockedAt: at,
              claimedAt: at,
            },
          });
        }

        createdIds.push(created.id);
        if (ativo) activePlayerId = created.id;
      }

      if (createdIds.length > 0) {
        await tx.account.update({
          where: { id: auth.account.id },
          data: { activePlayerId: activePlayerId ?? createdIds[0] },
        });
      }

      return createdIds;
    });

    const characters = await db.player.findMany({
      where: { accountId: auth.account.id, isBot: false },
      orderBy: { createdAt: 'asc' },
    });

    if (restored.length > 0) {
      await trackEvent('cloud_restore', {
        accountId: auth.account.id,
        metadata: { characters: restored.length },
      });
    }

    // relê a conta: activePlayerId pode ter sido definido na transação
    const accountAfter = await db.account.findUnique({ where: { id: auth.account.id } });

    return ok({
      restored: restored.length,
      reason: 'restored',
      account: accountAfter?.username ?? auth.account.username,
      characters: characters.map(playerToView),
      activePlayerId:
        accountAfter?.activePlayerId && characters.some((p) => p.id === accountAfter.activePlayerId)
          ? accountAfter.activePlayerId
          : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
