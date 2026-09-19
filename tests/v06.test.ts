/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import {
  PROFESSIONS,
  PROFESSION_LEVELS,
  PROFESSION_MAX_LEVEL,
  PROFESSION_MASTERY_HOURS,
  PROFESSION_SHIFTS,
  PROFESSION_MATERIALS,
  getProfession,
  REGEN,
  BATTLE_ENERGY_COST,
  xpToNextLevel,
} from '@/lib/game/content/world';
import {
  academicXpMultiplier,
  legacyProfessionHours,
  parseProfessions,
  professionLevelForHours,
  professionShiftRewards,
  professionXpPerHour,
  rollProfessionLoot,
  serializeProfessions,
} from '@/lib/game/professionCareer';
import { BALANCE_VERSION } from '@/lib/game/rules';
import { COSMETICS, getCosmetic, equippedCosmetic, COSMETIC_SLOTS } from '@/lib/game/content/cosmetics';

// =====================================================================
// TESTES v0.6 — profissões, energia 5min/ponto, batalhas gastam energia,
// cosméticos de aura (ex-grátis) e política de reset por balanceamento.
// =====================================================================

describe('PROFISSÕES — carreira 1–10', () => {
  test('as 5 profissões existem com especializações corretas', () => {
    const byId = Object.fromEntries(PROFESSIONS.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(['academico', 'agricultor', 'atleta', 'cientista', 'policial']);
    expect(byId.atleta.attribute).toBe('strength');
    expect(byId.cientista.attribute).toBe('ki');
    expect(byId.agricultor.attribute).toBe('speed');
    expect(byId.policial.attribute).toBe('defense');
    expect(byId.academico.attribute).toBeNull();
    expect(getProfession('academico')?.name).toBe('Acadêmico');
  });

  test('10 níveis fecham exatamente em 4.450 horas', () => {
    expect(PROFESSION_MAX_LEVEL).toBe(10);
    expect(PROFESSION_LEVELS).toHaveLength(10);
    expect(PROFESSION_LEVELS.map((r) => r.hoursInLevel)).toEqual([40, 60, 90, 135, 200, 300, 450, 675, 1000, 1500]);
    expect(PROFESSION_LEVELS.at(-1)?.cumulativeHours).toBe(PROFESSION_MASTERY_HOURS);
    expect(PROFESSION_MASTERY_HOURS).toBe(4450);
  });

  test('limiares de nível são derivados das horas sem off-by-one', () => {
    expect(professionLevelForHours(0)).toBe(1);
    expect(professionLevelForHours(39)).toBe(1);
    expect(professionLevelForHours(40)).toBe(2);
    expect(professionLevelForHours(99)).toBe(2);
    expect(professionLevelForHours(100)).toBe(3);
    expect(professionLevelForHours(2949)).toBe(9);
    expect(professionLevelForHours(2950)).toBe(10);
    expect(professionLevelForHours(4450)).toBe(10);
  });

  test('turnos aceitos e eficiência são 1/2/4/8h = 100/95/85/70%', () => {
    expect(PROFESSION_SHIFTS.map((s) => [s.hours, s.efficiency])).toEqual([
      [1, 1],
      [2, 0.95],
      [4, 0.85],
      [8, 0.70],
    ]);
  });

  test('XP/h aprovado: 1% → 3,5% do próximo nível', () => {
    expect(PROFESSION_LEVELS.map((r) => r.xpPctPerHour)).toEqual([
      0.01, 0.01, 0.015, 0.015, 0.02, 0.02, 0.025, 0.025, 0.03, 0.035,
    ]);
    expect(professionXpPerHour(1, 1)).toBe(Math.ceil(xpToNextLevel(1) * 0.01));
    expect(professionXpPerHour(10, 20)).toBe(Math.ceil(xpToNextLevel(20) * 0.035));
  });

  test('chance rara aprovada: 10/13/16/20/22/25%', () => {
    expect(PROFESSION_LEVELS.map((r) => r.rareChance)).toEqual([
      0.10, 0.10, 0.13, 0.13, 0.16, 0.16, 0.20, 0.20, 0.22, 0.25,
    ]);
  });

  test('turno que cruza nível calcula hora por hora', () => {
    const r = professionShiftRewards(38, 4, 20);
    expect(r.hourLevels).toEqual([1, 1, 2, 2]);
    expect(r.careerHoursAdded).toBe(4);
    expect(r.lifetimeHoursAdded).toBe(4);
  });

  test('migração legada preserva horas sem conceder atributos retroativos', () => {
    expect(legacyProfessionHours(1, 2)).toBe(2);
    expect(legacyProfessionHours(2, 1)).toBe(4);
    expect(legacyProfessionHours(4, 2)).toBe(14);
    const migrated = parseProfessions('{"atleta":{"rank":4,"completions":2}}').atleta;
    expect(migrated).toEqual({
      hours: 14,
      lifetimeHours: 14,
      prestige: 0,
      statMilliRemainder: 0,
      cycleStatGranted: 0,
    });
    expect(parseProfessions(serializeProfessions({ atleta: migrated })).atleta).toEqual(migrated);
  });

  test('Acadêmico só ativa após trabalhar e escala +0,5% por nível', () => {
    expect(academicXpMultiplier({})).toBe(1);
    expect(academicXpMultiplier({
      academico: { hours: 0, lifetimeHours: 0, prestige: 0, statMilliRemainder: 0, cycleStatGranted: 0 },
    })).toBe(1);
    expect(academicXpMultiplier({
      academico: { hours: 1, lifetimeHours: 1, prestige: 0, statMilliRemainder: 0, cycleStatGranted: 0 },
    })).toBeCloseTo(1.005);
    expect(academicXpMultiplier({
      academico: { hours: 2950, lifetimeHours: 2950, prestige: 0, statMilliRemainder: 0, cycleStatGranted: 0 },
    })).toBeCloseTo(1.05);
  });

  test('catálogo tem 4 materiais por profissão, ids únicos', () => {
    expect(new Set(PROFESSION_MATERIALS.map((m) => m.id)).size).toBe(PROFESSION_MATERIALS.length);
    for (const p of PROFESSIONS) {
      const drops = PROFESSION_MATERIALS.filter((m) => m.professionId === p.id);
      expect(drops).toHaveLength(4);
      expect(drops.filter((m) => m.rarity === 'common')).toHaveLength(2);
      expect(drops.filter((m) => m.rarity === 'rare')).toHaveLength(2);
    }
  });

  test('loot comum é garantido 1–2 por hora', () => {
    // RNG determinístico alto evita raro no nível 1 e escolhe qty 2.
    const loot = rollProfessionLoot('cientista', [1, 1, 1, 1], 1, () => 0.99);
    const commonIds = new Set(PROFESSION_MATERIALS.filter((m) => m.professionId === 'cientista' && m.rarity === 'common').map((m) => m.id));
    const commonQty = loot.filter((x) => commonIds.has(x.itemId)).reduce((s, x) => s + x.quantity, 0);
    expect(commonQty).toBe(8);
  });
});

describe('ENERGIA v0.6 — 5 minutos por ponto e batalhas gastam energia', () => {
  test('regeneração base: 300s por ponto de energia (12/hora)', () => {
    expect(REGEN.energySeconds).toBe(300);
  });

  test('batalha PvE/PvP custa 3 de energia (constante única para UI e servidor)', () => {
    expect(BATTLE_ENERGY_COST).toBe(3);
  });

  test('orçamento diário coerente: 288 pontos/dia de regen sustenta o jogo', () => {
    const daily = Math.floor((24 * 3600) / REGEN.energySeconds);
    expect(daily).toBe(288);
    // Profissões não gastam energia: 20 batalhas + 15 treinos = 60+45.
    const gasto = 20 * BATTLE_ENERGY_COST + 15 * 3;
    expect(gasto).toBeLessThan(daily);
  });
});

describe('COSMÉTICOS v0.6 — auras que eram grátis agora são itens da loja', () => {
  test('slot novo "card" existe e é validado no parse', () => {
    expect(COSMETIC_SLOTS.has('card')).toBe(true);
  });

  test('Aura de Ki Pulsante: aura de slot com avatarPulseCss (o antigo brilho grátis)', () => {
    const c = getCosmetic('aura_ki_pulsante');
    expect(c).toBeTruthy();
    expect(c?.slot).toBe('aura');
    expect(c?.price).toBeGreaterThan(0); // comprada com diamantes
    expect(c?.avatarPulseCss).toContain('animate-pulse');
  });

  test('Aura Ancestral do Card: slot "card" com cardGlowCss', () => {
    const c = getCosmetic('card_aura_ancestral');
    expect(c).toBeTruthy();
    expect(c?.slot).toBe('card');
    expect(c?.price).toBeGreaterThan(0);
    expect(c?.cardGlowCss).toBeTruthy();
  });

  test('todo cosmético continua com efeito visual definido (nenhum "vazio")', () => {
    for (const c of COSMETICS) {
      const hasEffect =
        (c.slot === 'aura' && !!(c.avatarGlowCss ?? c.avatarPulseCss)) ||
        (c.slot === 'title' && !!c.titleText) ||
        (c.slot === 'frame' && !!c.avatarFrameCss) ||
        (c.slot === 'background' && !!c.profileBgCss) ||
        (c.slot === 'effect' && !!c.screenEffect) ||
        (c.slot === 'avatar' && !!c.avatarOverlayCss) ||
        ((c.slot === 'pose' || c.slot === 'outfit') && !!c.profileBadge) ||
        (c.slot === 'card' && !!c.cardGlowCss);
      expect(hasEffect, `${c.id} (${c.slot}) precisa de efeito visual`).toBe(true);
    }
  });

  test('equipar a nova aura funciona via equippedCosmetic', () => {
    const eq = { aura: 'aura_ki_pulsante', card: 'card_aura_ancestral' };
    expect(equippedCosmetic(eq, 'aura')?.id).toBe('aura_ki_pulsante');
    expect(equippedCosmetic(eq, 'card')?.id).toBe('card_aura_ancestral');
  });
});

describe('POLÍTICA DE ATUALIZAÇÕES v0.6 — reset de personagens, contas intactas', () => {
  test('BALANCE_VERSION subiu para 6 (economia de energia nova → reset ao atualizar)', () => {
    expect(BALANCE_VERSION).toBe(6);
  });
});
