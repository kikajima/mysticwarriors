import type { Player, Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { addCurrency, spendCurrency } from '@/lib/economy';
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

interface CraftInputSnapshot {
  itemId: string;
  quantity: number;
}

function recipeInputsForBatch(recipe: CraftRecipeDef, batch: number): CraftInputSnapshot[] {
  return recipe.ingredients.map((ingredient) => ({
    itemId: ingredient.itemId,
    quantity: ingredient.quantity * batch,
  }));
}

function parseRefundInputsSnapshot(raw: string): CraftInputSnapshot[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 50) return null;
    const normalized: CraftInputSnapshot[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const itemId = String((entry as Record<string, unknown>).itemId ?? '');
      const quantity = Math.trunc(Number((entry as Record<string, unknown>).quantity));
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
        return null;
      }
      normalized.push({ itemId, quantity });
    }
    return normalized;
  } catch {
    return null;
  }
}

async function assertStackCapacity(tx: Tx, playerId: string, itemId: string, quantity: number) {
  const current = await tx.inventoryStack.findUnique({
    where: { playerId_itemId: { playerId, itemId } },
    select: { quantity: true },
  });
  if ((current?.quantity ?? 0) + quantity > 1_000_000) {
    throw new ApiError('VALIDATION_ERROR', 'Limite de estoque deste material atingido.');
  }
}

async function grantStack(tx: Tx, playerId: string, itemId: string, quantity: number) {
  await assertStackCapacity(tx, playerId, itemId, quantity);
  await tx.inventoryStack.upsert({
    where: { playerId_itemId: { playerId, itemId } },
    update: { quantity: { increment: quantity } },
    create: { playerId, itemId, quantity },
  });
}

function assertCraftStartOutputEligibility(player: Player, itemId: string, quantity: number) {
  const item = getCraftedItem(itemId);
  if (!item) throw new ApiError('VALIDATION_ERROR', 'Saída de fabricação inválida.');
  if (item.category === 'consumable') return;
  const items = parseItems(player.items);
  if (quantity > 1 || itemCount(items, item.id) > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `${item.name} é um item permanente/único. Você já possui uma unidade ou tentou fabricar duplicatas.`
    );
  }
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

export async function startCraft(tx: Tx, player: Player, recipeId: string, quantity = 1): Promise<{ message: string }> {
  const recipe = getCraftRecipe(recipeId);
  if (!recipe) throw new ApiError('VALIDATION_ERROR', 'Receita de fabricação inválida.');
  if (recipe.minPlayerLevel && player.level < recipe.minPlayerLevel) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Nível ${recipe.minPlayerLevel} necessário para fabricar ${recipe.name} (você está no nível ${player.level}).`
    );
  }
  const batch = Math.trunc(Number(quantity));
  const maxBatch = Math.max(1, recipe.maxBatch ?? 1);
  if (!Number.isFinite(batch) || batch < 1 || batch > maxBatch) {
    throw new ApiError(
      'VALIDATION_ERROR',
      maxBatch > 1
        ? `Esta receita aceita lotes de 1 a ${maxBatch} unidades.`
        : 'Esta receita só pode ser fabricada uma unidade por vez.'
    );
  }
  const outputQuantity = recipe.outputQuantity * batch;

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
    const needed = ingredient.quantity * batch;
    const qty = have.get(ingredient.itemId) ?? 0;
    if (qty < needed) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `Faltam ${needed - qty}× ${ingredientName(ingredient.itemId)} para fabricar ${batch}× ${recipe.name}.`
      );
    }
  }

  if (recipe.outputKind === 'player_item') {
    assertCraftStartOutputEligibility(player, recipe.outputItemId, outputQuantity);
    await assertPlayerItemCapacity(player, recipe.outputItemId, outputQuantity);
  } else {
    await assertStackCapacity(tx, player.id, recipe.outputItemId, outputQuantity);
  }

  const totalCost = recipe.costZeni * batch;
  const inputIngredients = recipeInputsForBatch(recipe, batch);
  await spendCurrency(tx, player.id, 'zeni', totalCost, {
    type: 'spend',
    source: 'craft',
    accountId: player.accountId,
    metadata: { recipeId: recipe.id, tier: recipe.tier, batch, unitCost: recipe.costZeni, totalCost },
  });

  for (const ingredient of inputIngredients) {
    const res = await tx.inventoryStack.updateMany({
      where: {
        playerId: player.id,
        itemId: ingredient.itemId,
        quantity: { gte: ingredient.quantity },
      },
      data: { quantity: { decrement: ingredient.quantity } },
    });
    if (res.count !== 1) {
      throw new ApiError('VALIDATION_ERROR', 'Seu estoque mudou durante a fabricação. Tente novamente.');
    }
  }
  await tx.inventoryStack.deleteMany({ where: { playerId: player.id, quantity: { lte: 0 } } });

  const startedAt = new Date();
  const durationMs = craftDurationMs(recipe.baseDurationMin * batch, academicLevel);
  const endsAt = new Date(startedAt.getTime() + durationMs);
  await tx.craftJob.create({
    data: {
      playerId: player.id,
      recipeId: recipe.id,
      outputItemId: recipe.outputItemId,
      outputQuantity,
      outputKind: recipe.outputKind,
      academicLevelStart: academicLevel,
      inputZeni: totalCost,
      inputIngredients: JSON.stringify(inputIngredients),
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
      batch,
      outputQuantity,
      durationMs,
    },
  }, tx);

  const reduction = academicLevel > 0 ? academicLevel : 0;
  return {
    message:
      `🔧 Fabricação iniciada: ${batch}× ${recipe.name}. ` +
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
  if (recipe && (recipe.outputItemId !== job.outputItemId || recipe.outputKind !== job.outputKind)) {
    throw new ApiError('VALIDATION_ERROR', 'A saída desta fabricação mudou no catálogo. Contate a administração.');
  }
  const outputExists =
    job.outputKind === 'player_item'
      ? !!getCraftedItem(job.outputItemId)
      : job.outputKind === 'stack'
        ? !!getCraftStackItem(job.outputItemId)
        : false;
  if (!outputExists || job.outputQuantity < 1 || job.outputQuantity > 1_000_000) {
    throw new ApiError('VALIDATION_ERROR', 'Saída da fabricação inválida. Contate a administração.');
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


export async function cancelCraft(tx: Tx, player: Player): Promise<{ message: string }> {
  const job = await tx.craftJob.findUnique({ where: { playerId: player.id } });
  if (!job) throw new ApiError('VALIDATION_ERROR', 'Sua Oficina não tem fabricação para cancelar.');
  if (job.endsAt.getTime() <= Date.now()) {
    throw new ApiError('VALIDATION_ERROR', 'A fabricação já terminou. Colete o item em vez de cancelar.');
  }

  const recipe = getCraftRecipe(job.recipeId);
  const storedInputs = parseRefundInputsSnapshot(job.inputIngredients);
  let batch = 1;
  if (recipe && recipe.outputQuantity > 0) {
    batch = Math.max(1, Math.trunc(job.outputQuantity / recipe.outputQuantity));
  }

  const refundIngredients =
    storedInputs ??
    (recipe ? recipeInputsForBatch(recipe, batch) : null);
  const refundZeni =
    job.inputZeni > 0
      ? job.inputZeni
      : recipe
        ? recipe.costZeni * batch
        : 0;

  if (!refundIngredients || refundIngredients.length === 0 || (refundZeni <= 0 && !recipe)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Não foi possível reconstruir os insumos desta fabricação legada. Contate a administração.'
    );
  }

  for (const ingredient of refundIngredients) {
    await assertStackCapacity(tx, player.id, ingredient.itemId, ingredient.quantity);
  }

  const deleted = await tx.craftJob.deleteMany({ where: { id: job.id, playerId: player.id } });
  if (deleted.count !== 1) {
    throw new ApiError('VALIDATION_ERROR', 'Esta fabricação já foi alterada. Recarregue a Oficina.');
  }

  for (const ingredient of refundIngredients) {
    await grantStack(tx, player.id, ingredient.itemId, ingredient.quantity);
  }
  if (refundZeni > 0) {
    await addCurrency(tx, player.id, 'zeni', refundZeni, {
      type: 'refund',
      source: 'craft_cancel',
      accountId: player.accountId,
      metadata: { recipeId: job.recipeId, batch, refundZeni, refundIngredients },
    });
  }

  await trackEvent('craft_cancel', {
    playerId: player.id,
    accountId: player.accountId,
    metadata: { recipeId: job.recipeId, batch, refundZeni, refundIngredients },
  }, tx);

  return {
    message: `↩️ Fabricação cancelada: materiais e ${refundZeni.toLocaleString('pt-BR')} Zeni devolvidos.`,
  };
}
