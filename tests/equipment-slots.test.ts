import { describe, expect, test } from 'bun:test';
import type { Player } from '@prisma/client';
import { EQUIPMENT_SLOTS, EQUIPPED_SLOTS } from '../src/lib/game/types';
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

describe('Equipamento completo — sete categorias e oito espaços equipáveis', () => {
  test('contrato mantém sete categorias e publica Acessório II como oitavo espaço', () => {
    expect(EQUIPMENT_SLOTS).toEqual([
      'head',
      'wrists',
      'armor',
      'accessory',
      'weapon',
      'legs',
      'boots',
    ]);
    expect(EQUIPPED_SLOTS).toEqual([
      'head',
      'wrists',
      'armor',
      'accessory',
      'accessory2',
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
      accessory2: null,
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
      accessory2: null,
      head: 'bandana_oficina',              // +4 DEF, +4 KI
      wrists: 'munhequeiras_reforcadas',    // +6 ATQ
      legs: 'calca_treino_reforcada',       // +6 DEF, +3 VEL
      boots: 'botas_corrida_reforcadas',    // +7 VEL
      owned: [
        'bandana_oficina',
        'munhequeiras_reforcadas',
        'calca_treino_reforcada',
        'botas_corrida_reforcadas',
      ],
      consumables: {},
      stacks: {},
    })));

    expect(equipped.atkPower - base.atkPower).toBe(6);
    expect(equipped.kiPower - base.kiPower).toBe(4);
    expect(equipped.defPower - base.defPower).toBe(10);
    expect(equipped.equipmentBonuses).toEqual({
      strength: 6,
      defense: 10,
      speed: 10,
      ki: 4,
    });
    expect(equipped.power).toBeGreaterThan(base.power);
  });

  test('Acessório I e II somam bônus; duplicar o mesmo exige duas unidades', () => {
    const twoDifferent = parseItems(JSON.stringify({
      accessory: 'foco_combate_tatico',
      accessory2: 'pingente_foco_ki',
      owned: ['foco_combate_tatico', 'pingente_foco_ki'],
      consumables: {},
      stacks: {},
    }));
    expect(twoDifferent.accessory).toBe('foco_combate_tatico');
    expect(twoDifferent.accessory2).toBe('pingente_foco_ki');

    const derived = computeDerived(combatPlayer(JSON.stringify(twoDifferent)));
    expect(derived.equipmentBonuses).toEqual({
      strength: 0,
      defense: 8,
      speed: 8,
      ki: 6,
    });

    const oneCopy = parseItems(JSON.stringify({
      accessory: 'radar_esferas',
      accessory2: 'radar_esferas',
      owned: ['radar_esferas'],
      consumables: {},
      stacks: {},
    }));
    expect(oneCopy.accessory).toBe('radar_esferas');
    expect(oneCopy.accessory2).toBeNull();

    const twoCopies = parseItems(JSON.stringify({
      accessory: 'radar_esferas',
      accessory2: 'radar_esferas',
      owned: ['radar_esferas'],
      consumables: {},
      stacks: { radar_esferas: 2 },
    }));
    expect(twoCopies.accessory).toBe('radar_esferas');
    expect(twoCopies.accessory2).toBe('radar_esferas');
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
