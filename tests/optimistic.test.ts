// =====================================================================
// v0.9.24 (B2) — DELTA OTIMISTA CONSISTENTE (probe de consistência)
// ---------------------------------------------------------------------
// O bug do playtest ("363/234 XP e nível 2"): XP somado SEM recalcular
// nível/carry — a UI exibia estado IMPOSSÍVEL por segundos. O contrato
// do applyOptimisticDelta: XP + level-up + carry + vida cheia são
// aplicados JUNTOS, sempre. Este teste é o PROBE: nenhuma sequência de
// deltas consegue produzir estado inválido.
// =====================================================================

import { describe, expect, test } from 'bun:test';
import { applyOptimisticDelta, builtinOptimisticDelta, optimisticLevelsGained } from '../src/lib/game/optimistic';
import { xpToNextLevel, SHOP_ITEMS, GUILD_CREATION_COST } from '../src/lib/game/content/world';
import type { PlayerView } from '../src/lib/game/types';

/** PlayerView sintético mínimo (só o que o delta lê). */
function view(over: Partial<PlayerView> = {}): PlayerView {
  const level = over.level ?? 2;
  const defense = over.defense ?? 10;
  const maxHp = 80 + level * 15 + defense * 5;
  return {
    id: 'p1',
    name: 'Probe',
    race: 'namekuseijin',
    avatarUrl: null,
    level,
    xp: over.xp ?? 100,
    xpToNext: xpToNextLevel(level),
    zeni: over.zeni ?? 1000,
    crystals: over.crystals ?? 5,
    hp: over.hp ?? maxHp,
    energy: over.energy ?? 50,
    strength: over.strength ?? 10,
    defense,
    speed: over.speed ?? 10,
    ki: over.ki ?? 10,
    battlesWon: 0,
    battlesLost: 0,
    missionsDone: 0,
    dragonBalls: 0,
    items: { weapon: null, armor: null, accessory: null, owned: [], consumables: {}, stacks: {} },
    techniques: [],
    loadout: { 1: null, 2: null, 3: null, S: null },
    strategy: 'balanced',
    transformation: null,
    transformationsOwned: [],
    guild: null,
    activeMission: null,
    claimableMission: null,
    professions: {},
    runningActivity: null,
    cosmetics: { owned: [], equipped: {} },
    talents: [],
    tournament: {
      round: 0,
      wins: 0,
      runCount: 0,
      bestRound: 0,
      titles: 0,
      roundWins: 0,
      cooldownEndsAt: null,
    },
    derived: {
      maxHp,
      maxEnergy: 80 + 10 * 2,
      power: 100,
      atkPower: 10,
      kiPower: 10,
      defPower: 10,
      resPower: 10,
    },
    regen: {
      energyIntervalSec: 300,
      hpIntervalSec: 12,
      lastRegenAt: new Date().toISOString(),
      lastRegenHpAt: new Date().toISOString(),
    },
    isBot: false,
    rankingPosition: null,
  } as PlayerView;
}

describe('v0.9.24 (B2) — applyOptimisticDelta: XP sempre COM level-up + carry', () => {
  test('ganho que cruza o limiar sobe o nível JUNTO (nunca XP > limiar com nível antigo)', () => {
    // estado: nível 2, XP 100/234 (playtest: "363/234 XP e nível 2")
    const p = view({ level: 2, xp: 100 });
    const need = xpToNextLevel(2); // 234
    const gain = need - 100 + 50; // cruza o limiar e sobra carry 50

    const after = applyOptimisticDelta(p, { xp: gain });

    expect(after.level).toBe(3);
    expect(after.xp).toBe(50);
    expect(after.xpToNext).toBe(xpToNextLevel(3));
    // INVARIANTE: nunca XP >= limiar do próprio nível
    expect(after.xp).toBeLessThan(xpToNextLevel(after.level));
  });

  test('level-up restaura a vida à CHEIA (mesma política do servidor)', () => {
    const p = view({ level: 2, xp: 100, hp: 30 });
    const after = applyOptimisticDelta(p, { xp: xpToNextLevel(2) - 100 + 1 });
    expect(after.level).toBe(3);
    expect(after.hp).toBe(80 + 3 * 15 + 10 * 5);
    expect(after.derived.maxHp).toBe(after.hp);
  });

  test('múltiplos níveis em um delta único (bolsão de XP) — carry sempre consistente', () => {
    const p = view({ level: 1, xp: 0 });
    // delta gigante: suficiente para 3+ níveis
    const delta = xpToNextLevel(1) + xpToNextLevel(2) + xpToNextLevel(3) + 7;
    const after = applyOptimisticDelta(p, { xp: delta });
    expect(after.level).toBe(4);
    expect(after.xp).toBe(7);
    expect(after.xp).toBeLessThan(xpToNextLevel(4));
  });

  test('ganho SEM cruzar limiar mantém nível/vida (nenhuma mudança espúria)', () => {
    const p = view({ level: 2, xp: 100, hp: 120 });
    const after = applyOptimisticDelta(p, { xp: 10 });
    expect(after.level).toBe(2);
    expect(after.xp).toBe(110);
    expect(after.hp).toBe(120);
  });

  test('probe de rajada: 500 deltas aleatórios nunca produzem estado inválido', () => {
    let p = view({ level: 1, xp: 0, zeni: 10_000 });
    let seed = 987654321;
    const rand = () => {
      // xorshift determinístico — sem Math.random no teste
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return ((seed >>> 0) % 1000) / 1000;
    };
    for (let i = 0; i < 500; i++) {
      p = applyOptimisticDelta(p, {
        xp: Math.floor(rand() * 500),
        zeni: -Math.floor(rand() * 20),
        crystals: rand() > 0.5 ? 1 : 0,
        energy: -3,
      });
      // INVARIANTES em TODA iteração (estado impossível = falha imediata)
      expect(p.xp).toBeLessThan(xpToNextLevel(p.level));
      expect(p.xp).toBeGreaterThanOrEqual(0);
      expect(p.zeni).toBeGreaterThanOrEqual(0);
      expect(p.energy).toBeGreaterThanOrEqual(0);
      expect(p.energy).toBeLessThanOrEqual(p.derived.maxEnergy);
      if (p.hp < p.derived.maxHp) expect(p.hp).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('v0.9.24 (B2) — builtinOptimisticDelta: deltas de tabela', () => {
  test('ação de hospital foi removida: heal não possui delta otimista', () => {
    expect(builtinOptimisticDelta(view({ hp: 30 }), { type: 'heal' })).toBeNull();
  });

  test('compra: preço de tabela × quantidade (Zeni e cristais)', () => {
    const luvas = SHOP_ITEMS.find((i) => i.id === 'luvas')!; // 300 zeni
    expect(builtinOptimisticDelta(view(), { type: 'buy', itemId: 'luvas', quantity: 3 })).toEqual({ zeni: -900 });
    const senzu = SHOP_ITEMS.find((i) => i.id === 'senzu')!; // 10 cristais
    expect(builtinOptimisticDelta(view(), { type: 'buy', itemId: 'senzu', quantity: 2 })).toEqual({ crystals: -20 });
  });

  test('fundação de guilda: custo publicado', () => {
    expect(builtinOptimisticDelta(view(), { type: 'create_guild' })).toEqual({ zeni: -GUILD_CREATION_COST });
  });

  test('batalhas: energia tabelada', () => {
    expect(builtinOptimisticDelta(view(), { type: 'battle' })).toEqual({ energy: -3 });
    expect(builtinOptimisticDelta(view(), { type: 'tournament_fight' })).toEqual({ energy: -3 });
    expect(builtinOptimisticDelta(view(), { type: 'attack_player' })).toEqual({ energy: -3 });
    expect(builtinOptimisticDelta(view(), { type: 'world_boss_attack' })).toEqual({ energy: -10 });
  });

  test('recompensas com RNG (claim_mission, battle, wish): SEM otimismo inventado', () => {
    expect(builtinOptimisticDelta(view(), { type: 'claim_mission' })).toBeNull();
    expect(builtinOptimisticDelta(view(), { type: 'wish', wishType: 'riqueza' })).toBeNull();
  });

  test('optimisticLevelsGained: anuncia o level-up do clique', () => {
    const p = view({ level: 2, xp: 100 });
    expect(optimisticLevelsGained(p, xpToNextLevel(2) - 100 + 1)).toBe(1);
    expect(optimisticLevelsGained(p, 10)).toBe(0);
  });
});
