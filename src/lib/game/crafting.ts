import type { Player, Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { spendCurrency } from '@/lib/economy';
import { trackEvent } from '@/lib/analytics';
import { getProfession, getProfessionMaterial } from './content/world';
import type { CraftRecipeDef } from './types';
import {
  getCraftedItem,
  getCraftRecipe,
  getCraftStackItem,
} from './content/crafting';
import {
  academicCraftTimeMultiplier,
  professionLevel,
  parseProfessions,
} from './professionCareer';
import {
  applyEquipmentBuy,
  itemCount,
  parseItems,
  updateJsonState,
} from './engine';

type Tx = Prisma.TransactionClient;

const MAX_STACK = 999;
export const MAX_CRAFT_BATCH = 20;

export function craftAcademicLevel(player: Pick<Player, 'professions'>): number {
  const professions = parseProfessions(player.professions);
  const academic = professions.academico;
  if (!academic || academic.lifetimeHours <= 0) return 0;
  return professionLevel(academic);
}

export function craftDurationMs(baseDurationMin: number, academicLevel: number): number {
  const mult = academicCraftTimeMultiplier(academicLevel);
  return Math.max(60_000, Math.ceil(baseDurationMin * 60_000 * mult));
}

export interface MissingCraftProfessionRequirement {
  professionId: string;
  requiredLevel: number;
  currentLevel: number;
}

export function missingCraftProfessionRequirements(
  player: Pick<Player, 'professions'>,
  recipe: CraftRecipeDef
): MissingCraftProfessionRequirement[] {
  const professions = parseProfessions(player.professions);
  return (recipe.professionRequirements ?? []).flatMap((requirement) => {
    const progress = professions[requirement.professionId];
    const currentLevel =
      progress && progress.lifetimeHours > 0
        ? professionLevel(progress)
        : 0;
    return currentLevel >= requirement.level
      ? []
      : [{
          professionId: requirement.professionId,
          requiredLevel: requirement.level,
          currentLevel,
        }];
  });
}

function ingredientName(itemId: string): string {
  return getProfessionMaterial(itemId)?.name ?? getCraftStackItem(itemId)?.name ?? itemId;
}

async function grantStack(tx: Tx, playerId: string, itemId: string, quantity: number) {
  const current = await tx.inventoryStack.findUnique({
    where: { playerId_itemId: { playerId, itemId } },
    select: { quantity: true },
  });
  if ((current?.quantity ?? 0) + quantity > 1_000_000) {
    throw new ApiError('VALIDATION_ERROR', 'Limite de estoque deste material atingido.');
  }
  await tx.inventoryStack.upsert({
    where: { playerId_itemId: { playerId, itemId } },
    update: { quantity: { increment: quantity } },
    create: { playerId, itemId, quantity },
  });
}

async function assertPlayerItemCapacity(player: Player, itemId: string, quantity: number) {
  const item = getCraftedItem(itemId);
  if (!item) throw new ApiError('VALIDATION_ERROR', 'Saída de fabricação inválida.');
  const items = parseItems(player.items);
  if (item.category === 'consumable') {
    if ((items.consumables[item.id] ?? 0) + quantity > MAX_STACK) {
      throw new ApiError('VALIDATION_ERROR', `Você já atingiu o limite de ${MAX_STACK} unidades de ${item.name}.`);
    }
  } else if (itemCount(items, item.id) + quantity > MAX_STACK) {
    throw new ApiError('VALIDATION_ERROR', `Você já atingiu o limite de ${MAX_STACK} unidades de ${item.name}.`);
  }
}

async function grantPlayerItem(tx: Tx, player: Player, itemId: string, quantity: number) {
  const item = getCraftedItem(itemId);
  if (!item) throw new ApiError('VALIDATION_ERROR', 'Saída de fabricação inválida.');
  await assertPlayerItemCapacity(player, itemId, quantity);
  const items = parseItems(player.items);
  if (item.category === 'consumable') {
    items.consumables[item.id] = (items.consumables[item.id] ?? 0) + quantity;
  } else {
    applyEquipmentBuy(items, item.id, quantity);
  }
  await updateJsonState(tx, player, { items: JSON.stringify(items) });
}

export async function startCraft(tx: Tx, player: Player, recipeId: string, batchQuantity = 1): Promise<{ message: string }> {
  const recipe = getCraftRecipe(recipeId);
  if (!recipe) throw new ApiError('VALIDATION_ERROR', 'Receita de fabricação inválida.');
  if (!Number.isInteger(batchQuantity) || batchQuantity < 1 || batchQuantity > MAX_CRAFT_BATCH) {
    throw new ApiError('VALIDATION_ERROR', `Quantidade de fabricação deve ficar entre 1 e ${MAX_CRAFT_BATCH}.`);
  }

  const existing = await tx.craftJob.findUnique({ where: { playerId: player.id } });
  if (existing) {
    throw new ApiError('VALIDATION_ERROR', 'Sua Oficina já está fabricando um item. Colete-o antes de iniciar outro.');
  }

  const academicLevel = craftAcademicLevel(player);
  const missingRequirements = missingCraftProfessionRequirements(player, recipe);
  if (missingRequirements.length > 0) {
    const requirement = missingRequirements[0];
    const professionName = getProfession(requirement.professionId)?.name ?? requirement.professionId;
    const current = requirement.currentLevel > 0 ? `Nível ${requirement.currentLevel}` : 'sem experiência';
    throw new ApiError(
      'VALIDATION_ERROR',
      `Requisito profissional não atendido: ${professionName} Nível ${requirement.requiredLevel} (atual: ${current}).`
    );
  }
  // Guarda de compatibilidade para futuras receitas acadêmicas que ainda não
  // declarem professionRequirements explicitamente.
  if (recipe.requiresAcademic && academicLevel <= 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Este projeto precisa de experiência como Acadêmico.'
    );
  }

  const ingredientIds = recipe.ingredients.map((i) => i.itemId);
  const rows = await tx.inventoryStack.findMany({
    where: { playerId: player.id, itemId: { in: ingredientIds } },
    select: { itemId: true, quantity: true },
  });
  const have = new Map(rows.map((row) => [row.itemId, row.quantity]));

  for (const ingredient of recipe.ingredients) {
    const requiredQuantity = ingredient.quantity * batchQuantity;
    const qty = have.get(ingredient.itemId) ?? 0;
    if (qty < requiredQuantity) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `Faltam ${requiredQuantity - qty}× ${ingredientName(ingredient.itemId)} para fabricar ${batchQuantity}× ${recipe.name}.`
      );
    }
  }

  const totalCostZeni = recipe.costZeni * batchQuantity;
  await spendCurrency(tx, player.id, 'zeni', totalCostZeni, {
    type: 'spend',
    source: 'craft',
    accountId: player.accountId,
    metadata: { recipeId: recipe.id, tier: recipe.tier, batchQuantity },
  });

  for (const ingredient of recipe.ingredients) {
    const res = await tx.inventoryStack.updateMany({
      where: {
        playerId: player.id,
        itemId: ingredient.itemId,
        quantity: { gte: ingredient.quantity * batchQuantity },
      },
      data: { quantity: { decrement: ingredient.quantity * batchQuantity } },
    });
    if (res.count !== 1) {
      throw new ApiError('VALIDATION_ERROR', 'Seu estoque mudou durante a fabricação. Tente novamente.');
    }
  }
  await tx.inventoryStack.deleteMany({ where: { playerId: player.id, quantity: { lte: 0 } } });

  const startedAt = new Date();
  const durationMs = craftDurationMs(recipe.baseDurationMin * batchQuantity, academicLevel);
  const endsAt = new Date(startedAt.getTime() + durationMs);
  await tx.craftJob.create({
    data: {
      playerId: player.id,
      recipeId: recipe.id,
      outputItemId: recipe.outputItemId,
      outputQuantity: recipe.outputQuantity * batchQuantity,
      outputKind: recipe.outputKind,
      academicLevelStart: academicLevel,
      startedAt,
      endsAt,
    },
  });

  await trackEvent('craft_start', {
    playerId: player.id,
    accountId: player.accountId,
    metadata: {
      recipeId: recipe.id,
      tier: recipe.tier,
      academicLevel,
      durationMs,
      batchQuantity,
    },
  }, tx);

  const reduction = academicLevel > 0 ? academicLevel : 0;
  return {
    message:
      `🔧 Fabricação iniciada: ${batchQuantity}× ${recipe.name}. ` +
      `Tempo: ${Math.ceil(durationMs / 60_000)} min` +
      (reduction > 0 ? ` (Acadêmico -${reduction}%).` : '.'),
  };
}

export async function claimCraft(tx: Tx, player: Player): Promise<{ message: string }> {
  const job = await tx.craftJob.findUnique({ where: { playerId: player.id } });
  if (!job) throw new ApiError('VALIDATION_ERROR', 'Sua Oficina não tem fabricação aguardando coleta.');
  if (job.endsAt.getTime() > Date.now()) {
    const min = Math.max(1, Math.ceil((job.endsAt.getTime() - Date.now()) / 60_000));
    throw new ApiError('VALIDATION_ERROR', `A fabricação ainda não terminou. Faltam cerca de ${min} min.`);
  }

  const recipe = getCraftRecipe(job.recipeId);
  if (!recipe || recipe.outputItemId !== job.outputItemId || recipe.outputKind !== job.outputKind) {
    throw new ApiError('VALIDATION_ERROR', 'Receita da fabricação não existe mais. Contate a administração.');
  }

  if (job.outputKind === 'player_item') {
    await assertPlayerItemCapacity(player, job.outputItemId, job.outputQuantity);
  }

  const claim = await tx.craftJob.deleteMany({ where: { id: job.id, playerId: player.id } });
  if (claim.count !== 1) {
    throw new ApiError('VALIDATION_ERROR', 'Esta fabricação já foi coletada.');
  }

  if (job.outputKind === 'stack') {
    await grantStack(tx, player.id, job.outputItemId, job.outputQuantity);
  } else {
    await grantPlayerItem(tx, player, job.outputItemId, job.outputQuantity);
  }

  const outputName =
    getCraftedItem(job.outputItemId)?.name ??
    getCraftStackItem(job.outputItemId)?.name ??
    job.outputItemId;

  await trackEvent('craft_claim', {
    playerId: player.id,
    accountId: player.accountId,
    metadata: { recipeId: job.recipeId, outputItemId: job.outputItemId, quantity: job.outputQuantity },
  }, tx);

  return {
    message: `✅ Fabricação concluída: +${job.outputQuantity}× ${outputName}.`,
  };
}
