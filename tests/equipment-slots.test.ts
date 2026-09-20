import { describe, expect, test } from 'bun:test';
import type { Player } from '@prisma/client';
import { EQUIPMENT_SLOTS } from '../src/lib/game/types';
import { CRAFTED_ITEMS } from '../src/lib/game/content/crafting';
import { computeDerived, parseItems } from '../src/lib/game/engine';

function combatPlayer(items: string): Player {
  return {
    race: 'humano',
    level: 10,
    strength: 100,
    defense: 100,
    speed: 100,
    ki: 100,
    transformationId: null,
    items,
  } as Player;
}

describe('Equipamento completo — sete slots reais', () => {
  test('contrato publica exatamente os sete slots de combate', () => {
    expect(EQUIPMENT_SLOTS).toEqual([
      'head',
      'wrists',
      'armor',
      'accessory',
      'weapon',
      'legs',
      'boots',
    ]);
  });

  test('novos slots entram nos atributos derivados de combate', () => {
    const base = computeDerived(combatPlayer(JSON.stringify({
      weapon: null,
      armor: null,
      accessory: null,
      head: null,
      wrists: null,
      legs: null,
      boots: null,
      owned: [],
      consumables: {},
      stacks: {},
    })));

    const equipped = computeDerived(combatPlayer(JSON.stringify({
      weapon: null,
      armor: null,
      accessory: null,
      head: 'bandana_oficina',              // +2 DEF, +2 KI
      wrists: 'munhequeiras_reforcadas',    // +3 ATQ
      legs: 'calca_treino_reforcada',       // +3 DEF
      boots: 'botas_corrida_reforcadas',    // +3 VEL
      owned: [
        'bandana_oficina',
        'munhequeiras_reforcadas',
        'calca_treino_reforcada',
        'botas_corrida_reforcadas',
      ],
      consumables: {},
      stacks: {},
    })));

    expect(equipped.atkPower - base.atkPower).toBe(3);
    expect(equipped.kiPower - base.kiPower).toBe(2);
    expect(equipped.defPower - base.defPower).toBe(5);
    expect(equipped.power).toBeGreaterThan(base.power);
  });

  test('cada um dos sete slots possui cinco equipamentos craftáveis, um por Tier', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const items = CRAFTED_ITEMS.filter((item) => item.category === slot);
      expect(items).toHaveLength(5);
      expect(new Set(items.map((item) => item.id)).size).toBe(5);
    }
  });

  test('parser não permite equipar item em slot de categoria incompatível', () => {
    const items = parseItems(JSON.stringify({
      head: 'energia_infinita',
      boots: 'bandana_oficina',
      owned: ['energia_infinita', 'bandana_oficina'],
      consumables: {},
    }));
    expect(items.head).toBeNull();
    expect(items.boots).toBeNull();
  });
});
