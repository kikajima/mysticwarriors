import { MAX_ACTION_ENERGY } from '@/lib/game/rules';
// =====================================================================
// PAINEL DE ADMIN — ações no banco LOCAL do jogo (v0.9.6)
// ---------------------------------------------------------------------
// v0.9.6 (Mudança 4): o painel opera sobre PERSONAGENS, não contas.
//  * a lista é de personagens (nome, raça, nível, poder) — o e-mail da
//    conta dona aparece apenas como INFORMAÇÃO;
//  * TODAS as ações agem sobre o personagem escolhido: dar zenni/
//    diamantes/esferas, editar atributos, dar XP/nível, restaurar
//    energia, completar profissão/treinamento, dar itens/auras/
//    cosméticos/transformações e resetar progresso (DAQUELE personagem).
//
// QUEM PODE CHAMAR: apenas as rotas /api/admin/* — que validam o admin
// no SUPABASE (RPC is_admin, security definer) ANTES de chegar aqui.
// Toda mutação de moeda gera registro no ledger (WalletTransaction).
//
// Nuvem: para contas vinculadas ao Supabase, o espelho é a linha do
// PERSONAGEM na tabela `personagens` (via RPC admin_upsert_personagem) —
// assim o que o admin dá sobrevive a limpezas do banco local. Para
// personagens que só existem na nuvem, o patch é aplicado DIRETAMENTE
// no estado (coluna estado) pelas funções puras patch*.
// =====================================================================

import type { Player, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import { applyEquipmentBuy, computeDerived, itemCount, parseItems } from './engine';
import { isOnActiveMission } from './rules';
import { grantRewards } from '@/lib/economy';
import { trackEvent } from '@/lib/analytics';
import { getItem, getProfessionMaterial } from './content/world';
import { getCraftedItem, getCraftStackItem } from './content/crafting';
import { createPlayerNotification } from './notifications';
import { resolveDueActivities } from './activities';
import { getTransformation } from './content/transformations';
import { getCosmetic } from './content/cosmetics';
import {
  serializeCharacterForCloud,
  type CloudCharacterSnapshot,
} from '@/lib/supabase/progress';
import { collectCharacterExtras } from '@/lib/supabase/progress-server';
import {
  initialPlayerData,
  initialCloudCharacterState,
} from './characterInitial';

// ===== Limites das ações de admin (clamp defensivo) =====

export const ADMIN_LIMITS = {
  zeni: 100_000_000,
  crystals: 100_000,
  dragonBalls: 7,
  stat: 999_999,
  level: 999,
  xp: 1_000_000_000,
  maxDelta: 1_000_000_000,
} as const;

export function clampAdminInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function setAdminDragonBallCount(
  tx: Prisma.TransactionClient,
  playerId: string,
  desiredCount: number
): Promise<number> {
  const desired = clampAdminInt(desiredCount, 0, ADMIN_LIMITS.dragonBalls);
  let owned = await tx.dragonBallPossession.findMany({
    where: { playerId },
    orderBy: { star: 'asc' },
    select: { star: true },
  });

  if (desired < owned.length) {
    const release = owned.slice(desired);
    await tx.dragonBallPossession.updateMany({
      where: { star: { in: release.map((ball) => ball.star) }, playerId },
      data: { playerId: null, acquiredAt: new Date() },
    });
  } else if (desired > owned.length) {
    let missing = desired - owned.length;
    while (missing > 0) {
      const free = await tx.dragonBallPossession.findFirst({
        where: { playerId: null },
        orderBy: { star: 'asc' },
        select: { star: true },
      });
      if (!free) break;
      const claimed = await tx.dragonBallPossession.updateMany({
        where: { star: free.star, playerId: null },
        data: { playerId, acquiredAt: new Date() },
      });
      if (claimed.count === 0) continue;
      missing--;
    }
  }

  owned = await tx.dragonBallPossession.findMany({
    where: { playerId },
    orderBy: { star: 'asc' },
    select: { star: true },
  });
  await tx.player.update({ where: { id: playerId }, data: { dragonBalls: owned.length } });
  return owned.length;
}

export async function grantAdminDragonBallStar(
  tx: Prisma.TransactionClient,
  player: Player,
  rawStar: number
): Promise<string> {
  const star = clampAdminInt(rawStar, 1, 7);
  const possession = await tx.dragonBallPossession.findUnique({
    where: { star },
    include: { player: { select: { id: true, name: true } } },
  });
  if (!possession) {
    throw new ApiError('VALIDATION_ERROR', `A Esfera de ${star} estrela${star === 1 ? '' : 's'} não existe no mundo.`);
  }
  if (possession.playerId === player.id) {
    return `${player.name} já possui a Esfera de ${star} estrela${star === 1 ? '' : 's'}.`;
  }
  if (possession.playerId) {
    throw new ApiError(
      'CONFLICT',
      `A Esfera de ${star} estrela${star === 1 ? '' : 's'} já pertence a ${possession.player?.name ?? 'outro guerreiro'}.`
    );
  }

  const claimed = await tx.dragonBallPossession.updateMany({
    where: { star, playerId: null },
    data: { playerId: player.id, acquiredAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new ApiError('CONFLICT', 'Essa Esfera acabou de mudar de dono. Atualize o painel e tente novamente.');
  }

  const count = await tx.dragonBallPossession.count({ where: { playerId: player.id } });
  await tx.player.update({ where: { id: player.id }, data: { dragonBalls: count } });
  await createPlayerNotification(tx, {
    playerId: player.id,
    kind: 'admin',
    title: '🐉 Esfera concedida!',
    message: `A administração concedeu a você a Esfera de ${star} estrela${star === 1 ? '' : 's'}.`,
    metadata: { star, source: 'admin' },
  });
  return `Esfera de ${star} estrela${star === 1 ? '' : 's'} concedida a ${player.name} (${count}/7).`;
}

// ===== Tipos compartilhados com a UI =====

/** Um personagem na lista do painel (fonte local OU nuvem). */
export interface AdminCharacterRow {
  /** id do personagem (Player local, ou id da linha na nuvem). */
  id: string;
  name: string;
  race: string;
  level: number;
  power: number;
  xp: number;
  zeni: number;
  crystals: number;
  dragonBalls: number;
  energy: number | null;
  maxEnergy: number | null;
  hp: number | null;
  maxHp: number | null;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
  battlesWon: number;
  battlesLost: number;
  /** local: turno/atividade em andamento; nuvem: sempre false. */
  busy: boolean;
  missionEndsAt: string | null;
  /** 'local' = vive no servidor do jogo; 'cloud' = só na nuvem. */
  source: 'local' | 'cloud';
  /** v0.14 — última atividade do personagem (updatedAt local; null na nuvem). Usado para avisar "jogador online" na exclusão. */
  lastSeenAt: string | null;
  /** v0.14 — nome da guilda do personagem (null se sem guilda; null se só-nuvem — a nuvem não espelha guildas). */
  guildName: string | null;
  /** v0.14 — o personagem é o LÍDER da guilda? (a exclusão dispara auto-dissolução). */
  isGuildLeader: boolean;
  /** v0.14 — nº de membros da guilda dele (null se sem guilda/nuvem). */
  guildMemberCount: number | null;
  /** dono — chave para espelhar na nuvem (uuid Supabase) ou conta local. */
  ownerKey: string;
  /** e-mail da conta dona — APENAS informação, não é alvo de ação. */
  ownerEmail: string | null;
  ownerNick: string | null;
  isGuest: boolean;
}

export type AdminActionKind =
  | 'grant'
  | 'set_stats'
  | 'set_progress'
  | 'restore_energy'
  | 'restore_health'
  | 'accelerate_activity'
  | 'finish' // alias legado para clientes admin em cache
  | 'grant_dragon_ball'
  | 'grant_craft_material'
  | 'grant_crafted_item'
  | 'reset'
  | 'grant_item'
  | 'grant_cosmetic'
  | 'grant_transformation';

export interface AdminActionInput {
  /** id do PERSONAGEM alvo (linha local, ou id da linha na nuvem). */
  characterId: string;
  /** uuid Supabase do dono (necessário p/ espelhar na nuvem). */
  ownerId: string | null;
  action: AdminActionKind;
  zeniDelta?: number;
  crystalDelta?: number;
  ballDelta?: number;
  xpGain?: number;
  strength?: number;
  defense?: number;
  speed?: number;
  ki?: number;
  level?: number;
  xp?: number;
  itemId?: string;
  cosmeticId?: string;
  transformationId?: string;
  dragonBallStar?: number;
  materialId?: string;
  craftedItemId?: string;
  quantity?: number;
}

export interface AdminActionResultLocal {
  ok: boolean;
  message: string;
  /** resumo atualizado do personagem (quando local). */
  character: AdminCharacterRow | null;
  /** id da conta local do dono (para espelho na nuvem). */
  accountId: string | null;
}

// ===== Resumo de personagem =====

function playerToRow(
  player: Player & {
    account?: { id: string; username: string | null; isGuest: boolean; supabaseUserId: string | null } | null;
    guild?: { id: string; name: string; leaderId: string } | null;
  },
  guildMemberCount: number | null = null
): AdminCharacterRow {
  const derived = computeDerived(player);
  return {
    id: player.id,
    name: player.name,
    race: player.race,
    level: player.level,
    power: derived.power,
    xp: player.xp,
    zeni: player.zeni,
    crystals: player.crystals,
    dragonBalls: player.dragonBalls,
    energy: player.energy,
    maxEnergy: derived.maxEnergy,
    hp: player.hp,
    maxHp: derived.maxHp,
    strength: player.strength,
    defense: player.defense,
    speed: player.speed,
    ki: player.ki,
    battlesWon: player.battlesWon,
    battlesLost: player.battlesLost,
    busy: isOnActiveMission(player),
    missionEndsAt: player.missionEndsAt ? player.missionEndsAt.toISOString() : null,
    source: 'local',
    lastSeenAt: player.updatedAt.toISOString(),
    guildName: player.guild?.name ?? null,
    isGuildLeader: player.guild?.leaderId === player.id,
    guildMemberCount: player.guild ? guildMemberCount : null,
    ownerKey: player.account?.supabaseUserId ?? (player.account ? `local:${player.account.id}` : 'local:sem-conta'),
    ownerEmail: null, // preenchido pela rota com os dados da nuvem
    ownerNick: player.account ? (player.account.isGuest ? `${player.account.username ?? 'Convidado'} (convidado)` : player.account.username) : null,
    isGuest: player.account?.isGuest ?? false,
  };
}

/**
 * Lista os personagens do servidor local (fonte viva — inclui convidados).
 * v0.9.6: cada linha é um PERSONAGEM; a conta dona é só metadado.
 * v0.14: inclui a guilda do personagem (nome/liderança/nº de membros)
 * — o modal de exclusão precisa do AVISO de auto-dissolução.
 */
export async function listLocalCharactersForAdmin(): Promise<AdminCharacterRow[]> {
  const players = await db.player.findMany({
    where: { isBot: false },
    orderBy: [{ level: 'desc' }, { battlesWon: 'desc' }, { createdAt: 'asc' }],
    include: {
      account: { select: { id: true, username: true, isGuest: true, supabaseUserId: true } },
      guild: { select: { id: true, name: true, leaderId: true } },
    },
  });
  // contagem de membros por guilda em UMA query (sem N+1)
  const guildIds = [...new Set(players.map((p) => p.guild?.id).filter((g): g is string => !!g))];
  const counts = new Map<string, number>();
  if (guildIds.length > 0) {
    const grouped = await db.player.groupBy({ by: ['guildId'], where: { guildId: { in: guildIds } }, _count: { _all: true } });
    for (const g of grouped) {
      if (g.guildId) counts.set(g.guildId, g._count._all);
    }
  }
  return players.map((p) => playerToRow(p, p.guild ? (counts.get(p.guild.id) ?? null) : null));
}

/** Linha pronta para a tabela `personagens` da nuvem (espelho de 1 personagem). */
export interface AdminCloudCharacterRow {
  id: string;
  user_id: string;
  nome: string;
  raca: string;
  nivel: number;
  poder: number;
  vitorias: number;
  derrotas: number;
  ativo: boolean;
  estado: CloudCharacterSnapshot;
}

/**
 * Constrói a linha da nuvem para um personagem local — usada para
 * espelhar na nuvem o efeito de uma ação de admin NA HORA.
 */
export async function buildCloudCharacterRow(playerId: string): Promise<AdminCloudCharacterRow | null> {
  const player = await db.player.findUnique({
    where: { id: playerId },
    include: { account: { select: { id: true, activePlayerId: true, supabaseUserId: true } } },
  });
  if (!player || !player.account?.supabaseUserId) return null;
  const extras = await collectCharacterExtras([player.id]);
  const derived = computeDerived(player);
  return {
    id: player.id,
    user_id: player.account.supabaseUserId,
    nome: player.name,
    raca: player.race,
    nivel: player.level,
    poder: derived.power,
    vitorias: player.battlesWon,
    derrotas: player.battlesLost,
    ativo: player.account.activePlayerId === player.id,
    estado: serializeCharacterForCloud(player, extras.get(player.id)),
  };
}

// ===== Ledger (auditoria de moeda) =====

type Tx = Prisma.TransactionClient;

async function adjustZeni(tx: Tx, playerId: string, delta: number, accountId: string | null): Promise<void> {
  const fresh = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { zeni: true } });
  const after = clampAdminInt(fresh.zeni + delta, 0, ADMIN_LIMITS.zeni);
  if (after === fresh.zeni) return;
  await tx.player.update({ where: { id: playerId }, data: { zeni: after } });
  await tx.walletTransaction.create({
    data: {
      playerId,
      accountId,
      currency: 'zeni',
      amount: after - fresh.zeni,
      type: delta > 0 ? 'grant' : 'spend',
      source: 'admin',
      balanceBefore: fresh.zeni,
      balanceAfter: after,
      metadata: JSON.stringify({ admin: true }),
    },
  });
}

async function adjustCrystals(tx: Tx, playerId: string, delta: number, accountId: string | null): Promise<void> {
  const fresh = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { crystals: true } });
  const after = clampAdminInt(fresh.crystals + delta, 0, ADMIN_LIMITS.crystals);
  if (after === fresh.crystals) return;
  await tx.player.update({ where: { id: playerId }, data: { crystals: after } });
  await tx.walletTransaction.create({
    data: {
      playerId,
      accountId,
      currency: 'crystal',
      amount: after - fresh.crystals,
      type: delta > 0 ? 'grant' : 'spend',
      source: 'admin',
      balanceBefore: fresh.crystals,
      balanceAfter: after,
      metadata: JSON.stringify({ admin: true }),
    },
  });
}

/** Vida/energia nunca acima dos máximos derivados após edições de admin. */
async function clampVitals(tx: Tx, playerId: string): Promise<void> {
  const fresh = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
  const d = computeDerived(fresh);
  await tx.player.update({
    where: { id: playerId },
    data: { hp: Math.min(fresh.hp, d.maxHp), energy: Math.min(fresh.energy, d.maxEnergy) },
  });
}

// ===== Parse helpers =====

function parseOwnedList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string').slice(0, 100) : [];
  } catch {
    return [];
  }
}

// ===== Execução da ação no banco local (ALVO = PERSONAGEM) =====

export async function applyAdminActionLocal(input: AdminActionInput): Promise<AdminActionResultLocal> {
  // alvo direto: o personagem pelo id (não existe mais "conta + nome")
  const target = await db.player.findUnique({
    where: { id: input.characterId },
    include: { account: { select: { id: true, username: true, isGuest: true, supabaseUserId: true } } },
  });
  if (!target || target.isBot) {
    return {
      ok: false,
      message: 'Este personagem não está no servidor agora (pode existir só na nuvem).',
      character: null,
      accountId: null,
    };
  }
  const accountId = target.accountId;

  try {
    const message = await db.$transaction(
      async (tx) => {
        const fresh = await tx.player.findUniqueOrThrow({ where: { id: target.id } });

        if (input.action === 'grant') {
          const parts: string[] = [];
          if (input.zeniDelta) {
            await adjustZeni(tx, fresh.id, clampAdminInt(input.zeniDelta, -ADMIN_LIMITS.maxDelta, ADMIN_LIMITS.maxDelta), accountId);
            parts.push('Zeni ajustado');
          }
          if (input.crystalDelta) {
            await adjustCrystals(tx, fresh.id, clampAdminInt(input.crystalDelta, -ADMIN_LIMITS.maxDelta, ADMIN_LIMITS.maxDelta), accountId);
            parts.push('Diamantes ajustados');
          }
          if (input.ballDelta) {
            const current = await tx.dragonBallPossession.count({ where: { playerId: fresh.id } });
            const desired = clampAdminInt(current + input.ballDelta, 0, ADMIN_LIMITS.dragonBalls);
            const after = await setAdminDragonBallCount(tx, fresh.id, desired);
            parts.push(
              after === desired
                ? `Esferas do Dragão: ${after}/7`
                : `Esferas do Dragão: ${after}/7 (não há mais esferas globais livres)`
            );
          }
          if (input.xpGain && input.xpGain > 0) {
            const g = await grantRewards(
              tx,
              fresh,
              { xp: clampAdminInt(input.xpGain, 1, ADMIN_LIMITS.xp) },
              { type: 'reward', source: 'admin', accountId }
            );
            parts.push(`+${Math.floor(input.xpGain).toLocaleString('pt-BR')} XP${g.levelsGained > 0 ? ` (subiu ${g.levelsGained} nível(is)!)` : ''}`);
          }
          await trackEvent('admin_grant', { accountId, metadata: { character: fresh.name } }, tx);
          return parts.length > 0 ? `${parts.join(' · ')} para ${fresh.name}.` : 'Nada para conceder — preencha algum valor.';

        } else if (input.action === 'set_stats') {
          const data: Partial<Pick<Player, 'strength' | 'defense' | 'speed' | 'ki'>> = {};
          if (input.strength !== undefined) data.strength = clampAdminInt(input.strength, 0, ADMIN_LIMITS.stat);
          if (input.defense !== undefined) data.defense = clampAdminInt(input.defense, 0, ADMIN_LIMITS.stat);
          if (input.speed !== undefined) data.speed = clampAdminInt(input.speed, 0, ADMIN_LIMITS.stat);
          if (input.ki !== undefined) data.ki = clampAdminInt(input.ki, 0, ADMIN_LIMITS.stat);
          if (Object.keys(data).length === 0) return 'Nenhum atributo para editar — preencha algum valor.';
          await tx.player.update({ where: { id: fresh.id }, data });
          await clampVitals(tx, fresh.id);
          await trackEvent('admin_set_stats', { accountId, metadata: { character: fresh.name } }, tx);
          return `Atributos de ${fresh.name} atualizados (vida/energia limitadas aos novos máximos).`;

        } else if (input.action === 'set_progress') {
          const data: Partial<Pick<Player, 'level' | 'xp'>> = {};
          if (input.level !== undefined) data.level = clampAdminInt(input.level, 1, ADMIN_LIMITS.level);
          if (input.xp !== undefined) data.xp = clampAdminInt(input.xp, 0, ADMIN_LIMITS.xp);
          if (Object.keys(data).length === 0) return 'Nada definido — informe nível e/ou XP.';
          await tx.player.update({ where: { id: fresh.id }, data });
          await clampVitals(tx, fresh.id);
          await trackEvent('admin_set_progress', { accountId, metadata: { character: fresh.name } }, tx);
          const nivel = data.level !== undefined ? `nível ${data.level}` : null;
          const xpTxt = data.xp !== undefined ? `${data.xp.toLocaleString('pt-BR')} XP` : null;
          return `${fresh.name}: ${[nivel, xpTxt].filter(Boolean).join(' · ')} definido(s).`;

        } else if (input.action === 'restore_energy') {
          const d = computeDerived(fresh);
          await tx.player.update({ where: { id: fresh.id }, data: { energy: d.maxEnergy } });
          await trackEvent('admin_restore_energy', { accountId, metadata: { character: fresh.name } }, tx);
          return `Energia de ${fresh.name} restaurada ao total (${d.maxEnergy}).`;

        } else if (input.action === 'restore_health') {
          const d = computeDerived(fresh);
          await tx.player.update({ where: { id: fresh.id }, data: { hp: d.maxHp } });
          await trackEvent('admin_restore_health', { accountId, metadata: { character: fresh.name } }, tx);
          return `Vida de ${fresh.name} restaurada ao total (${d.maxHp}).`;

        } else if (input.action === 'accelerate_activity' || input.action === 'finish') {
          const readyAt = new Date(Date.now() - 1000);
          const done: string[] = [];

          if (fresh.missionId && fresh.missionEndsAt && fresh.missionEndsAt.getTime() > readyAt.getTime()) {
            await tx.player.update({ where: { id: fresh.id }, data: { missionEndsAt: readyAt } });
            done.push('trabalho pronto para coletar');
          }

          const activities = await tx.activity.updateMany({
            where: { playerId: fresh.id, completedAt: null, endsAt: { gt: readyAt } },
            data: { endsAt: readyAt },
          });
          if (activities.count > 0) {
            const resolved = await resolveDueActivities(tx, fresh);
            done.push(`${resolved.length} atividade(s) concluída(s) instantaneamente`);
          }

          const craft = await tx.craftJob.updateMany({
            where: { playerId: fresh.id, endsAt: { gt: readyAt } },
            data: { endsAt: readyAt },
          });
          if (craft.count > 0) {
            done.push('fabricação pronta para coletar');
          }

          await trackEvent('admin_accelerate_activity', {
            accountId,
            metadata: {
              character: fresh.name,
              profession: !!fresh.missionId,
              activities: activities.count,
              craft: craft.count,
            },
          }, tx);

          return done.length > 0
            ? `${fresh.name}: ${done.join(' · ')}. Nenhuma recompensa foi antecipada; o fluxo normal de resolução/coleta continua valendo.`
            : `${fresh.name} não tem atividade com timer em andamento neste servidor.`;

        } else if (input.action === 'grant_dragon_ball') {
          if (input.dragonBallStar === undefined) {
            throw new ApiError('VALIDATION_ERROR', 'Escolha qual Esfera do Dragão deseja conceder.');
          }
          const message = await grantAdminDragonBallStar(tx, fresh, input.dragonBallStar);
          await trackEvent('admin_grant_dragon_ball', {
            accountId,
            metadata: { character: fresh.name, star: input.dragonBallStar },
          }, tx);
          return message;

        } else if (input.action === 'grant_craft_material') {
          const materialId = String(input.materialId ?? '');
          const material = getProfessionMaterial(materialId) ?? getCraftStackItem(materialId);
          if (!material) throw new ApiError('VALIDATION_ERROR', 'Material/projeto de crafting desconhecido.');

          const quantity = clampAdminInt(input.quantity ?? 1, 1, 999);
          const current = await tx.inventoryStack.findUnique({
            where: { playerId_itemId: { playerId: fresh.id, itemId: materialId } },
            select: { quantity: true },
          });
          if ((current?.quantity ?? 0) + quantity > 1_000_000) {
            throw new ApiError('VALIDATION_ERROR', 'Esse estoque atingiria o limite máximo permitido.');
          }
          await tx.inventoryStack.upsert({
            where: { playerId_itemId: { playerId: fresh.id, itemId: materialId } },
            update: { quantity: { increment: quantity } },
            create: { playerId: fresh.id, itemId: materialId, quantity },
          });
          await trackEvent('admin_grant_craft_material', {
            accountId,
            metadata: { character: fresh.name, itemId: materialId, quantity },
          }, tx);
          return `${material.icon} +${quantity} ${material.name} para ${fresh.name}.`;

        } else if (input.action === 'grant_crafted_item') {
          const craftedId = String(input.craftedItemId ?? '');
          const item = getCraftedItem(craftedId);
          if (!item) throw new ApiError('VALIDATION_ERROR', 'Item exclusivo da Oficina desconhecido.');

          const items = parseItems(fresh.items);
          const requested = clampAdminInt(input.quantity ?? 1, 1, 999);
          if (item.category === 'consumable') {
            const current = items.consumables[item.id] ?? 0;
            if (current + requested > 999) {
              throw new ApiError('VALIDATION_ERROR', `Limite de 999 unidades de ${item.name} excedido.`);
            }
            items.consumables[item.id] = current + requested;
          } else {
            if (requested !== 1) {
              throw new ApiError('VALIDATION_ERROR', 'Equipamentos e itens permanentes de crafting só podem ser concedidos uma unidade por vez.');
            }
            if (items.owned.includes(item.id)) return `${fresh.name} já possui ${item.name}.`;
            if (items.owned.length >= 200) throw new ApiError('VALIDATION_ERROR', 'Inventário cheio (limite 200).');
            items.owned.push(item.id);
          }
          await tx.player.update({ where: { id: fresh.id }, data: { items: JSON.stringify(items) } });
          await trackEvent('admin_grant_crafted_item', {
            accountId,
            metadata: { character: fresh.name, itemId: item.id, quantity: requested },
          }, tx);
          return `${item.icon} ${item.name} concedido a ${fresh.name}${requested > 1 ? ` (×${requested})` : ''}.`;

        } else if (input.action === 'grant_item') {
          // v0.9.6: dar ITEM de loja ao personagem (catálogo validado).
          // v0.9.10: equipamentos/treino são EMPILHÁVEIS — conceder um que
          // o personagem já tem soma uma unidade às reservas (stacks).
          const item = getItem(String(input.itemId ?? ''));
          if (!item) throw new ApiError('VALIDATION_ERROR', 'Item desconhecido.');
          const items = parseItems(fresh.items);
          if (item.category === 'consumable') {
            const cur = items.consumables[item.id] ?? 0;
            if (cur >= 999) return `${fresh.name} já está cheio de ${item.name} (999).`;
            items.consumables[item.id] = cur + 1;
            await tx.player.update({ where: { id: fresh.id }, data: { items: JSON.stringify(items) } });
            await trackEvent('admin_grant_item', { accountId, metadata: { character: fresh.name, item: item.id } }, tx);
            return `${item.icon} ${item.name} entregue a ${fresh.name} (${items.consumables[item.id]} no inventário).`;
          }
          if (items.owned.length >= 200) throw new ApiError('VALIDATION_ERROR', 'Inventário cheio (limite 200).');
          const before = itemCount(items, item.id);
          if (before >= 999) return `${fresh.name} já está cheio de ${item.name} (999 unidades).`;
          applyEquipmentBuy(items, item.id, 1);
          await tx.player.update({ where: { id: fresh.id }, data: { items: JSON.stringify(items) } });
          await trackEvent('admin_grant_item', { accountId, metadata: { character: fresh.name, item: item.id } }, tx);
          return before === 0
            ? `${item.icon} ${item.name} entregue a ${fresh.name}.`
            : `${item.icon} +1 ${item.name} para ${fresh.name} (${before + 1} unidades no inventário).`;

        } else if (input.action === 'grant_cosmetic') {
          // v0.9.6: dar COSMÉTICO/AURA ao personagem (posse própria).
          const cosmetic = getCosmetic(String(input.cosmeticId ?? ''));
          if (!cosmetic) throw new ApiError('VALIDATION_ERROR', 'Cosmético desconhecido.');
          const owned = parseOwnedList(fresh.cosmeticsOwned);
          if (owned.includes(cosmetic.id)) return `${fresh.name} já possui ${cosmetic.name}.`;
          if (owned.length >= 100) throw new ApiError('VALIDATION_ERROR', 'Coleção cheia (limite 100).');
          owned.push(cosmetic.id);
          await tx.player.update({ where: { id: fresh.id }, data: { cosmeticsOwned: JSON.stringify(owned) } });
          await trackEvent('admin_grant_cosmetic', { accountId, metadata: { character: fresh.name, cosmetic: cosmetic.id } }, tx);
          return `${cosmetic.icon} ${cosmetic.name} concedido a ${fresh.name} (pode equipar na loja).`;

        } else if (input.action === 'grant_transformation') {
          // v0.9.6: desbloquear TRANSFORMAÇÃO para o personagem (admin
          // libera requisitos; raça continua sendo validada — transformação
          // de outra raça não faria sentido no jogo).
          const tr = getTransformation(String(input.transformationId ?? ''));
          if (!tr) throw new ApiError('VALIDATION_ERROR', 'Transformação desconhecida.');
          if (tr.race !== 'any' && tr.race !== fresh.race) {
            throw new ApiError('VALIDATION_ERROR', `${tr.name} é exclusiva da raça ${tr.race} (${fresh.name} é ${fresh.race}).`);
          }
          const owned = parseOwnedList(fresh.transformationsOwned);
          if (owned.includes(tr.id)) return `${fresh.name} já desbloqueou ${tr.name}.`;
          owned.push(tr.id);
          await tx.player.update({ where: { id: fresh.id }, data: { transformationsOwned: JSON.stringify(owned) } });
          await trackEvent('admin_grant_transformation', { accountId, metadata: { character: fresh.name, transformation: tr.id } }, tx);
          return `${tr.icon} ${tr.name} desbloqueada para ${fresh.name} (ative na aba Transformações).`;

        } else if (input.action === 'reset') {
          // v0.9.11 — LÓGICA INVERTIDA: o reset não enumera mais o que
          // zerar (a lista enumerada foi escrita antes de cosméticos/
          // diamantes/avatar pertencerem ao personagem — daí o bug do
          // cosmético sobrevivente). Agora ele ESCREVE O ESTADO INICIAL
          // de um personagem novo (characterInitial.ts — a MESMA fonte
          // da criação) e preserva apenas a IDENTIDADE: id, conta, nome,
          // raça, sexo e guilda. Todo o resto zera: cosméticos
          // (comprados e equipados), avatar, itens, auras,
          // transformações, zenni, diamantes, esferas, XP/nível/
          // atributos, vida/energia, conquistas, missões, profissão,
          // treinamentos, cooldowns e pontos de temporada.
          const now = new Date();
          await tx.player.update({
            where: { id: fresh.id },
            data: { ...initialPlayerData(), lastRegen: now, lastRegenHp: now },
          });
          // tabelas relacionadas: progresso derivado do personagem
          await tx.activity.deleteMany({ where: { playerId: fresh.id, completedAt: null } });
          await tx.requestDedup.deleteMany({ where: { playerId: fresh.id } });
          await tx.questProgress.deleteMany({ where: { playerId: fresh.id } });
          await tx.achievementState.deleteMany({ where: { playerId: fresh.id } });
          await tx.seasonRankEntry.deleteMany({ where: { playerId: fresh.id } });
          await tx.inventoryStack.deleteMany({ where: { playerId: fresh.id } });
          await tx.craftJob.deleteMany({ where: { playerId: fresh.id } });
          await tx.playerNotification.deleteMany({ where: { playerId: fresh.id } });
          await tx.dragonBallPossession.updateMany({
            where: { playerId: fresh.id },
            data: { playerId: null, acquiredAt: now },
          });
          // dano no Ameaça Universal ATUAL: personagem zerado não mantém
          // crédito de dano no evento em andamento (histórico de
          // eventos passados permanece — é registro do evento)
          const bossRemoved = await tx.worldBossDamage.deleteMany({
            where: { playerId: fresh.id, boss: { status: 'active' } },
          });
          await trackEvent('admin_reset_progress', { accountId, metadata: { character: fresh.name } }, tx);
          return (
            `${fresh.name} voltou ao estado de criação — só nome, raça e sexo preservados. ` +
            `Zerados: cosméticos, avatar, diamantes (${fresh.crystals}), itens, transformações, ` +
            `conquistas, missões, profissão e pontos de temporada` +
            `${bossRemoved.count > 0 ? ' — dano no Ameaça Universal atual removido' : ''}.`
          );

        } else {
          throw new ApiError('VALIDATION_ERROR', 'Ação de admin desconhecida.');
        }
      },
      { timeout: 15_000, maxWait: 5_000 }
    );

    const updated = await db.player.findUniqueOrThrow({
      where: { id: target.id },
      include: { account: { select: { id: true, username: true, isGuest: true, supabaseUserId: true } } },
    });
    return { ok: true, message, character: playerToRow(updated), accountId };
  } catch (error) {
    const msg = error instanceof ApiError ? error.message : 'Não foi possível aplicar a ação localmente.';
    return { ok: false, message: msg, character: null, accountId };
  }
}

// =====================================================================
// PATCH DIRETO NO ESTADO DA NUVEM (personagem sem estado local)
// =====================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export interface CloudCharacterPatch {
  zeniDelta?: number;
  crystalDelta?: number;
  xpGain?: number;
  strength?: number;
  defense?: number;
  speed?: number;
  ki?: number;
  level?: number;
  xp?: number;
  restoreEnergy?: boolean;
  restoreHealth?: boolean;
  accelerateActivity?: boolean;
  finishMission?: boolean; // alias legado: equivale a acelerar atividade
  itemId?: string;
  materialId?: string;
  materialQuantity?: number;
  craftedItemId?: string;
  craftedItemQuantity?: number;
  cosmeticId?: string;
  transformationId?: string;
}

/**
 * Aplica uma ação de admin DIRETAMENTE no `estado` (jsonb) de um
 * personagem que só existe na nuvem. Pureza: não toca em banco.
 * Devolve o novo estado ou null se inválido.
 */
export function patchCloudCharacterState(raw: unknown, patch: CloudCharacterPatch): CloudCharacterSnapshot | null {
  if (!isRecord(raw)) return null;
  const before = raw as unknown as CloudCharacterSnapshot;
  const after: CloudCharacterSnapshot = { ...before };

  if (patch.zeniDelta) after.zeni = clampAdminInt((before.zeni ?? 0) + patch.zeniDelta, 0, ADMIN_LIMITS.zeni);
  if (patch.crystalDelta) after.crystals = clampAdminInt((before.crystals ?? 0) + patch.crystalDelta, 0, ADMIN_LIMITS.crystals);
  // Esferas não são restauráveis/editáveis pelo snapshot: a fonte de verdade
  // é DragonBallPossession no mundo global.
  if (patch.xpGain && patch.xpGain > 0) after.xp = clampAdminInt((before.xp ?? 0) + Math.floor(patch.xpGain), 0, ADMIN_LIMITS.xp);
  if (patch.strength !== undefined) after.strength = clampAdminInt(patch.strength, 0, ADMIN_LIMITS.stat);
  if (patch.defense !== undefined) after.defense = clampAdminInt(patch.defense, 0, ADMIN_LIMITS.stat);
  if (patch.speed !== undefined) after.speed = clampAdminInt(patch.speed, 0, ADMIN_LIMITS.stat);
  if (patch.ki !== undefined) after.ki = clampAdminInt(patch.ki, 0, ADMIN_LIMITS.stat);
  if (patch.level !== undefined) after.level = clampAdminInt(patch.level, 1, ADMIN_LIMITS.level);
  if (patch.xp !== undefined) after.xp = clampAdminInt(patch.xp, 0, ADMIN_LIMITS.xp);
  if (patch.restoreEnergy) after.energy = MAX_ACTION_ENERGY;
  if (patch.restoreHealth) {
    after.hp = Math.max(1, 80 + Math.max(1, after.level ?? 1) * 15 + Math.max(0, after.defense ?? 0) * 5);
  }
  if (patch.accelerateActivity || patch.finishMission) {
    const doneAt = new Date(Date.now() - 1000).toISOString();
    if (after.missionId && after.missionEndsAt) after.missionEndsAt = doneAt;
    if (after.craftJob) after.craftJob = { ...after.craftJob, endsAt: doneAt };
    // Batalhas/Busca vivem na tabela Activity e portanto só podem ser
    // aceleradas quando o personagem está carregado no servidor local.
  }

  if (patch.materialId) {
    const material = getProfessionMaterial(patch.materialId) ?? getCraftStackItem(patch.materialId);
    if (material) {
      const quantity = clampAdminInt(patch.materialQuantity ?? 1, 1, 999);
      const materials = [...(after.materials ?? [])];
      const idx = materials.findIndex((entry) => entry.itemId === patch.materialId);
      if (idx >= 0) {
        materials[idx] = {
          itemId: patch.materialId,
          quantity: Math.min(1_000_000, materials[idx].quantity + quantity),
        };
      } else {
        materials.push({ itemId: patch.materialId, quantity });
      }
      after.materials = materials.slice(0, 200);
    }
  }

  if (patch.craftedItemId) {
    const crafted = getCraftedItem(patch.craftedItemId);
    if (crafted) {
      const quantity = clampAdminInt(patch.craftedItemQuantity ?? 1, 1, 999);
      const items = { ...(after.items ?? { weapon: null, armor: null, accessory: null, owned: [], consumables: {} }) };
      items.consumables = { ...(items.consumables ?? {}) };
      items.owned = [...(items.owned ?? [])];
      if (crafted.category === 'consumable') {
        items.consumables[crafted.id] = Math.min(999, (items.consumables[crafted.id] ?? 0) + quantity);
      } else if (!items.owned.includes(crafted.id) && items.owned.length < 200) {
        items.owned.push(crafted.id);
      }
      after.items = items;
    }
  }

  // dar item/cosmético/transformação direto no estado
  if (patch.itemId) {
    const item = getItem(patch.itemId);
    if (item) {
      const items = { ...(after.items ?? { weapon: null, armor: null, accessory: null, owned: [], consumables: {} }) };
      if (item.category === 'consumable') {
        items.consumables = { ...(items.consumables ?? {}) };
        items.consumables[item.id] = Math.min(999, (items.consumables[item.id] ?? 0) + 1);
      } else if (!items.owned?.includes(item.id)) {
        items.owned = [...(items.owned ?? []), item.id].slice(0, 200);
      }
      after.items = items;
    }
  }
  if (patch.cosmeticId && getCosmetic(patch.cosmeticId)) {
    const owned = [...(after.cosmeticsOwned ?? [])];
    if (!owned.includes(patch.cosmeticId) && owned.length < 100) {
      owned.push(patch.cosmeticId);
      after.cosmeticsOwned = owned;
    }
  }
  if (patch.transformationId) {
    const tr = getTransformation(patch.transformationId);
    if (tr && (tr.race === 'any' || tr.race === after.race)) {
      const owned = [...(after.transformationsOwned ?? [])];
      if (!owned.includes(tr.id) && owned.length < 30) {
        owned.push(tr.id);
        after.transformationsOwned = owned;
      }
    }
  }
  return after;
}

/**
 * v0.9.11 — Reset de progresso DIRETO no estado da nuvem: escreve o
 * ESTADO INICIAL de um personagem novo (characterInitial.ts — mesma
 * fonte da criação) preservando APENAS a identidade (id, nome, raça,
 * sexo). O personagem NÃO é removido (regra do dono: nunca apagar
 * personagens), mas TODO o resto zera — cosméticos, avatar, diamantes,
 * itens, conquistas, quests e relógios. Pura: sem banco.
 */
export function patchCloudResetCharacterState(raw: unknown): CloudCharacterSnapshot | null {
  if (!isRecord(raw)) return null;
  const before = raw as unknown as CloudCharacterSnapshot;
  return initialCloudCharacterState({
    id: before.id,
    name: before.name,
    race: before.race,
  });
}
