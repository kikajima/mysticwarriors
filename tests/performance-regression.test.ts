import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { projectPlayerRegen } from '../src/lib/game/clientRegen';
import { applyOptimisticDelta } from '../src/lib/game/optimistic';
import type { PlayerView } from '../src/lib/game/types';

function player(over: Partial<PlayerView> = {}): PlayerView {
  const now = new Date('2026-09-19T12:00:00.000Z').toISOString();
  return {
    id: 'perf-p1',
    name: 'Perf',
    race: 'humano',
    avatarUrl: null,
    level: 5,
    xp: 0,
    xpToNext: 500,
    zeni: 1000,
    crystals: 0,
    hp: 100,
    energy: 50,
    strength: 10,
    defense: 10,
    speed: 10,
    ki: 10,
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
      maxHp: 200,
      maxEnergy: 100,
      power: 100,
      atkPower: 10,
      kiPower: 10,
      defPower: 10,
      resPower: 10,
    },
    regen: {
      energyIntervalSec: 300,
      hpIntervalSec: 12,
      lastRegenAt: now,
      lastRegenHpAt: now,
    },
    isBot: false,
    rankingPosition: null,
    ...over,
  } as PlayerView;
}

describe('regen ao vivo no cliente', () => {
  test('energia aparece assim que o intervalo vence, sem F5/poll', () => {
    const p = player();
    const base = Date.parse(p.regen.lastRegenAt);
    expect(projectPlayerRegen(p, base + 299_999).energy).toBe(50);
    const next = projectPlayerRegen(p, base + 300_000);
    expect(next.energy).toBe(51);
    expect(Date.parse(next.regen.lastRegenAt)).toBe(base + 300_000);
  });

  test('recupera vários intervalos e respeita os tetos de HP/energia', () => {
    const p = player({ energy: 98, hp: 198 });
    const base = Date.parse(p.regen.lastRegenAt);
    const next = projectPlayerRegen(p, base + 900_000);
    expect(next.energy).toBe(100);
    expect(next.hp).toBe(200);
  });

  test('gasto otimista a partir de energia cheia reinicia o relógio local', () => {
    const stale = new Date(Date.now() - 3_600_000).toISOString();
    const p = player({
      energy: 100,
      regen: {
        energyIntervalSec: 300,
        hpIntervalSec: 12,
        lastRegenAt: stale,
        lastRegenHpAt: stale,
      },
    });
    const after = applyOptimisticDelta(p, { energy: -3 });
    expect(after.energy).toBe(97);
    expect(Date.parse(after.regen.lastRegenAt)).toBeGreaterThan(Date.parse(stale));
  });
});

describe('contratos anti-regressão de latência', () => {
  test('PostgreSQL não usa mais uma fila global para todos os jogadores', async () => {
    const source = await Bun.file(path.join(process.cwd(), 'src/app/api/game/action/route.ts')).text();
    expect(source).toContain("const IS_SQLITE = (process.env.DATABASE_URL ?? '').startsWith('file:')");
    expect(source).toContain('const playerActionChains = new Map');
    expect(source).toContain('withActionLock(playerId, async () =>');
    expect(source).not.toContain('let actionChain: Promise<unknown> = Promise.resolve()');
  });

  test('estado paraleliza leituras independentes e ação evita UPDATE de regen vazio', async () => {
    const state = await Bun.file(path.join(process.cwd(), 'src/app/api/game/state/route.ts')).text();
    const actions = await Bun.file(path.join(process.cwd(), 'src/lib/game/actions.ts')).text();
    const page = await Bun.file(path.join(process.cwd(), 'src/app/jogar/page.tsx')).text();

    expect(state).toContain('await Promise.all([');
    expect(actions).toContain('if (applyRegen(player))');
    expect(page).toContain('projectPlayerRegen(prev, serverNowMs())');
    expect(page).toContain('window.setInterval(tick, 1000)');
  });
});
