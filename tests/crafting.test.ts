import { describe, expect, test } from 'bun:test';
import {
  CRAFT_RECIPES,
  CRAFT_STACK_ITEMS,
  CRAFTED_ITEMS,
  CRAFT_TIER_PROFESSION_LEVEL,
  getCraftRecipe,
} from '../src/lib/game/content/crafting';
import {
  academicCraftTimeMultiplier,
} from '../src/lib/game/professionCareer';
import { craftDurationMs, missingCraftProfessionRequirements } from '../src/lib/game/crafting';
import { PROFESSION_MATERIALS, equippedDragonBallChanceBonus } from '../src/lib/game/content/world';

describe('Oficina — contratos de crafting', () => {
  test('receitas principais Tier 1–5 existem com os custos/durações aprovados', () => {
    const ids = ['capsula_recuperacao_simples', 'radar_dragao_basico', 'armadura_combate_saiyajin', 'senzu_processado', 'sala_gravidade_pessoal_100x'];
    expect(ids.every((id) => CRAFT_RECIPES.some((r) => r.id === id))).toBe(true);
    expect(CRAFT_RECIPES.find((r) => r.id === 'capsula_recuperacao_simples')).toMatchObject({ costZeni: 150, baseDurationMin: 10, tier: 1 });
    expect(CRAFT_RECIPES.find((r) => r.id === 'radar_dragao_basico')).toMatchObject({ costZeni: 500, baseDurationMin: 30, tier: 2 });
    expect(CRAFT_RECIPES.find((r) => r.id === 'armadura_combate_saiyajin')).toMatchObject({ costZeni: 2500, baseDurationMin: 120, tier: 3 });
    expect(CRAFT_RECIPES.find((r) => r.id === 'senzu_processado')).toMatchObject({ costZeni: 5000, baseDurationMin: 240, tier: 4 });
    expect(CRAFT_RECIPES.find((r) => r.id === 'sala_gravidade_pessoal_100x')).toMatchObject({ costZeni: 20000, baseDurationMin: 720, tier: 5 });
  });

  test('Tiers 2–5 exigem progressão profissional crescente', () => {
    expect(CRAFT_TIER_PROFESSION_LEVEL).toEqual({
      1: 0,
      2: 2,
      3: 4,
      4: 6,
      5: 8,
    });

    for (const recipe of CRAFT_RECIPES) {
      for (const requirement of recipe.professionRequirements ?? []) {
        expect(requirement.level).toBe(CRAFT_TIER_PROFESSION_LEVEL[recipe.tier]);
      }
    }

    const blueprintRequirements = CRAFT_RECIPES
      .filter((recipe) => recipe.requiresAcademic)
      .map((recipe) => [recipe.tier, recipe.professionRequirements]);
    expect(blueprintRequirements).toEqual([
      [2, [{ professionId: 'academico', level: 2 }]],
      [3, [{ professionId: 'academico', level: 4 }]],
      [4, [{ professionId: 'academico', level: 6 }]],
      [4, [{ professionId: 'academico', level: 6 }]],
      [5, [{ professionId: 'academico', level: 8 }]],
    ]);

    expect(getCraftRecipe('radar_dragao_basico')?.professionRequirements).toEqual([
      { professionId: 'cientista', level: 2 },
    ]);
    expect(getCraftRecipe('armadura_combate_saiyajin')?.professionRequirements).toEqual([
      { professionId: 'policial', level: 4 },
      { professionId: 'cientista', level: 4 },
    ]);
    expect(getCraftRecipe('senzu_processado')?.professionRequirements).toEqual([
      { professionId: 'agricultor', level: 6 },
      { professionId: 'atleta', level: 6 },
    ]);
    expect(getCraftRecipe('sala_gravidade_pessoal_100x')?.professionRequirements).toEqual([
      { professionId: 'cientista', level: 8 },
      { professionId: 'atleta', level: 8 },
    ]);
  });

  test('servidor detecta requisito profissional ausente antes do craft', () => {
    const radar = getCraftRecipe('radar_dragao_basico');
    expect(radar).toBeTruthy();
    if (!radar) return;

    expect(missingCraftProfessionRequirements({ professions: '{}' }, radar)).toEqual([
      { professionId: 'cientista', requiredLevel: 2, currentLevel: 0 },
    ]);

    const professions = JSON.stringify({
      cientista: {
        hours: 40,
        lifetimeHours: 40,
        prestige: 0,
        statMilliRemainder: 0,
        cycleStatGranted: 40,
      },
    });
    expect(missingCraftProfessionRequirements({ professions }, radar)).toEqual([]);
  });

  test('todos os sete slots têm progressão craftável Tier 1–5', () => {
    const slots = ['head', 'wrists', 'armor', 'accessory', 'weapon', 'legs', 'boots'] as const;
    for (const slot of slots) {
      const items = CRAFTED_ITEMS.filter((item) => item.category === slot);
      expect(items).toHaveLength(5);
      const outputs = new Set(items.map((item) => item.id));
      const tiers = CRAFT_RECIPES
        .filter((recipe) => outputs.has(recipe.outputItemId))
        .map((recipe) => recipe.tier)
        .sort();
      expect(tiers).toEqual([1, 2, 3, 4, 5]);
    }
  });

  test('lotes existem só onde foram habilitados e têm limites seguros', () => {
    expect(getCraftRecipe('capsula_recuperacao_simples')?.maxBatch).toBe(10);
    expect(getCraftRecipe('senzu_processado')?.maxBatch).toBe(5);
    for (const recipe of CRAFT_RECIPES.filter((r) => r.requiresAcademic)) {
      expect(recipe.maxBatch).toBe(5);
    }
    for (const recipe of CRAFT_RECIPES.filter((r) => ['head', 'wrists', 'armor', 'accessory', 'weapon', 'legs', 'boots'].includes(
      CRAFTED_ITEMS.find((item) => item.id === r.outputItemId)?.category ?? ''
    ))) {
      expect(recipe.maxBatch ?? 1).toBe(1);
    }
  });

  test('todo craft Tier 3+ usa insumos de pelo menos duas profissões', () => {
    const professionByItem = new Map(PROFESSION_MATERIALS.map((m) => [m.id, m.professionId]));
    const blueprintIds = new Set(CRAFT_STACK_ITEMS.map((b) => b.id));
    const recipeByOutput = new Map(CRAFT_RECIPES.map((r) => [r.outputItemId, r]));

    const professionsOf = (itemId: string, seen = new Set<string>()): Set<string> => {
      const direct = professionByItem.get(itemId);
      if (direct) return new Set([direct]);
      if (!blueprintIds.has(itemId) || seen.has(itemId)) return new Set();
      seen.add(itemId);
      const recipe = recipeByOutput.get(itemId);
      const out = new Set<string>();
      for (const ing of recipe?.ingredients ?? []) {
        for (const p of professionsOf(ing.itemId, seen)) out.add(p);
      }
      return out;
    };

    for (const recipe of CRAFT_RECIPES.filter((r) => r.tier >= 3)) {
      const professions = new Set<string>();
      for (const ingredient of recipe.ingredients) {
        for (const p of professionsOf(ingredient.itemId)) professions.add(p);
      }
      expect(professions.size).toBeGreaterThanOrEqual(2);
    }
  });

  test('itens principais Tier 3+ exigem blueprint acadêmico', () => {
    const blueprintIds = new Set(CRAFT_STACK_ITEMS.map((item) => item.id));
    for (const recipe of CRAFT_RECIPES.filter((r) => !r.requiresAcademic && r.tier >= 3)) {
      expect(recipe.ingredients.some((i) => blueprintIds.has(i.itemId))).toBe(true);
    }
  });

  test('Acadêmico reduz 1% por nível e nunca passa de 10%', () => {
    expect(academicCraftTimeMultiplier(0)).toBe(1);
    expect(academicCraftTimeMultiplier(1)).toBe(0.99);
    expect(academicCraftTimeMultiplier(10)).toBe(0.9);
    expect(academicCraftTimeMultiplier(99)).toBe(0.9);
    expect(craftDurationMs(120, 10)).toBe(108 * 60_000);
  });


  test('itens fabricados não podem ser comprados de graça na loja NPC', async () => {
    expect(CRAFTED_ITEMS.every((item) => item.price === 0)).toBe(true);
    const src = await Bun.file(`${import.meta.dir}/../src/lib/game/actions.ts`).text();
    const start = src.indexOf('async function actionBuy');
    const end = src.indexOf('async function actionSell', start);
    const body = src.slice(start, end);
    expect(body).toContain('item.price <= 0');
    expect(body).toContain('Itens fabricados só podem ser obtidos na Oficina');
  });
  test('Oficina mostra travas, filtros, lotes e cancelamento', async () => {
    const src = await Bun.file(`${import.meta.dir}/../src/components/game/WorkshopPanel.tsx`).text();
    expect(src).toContain('Requisitos profissionais');
    expect(src).toContain('professionRequirementsOk');
    expect(src).toContain('CRAFT_TIER_PROFESSION_LEVEL');
    expect(src).toContain('>Tier:</span>');
    expect(src).toContain('>Tipo:</span>');
    expect(src).toContain("['equipment', 'Equipamentos']");
    expect(src).toContain('Quantidade do lote');
    expect(src).toContain("type: 'craft_cancel'");
    expect(src).toContain('Cancelar e reembolsar');
  });

  test('servidor valida lote, coleta e cancelamento', async () => {
    const src = await Bun.file(`${import.meta.dir}/../src/lib/game/crafting.ts`).text();
    expect(src).toContain('recipe.maxBatch ?? 1');
    expect(src).toContain('const totalCost = recipe.costZeni * batch');
    expect(src).toContain('ingredient.quantity * batch');
    expect(src).toContain('export async function cancelCraft');
    expect(src).toContain("source: 'craft_cancel'");
    expect(src).toContain("type: 'refund'");
  });

  test('efeitos dos itens fabricados correspondem ao desenho', () => {
    const capsule = CRAFTED_ITEMS.find((i) => i.id === 'capsula_recuperacao_simples');
    const radar = CRAFTED_ITEMS.find((i) => i.id === 'radar_dragao_basico');
    const armor = CRAFTED_ITEMS.find((i) => i.id === 'armadura_combate_saiyajin_craft');
    const senzu = CRAFTED_ITEMS.find((i) => i.id === 'senzu_processado');
    const gravity = CRAFTED_ITEMS.find((i) => i.id === 'sala_gravidade_pessoal_100x');
    expect(capsule?.effect).toBe('heal_30pct');
    expect(radar?.dragonBallChanceBonus).toBe(0.02);
    expect(
      equippedDragonBallChanceBonus({
        weapon: null,
        armor: null,
        accessory: 'radar_dragao_basico',
        owned: ['radar_dragao_basico'],
        consumables: {},
        stacks: {},
      })
    ).toBe(0.02);
    expect(armor?.def).toBe(35);
    expect(senzu?.effect).toBe('full_hp');
    expect(gravity?.trainBonus?.all).toBe(3);
  });
});
