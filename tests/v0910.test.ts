// =====================================================================
// v0.9.10 — ENERGIA NÃO REGENERA NO LEVEL-UP · LOJA COM QUANTIDADES ·
// VENDA DE ITENS · STACKS DE EQUIPAMENTO · SANITIZE NA NUVEM
// =====================================================================

import { describe, expect, test } from 'bun:test';
import {
  parseItems,
  itemCount,
  applyEquipmentBuy,
  applyEquipmentSell,
} from '../src/lib/game/engine';
import { trainingGain, getItem, SELL_PRICE_RATIO, SHOP_MAX_QUANTITY, REGEN } from '../src/lib/game/constants';
import { sellUnitPrice } from '../src/lib/game/actions';
import { MISSION_BLOCKED_ACTIONS } from '../src/lib/game/rules';
import {
  serializeCharacterForCloud,
  sanitizeCloudCharacterState,
  type CloudCharacterSnapshot,
} from '../src/lib/supabase/progress';
import type { Player } from '@prisma/client';

// ===== fixtures =====

function playerFixture(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player_test_1',
    name: 'Testador',
    race: 'humano',
    avatarUrl: null,
    level: 5,
    xp: 10,
    zeni: 5000,
    crystals: 60,
    hp: 200,
    energy: 40,
    strength: 12,
    defense: 11,
    speed: 10,
    ki: 10,
    battlesWon: 1,
    battlesLost: 0,
    pvpWins: 0,
    trainingsDone: 2,
    guildDonated: 0,
    missionsDone: 1,
    dragonBalls: 0,
    isBot: false,
    items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
    techniques: '[]',
    loadout: '{"1":null,"2":null,"3":null,"S":null}',
    strategy: 'balanced',
    missionId: null,
    missionEndsAt: null,
    missionsCompleted: '[]',
    professions: null,
    transformationId: null,
    transformationsOwned: '[]',
    lastZenkaiAt: null,
    zenkaiWindowStart: null,
    zenkaiCount24h: 0,
    lastZenkaiOpponentId: null,
    pveBattleDay: null,
    pveBattleCount: 0,
    stateVersion: 0,
    lastRegen: new Date('2026-09-13T10:00:00.000Z'),
    lastRegenHp: null,
    cosmeticsEquipped: null,
    cosmeticsOwned: null,
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    updatedAt: new Date('2026-09-13T10:00:00.000Z'),
    accountId: null,
    guildId: null,
    ...overrides,
  } as Player;
}

// ===== parseItems: stacks de equipamento =====

describe('v0.9.10 — parseItems com stacks (retrocompatível)', () => {
  test('estado legado sem stacks → mapa vazio, nada quebra', () => {
    const items = parseItems('{"weapon":"katana","armor":null,"accessory":null,"owned":["katana","gi"],"consumables":{"senzu":2}}');
    expect(items.stacks).toEqual({});
    expect(itemCount(items, 'katana')).toBe(1);
    expect(itemCount(items, 'gi')).toBe(1);
    expect(itemCount(items, 'luvas')).toBe(0);
  });

  test('slots novos são retrocompatíveis e rejeitam item da categoria errada', () => {
    const valid = parseItems(JSON.stringify({
      head: 'bandana_oficina',
      wrists: 'munhequeiras_reforcadas',
      legs: 'calca_treino_reforcada',
      boots: 'botas_corrida_reforcadas',
      owned: ['bandana_oficina', 'munhequeiras_reforcadas', 'calca_treino_reforcada', 'botas_corrida_reforcadas'],
      consumables: {},
    }));
    expect(valid.head).toBe('bandana_oficina');
    expect(valid.wrists).toBe('munhequeiras_reforcadas');
    expect(valid.legs).toBe('calca_treino_reforcada');
    expect(valid.boots).toBe('botas_corrida_reforcadas');

    const invalid = parseItems(JSON.stringify({
      head: 'energia_infinita',
      owned: ['energia_infinita'],
      consumables: {},
    }));
    expect(invalid.head).toBeNull();
  });

  test('stacks válidas são preservadas (só ids presentes em owned)', () => {
    const items = parseItems('{"weapon":null,"armor":null,"accessory":null,"owned":["gi","luvas"],"consumables":{},"stacks":{"gi":3,"luvas":2}}');
    expect(items.stacks).toEqual({ gi: 3, luvas: 2 });
    expect(itemCount(items, 'gi')).toBe(3);
  });

  test('stack de id fora de owned é descartada; valores inválidos também', () => {
    const items = parseItems('{"weapon":null,"armor":null,"accessory":null,"owned":["gi"],"consumables":{},"stacks":{"gi":2,"katana":9,"hacker":50}}');
    // katana/hacker não estão em owned → descartados
    expect(items.stacks).toEqual({ gi: 2 });
    const one = parseItems('{"owned":["gi"],"stacks":{"gi":1}}');
    expect(one.stacks).toEqual({}); // 1 = implícito, sem entrada
  });

  test('valor fracionário é truncado para baixo (2.9 → 2), nunca inflado', () => {
    const frac = parseItems('{"owned":["gi"],"stacks":{"gi":2.9}}');
    expect(frac.stacks).toEqual({ gi: 2 });
    const huge = parseItems('{"owned":["gi"],"stacks":{"gi":5000}}');
    expect(huge.stacks).toEqual({}); // acima de 999 → descartado (não clamped)
  });

  test('duplicatas em owned são deduplicadas (bônus de treino nunca soma 2x)', () => {
    const items = parseItems('{"owned":["gi_ponderado","gi_ponderado","gi_ponderado"],"consumables":{},"stacks":{"gi_ponderado":3}}');
    expect(items.owned).toEqual(['gi_ponderado']);
    expect(items.stacks).toEqual({ gi_ponderado: 3 });
    expect(itemCount(items, 'gi_ponderado')).toBe(3);
  });

  test('JSON inválido → estado padrão com stacks vazias', () => {
    const items = parseItems('lixo total');
    expect(items).toEqual({
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
    });
  });
});

// ===== applyEquipmentBuy / applyEquipmentSell =====

describe('v0.9.10 — compra e venda de equipamento no inventário (puro)', () => {
  test('comprar N unidades de item novo → owned único + stacks', () => {
    const items = parseItems('{"owned":[],"consumables":{}}');
    applyEquipmentBuy(items, 'gi', 3);
    expect(items.owned).toEqual(['gi']);
    expect(items.stacks).toEqual({ gi: 3 });
    expect(itemCount(items, 'gi')).toBe(3);
  });

  test('comprar mais unidades de item legado (1 implícito) soma às stacks', () => {
    const items = parseItems('{"owned":["gi"],"consumables":{}}');
    applyEquipmentBuy(items, 'gi', 2);
    expect(itemCount(items, 'gi')).toBe(3);
    expect(items.owned).toEqual(['gi']);
  });

  test('vender respeita o total e limpa owned/stacks quando zera', () => {
    const items = parseItems('{"owned":["gi"],"consumables":{},"stacks":{"gi":3}}');
    expect(applyEquipmentSell(items, 'gi', 1)).toBe(true);
    expect(itemCount(items, 'gi')).toBe(2);
    expect(items.owned).toEqual(['gi']); // ainda tem 2
    expect(applyEquipmentSell(items, 'gi', 2)).toBe(true);
    expect(itemCount(items, 'gi')).toBe(0);
    expect(items.owned).toEqual([]);
    expect(items.stacks).toEqual({});
  });

  test('vender mais do que se possui → false e estado intacto', () => {
    const items = parseItems('{"owned":["gi"],"consumables":{},"stacks":{"gi":2}}');
    expect(applyEquipmentSell(items, 'gi', 3)).toBe(false);
    expect(itemCount(items, 'gi')).toBe(2);
  });

  test('treino: bônus conta UMA vez mesmo com várias unidades (anti-exploit)', () => {
    const items = parseItems('{"owned":["gi_ponderado"],"consumables":{},"stacks":{"gi_ponderado":5}}');
    // gi_ponderado tem trainBonus {all: 1} → ganho base 1 + 1 (uma vez) = 2
    expect(trainingGain(items.owned, 'strength')).toBe(2);
    expect(trainingGain(items.owned, 'ki')).toBe(2);
  });
});

// ===== preço de venda =====

describe('v0.9.10 — sellUnitPrice (50% na MESMA moeda da compra)', () => {
  test('item de zeni devolve metade em zeni', () => {
    const gi = getItem('gi')!; // 250 zeni
    expect(gi.price).toBe(250);
    expect(sellUnitPrice(gi)).toBe(125);
  });

  test('item de diamantes devolve metade em diamantes (sem conversão de moeda)', () => {
    const senzu = getItem('senzu')!; // 10 💎
    expect(senzu.currency).toBe('crystal');
    expect(sellUnitPrice(senzu)).toBe(5);
  });

  test('preço ímpar arredonda para baixo (floor), nunca negativo', () => {
    const bastao = getItem('bastao')!; // 900
    expect(sellUnitPrice(bastao)).toBe(450);
    expect(SELL_PRICE_RATIO).toBe(0.5);
    expect(Math.floor(901 * SELL_PRICE_RATIO)).toBe(450);
  });

  test('teto de quantidade por transação é 99', () => {
    expect(SHOP_MAX_QUANTITY).toBe(99);
  });
});

// ===== loja liberada durante trabalho (matriz v0.16 — INVERTE a regra antiga) =====

describe('v0.16 — venda e compra LIBERADAS durante turno de trabalho (matriz definitiva)', () => {
  test("'sell' e 'buy' NÃO estão nos 2 bloqueios de missão", () => {
    expect(MISSION_BLOCKED_ACTIONS.has('sell')).toBe(false);
    expect(MISSION_BLOCKED_ACTIONS.has('buy')).toBe(false);
    expect(MISSION_BLOCKED_ACTIONS.has('world_boss_attack')).toBe(false);
    // e os 3 negados seguem negados
    expect(MISSION_BLOCKED_ACTIONS.has('train')).toBe(false);
    expect(MISSION_BLOCKED_ACTIONS.has('battle')).toBe(true);
    expect(MISSION_BLOCKED_ACTIONS.has('tournament_fight')).toBe(true);
  });
});

// ===== nuvem: stacks sobrevivem ao ciclo serializar → sanitizar =====

describe('v0.9.10 — stacks na sincronização da nuvem', () => {
  function snapFixture(items: unknown): CloudCharacterSnapshot {
    return {
      id: 'cltest1',
      name: 'Nuvem',
      race: 'humano',
      avatarUrl: null,
      level: 5,
      xp: 10,
      zeni: 1000,
      crystals: 20,
      hp: 150,
      energy: 50,
      strength: 12,
      defense: 11,
      speed: 10,
      ki: 10,
      battlesWon: 1,
      battlesLost: 0,
      pvpWins: 0,
      trainingsDone: 1,
      guildDonated: 0,
      missionsDone: 0,
      dragonBalls: 0,
      items: items as CloudCharacterSnapshot['items'],
      techniques: [],
      loadout: { '1': null, '2': null, '3': null, S: null },
      strategy: 'balanced',
      missionsCompleted: [],
      professions: {},
      transformationId: null,
      transformationsOwned: [],
      cosmeticsEquipped: {},
      cosmeticsOwned: [],
      missionId: null,
      missionEndsAt: null,
      lastRegen: '2026-09-13T10:00:00.000Z',
      lastRegenHp: null,
      quests: [],
      achievementsClaimed: [],
    // v0.9.15–v0.9.18 — progressão recente começa zerada
    talents: [],
    miracleWins: 0,
    davidWins: 0,
    tournament: null,
    tournamentTitles: 0,
    tournamentRoundWins: 0,
    };
  }

  test('serializeCharacterForCloud leva as stacks do personagem', () => {
    const p = playerFixture({
      items: '{"weapon":"katana","armor":null,"accessory":null,"owned":["katana","gi"],"consumables":{"senzu":2},"stacks":{"katana":4,"gi":2}}',
    });
    const snap = serializeCharacterForCloud(p, undefined);
    expect(snap.items.stacks).toEqual({ katana: 4, gi: 2 });
  });

  test('sanitize preserva stacks válidas e derruba inválidas', () => {
    const dirty = snapFixture({
      weapon: 'katana',
      armor: null,
      accessory: null,
      owned: ['katana', 'gi', 'item_hackerado'],
      consumables: { senzu: 3, pocao_falsa: 9 },
      stacks: { katana: 4, gi: 1, item_hackerado: 7, luvas: 2, negativo: -5 },
    });
    const clean = sanitizeCloudCharacterState(dirty);
    expect(clean).not.toBeNull();
    // gi:1 e luvas (não possuído) e hackerado caem fora; katana:4 fica
    expect(clean!.items.stacks).toEqual({ katana: 4 });
    expect(clean!.items.owned).toEqual(['katana', 'gi']);
    expect(clean!.items.consumables).toEqual({ senzu: 3 });
  });

  test('sanitize NUNCA inventa unidades (valor 1 é implícito, lixo vira nada)', () => {
    const dirty = snapFixture({
      owned: ['gi'],
      stacks: { gi: 1, katana: 'muito', luvas: 2.5, botas: 0 },
    });
    const clean = sanitizeCloudCharacterState(dirty);
    expect(clean!.items.stacks).toEqual({});
    expect(itemCount(clean!.items, 'gi')).toBe(1);
  });
});

// ===== Mudança 1: energia no level-up (contrato do código) =====

describe('v0.9.10 — Mudança 1: level-up não restaura energia', () => {
  test('fontes de energia restantes: regen por tempo, cápsula da loja, admin', () => {
    // A cápsula de energia continua comprável e usável
    const capsula = getItem('capsula_ki')!;
    expect(capsula.effect).toBe('full_energy');
    expect(capsula.currency).toBe('crystal');
    // Regeneração por tempo segue no modelo de 8h (300s por ponto)
    expect(REGEN.energySeconds).toBe(300);
  });
});
