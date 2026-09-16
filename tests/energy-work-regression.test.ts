import { describe, expect, test } from 'bun:test';
import type { Player } from '@prisma/client';
import { computeDerived, applyRegen } from '../src/lib/game/engine';
import { initialPlayerData } from '../src/lib/game/characterInitial';
import { assertPlayerAvailableForAction, MAX_ACTION_ENERGY } from '../src/lib/game/rules';

function player(ki: number): Player {
  return { ...initialPlayerData(), id: 'regression', name: 'Regression', ki,
    lastRegen: new Date(), lastRegenHp: new Date(),
    missionId: 'agricultor', missionEndsAt: new Date(Date.now() + 3600000)
  } as Player;
}
describe('Energia e trabalho — decisões de 16/09/2026', () => {
  test('Ki aumenta poder de combate, mas não energia máxima', () => {
    const low = computeDerived(player(10));
    const high = computeDerived(player(999));
    expect(low.maxEnergy).toBe(MAX_ACTION_ENERGY);
    expect(high.maxEnergy).toBe(MAX_ACTION_ENERGY);
    expect(high.kiPower).toBeGreaterThan(low.kiPower);
  });
  test('energia legada acima do limite é normalizada sem repor energia gasta', () => {
    const p = player(999);
    p.energy = 1500;
    applyRegen(p, p.lastRegen.getTime());
    expect(p.energy).toBe(100);
    p.energy = 30;
    applyRegen(p, p.lastRegen.getTime());
    expect(p.energy).toBe(30);
  });
  test('trabalho permite treino, PvP, chefe, guilda e conquistas', () => {
    for (const action of ['train', 'attack_player', 'world_boss_attack', 'guild_donate', 'claim_achievement']) {
      expect(() => assertPlayerAvailableForAction(player(10), action)).not.toThrow();
    }
  });
});
