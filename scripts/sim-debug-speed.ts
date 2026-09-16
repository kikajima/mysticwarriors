// =====================================================================
// MICRO-EXPERIMENTO: por que Androide (velocidade +10%) perde tanto?
// Compara combatentes NEUTROS variando APENAS a velocidade.
// =====================================================================

import { simulateBattle, makeRng } from '../src/lib/game/engine';
import type { Combatant, RaceId } from '../src/lib/game/types';
import type { TechniqueDef } from '../src/lib/game/types';

const BALANCED = {
  id: 'balanced',
  name: 'Equilibrado',
  description: '',
  icon: '',
  damageDealtMult: 1.0,
  damageTakenMult: 1.0,
  physicalBias: 0,
  techniqueAggression: 0.18,
  dodgeBonus: 0,
} as const;

const NEUTRAL_COMBAT = {
  physicalDamageMult: 1,
  kiDamageMult: 1,
  defenseMult: 1,
  dodgeBonus: 0,
  speedMult: 1,
  kiAttackChanceBonus: 0,
  absorbOnWinPct: 0,
};

function fighter(speed: number, name = 'x'): Combatant {
  return {
    name,
    emoji: '🥋',
    level: 10,
    race: 'humano' as RaceId,
    strength: 50,
    defense: 50,
    speed,
    ki: 50,
    maxHp: 480,
    atkPower: Math.round(50 * 2.2),
    kiPower: Math.round(50 * 2.4),
    defPower: Math.round(50 * 1.8),
    resPower: Math.round(50 * 1.1 + 50 * 0.9),
    power: 1000, // mesma escala dos dois lados — Armadura de Escala neutra
    raceCombat: NEUTRAL_COMBAT,
    techniques: [] as TechniqueDef[],
    strategy: BALANCED,
    maxBattleKi: 40 + 50 * 4,
    battleKi: 40 + 50 * 4,
    transformation: null,
  };
}

function pair(spA: number, spB: number, seeds = 2000): number {
  let aWins = 0;
  let n = 0;
  for (let s = 0; s < seeds; s++) {
    // A como player
    if (simulateBattle(fighter(spA, 'A'), fighter(spB, 'B'), { playerStartHp: 480, rng: makeRng(s) }).won) aWins++;
    n++;
    // B como player (lados invertidos)
    if (!simulateBattle(fighter(spB, 'B'), fighter(spA, 'A'), { playerStartHp: 480, rng: makeRng(s) }).won) aWins++;
    n++;
  }
  return (aWins / n) * 100;
}

console.log('=== Velocidade pura (neutros idênticos exceto speed) ===');
for (const [a, b] of [
  [50, 50],
  [55, 50],
  [60, 50],
  [50, 55],
  [52.5, 50],
] as const) {
  console.log(`speed A=${a} vs B=${b} → vitória A: ${pair(a, b).toFixed(1)}%`);
}

// === Hipótese: o rng stream + ordem de consumo favorece o 2º atacante? ===
// Teste: mesmo speed, mas forçando playerFirst via velocidade IGUAL (empate 50/50)
// já coberto acima (50 vs 50 = 50% esperado).

// === Agora teste de RAÇAS reais: androide vs humano direto ===
import { buildPlayerCombatant } from '../src/lib/game/engine';
import type { Player } from '@prisma/client';

function makePlayer(race: string, speed = 50): Player {
  return {
    id: 'x', name: race, race, avatarUrl: null, level: 10, xp: 0,
    zeni: 0, crystals: 0, hp: 480, strength: 50, defense: 50, speed, ki: 50, energy: 180,
    battlesWon: 0, battlesLost: 0, pvpWins: 0, trainingsDone: 0, guildDonated: 0,
    missionsDone: 0, dragonBalls: 0, isBot: false,
    items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
    techniques: '[]', loadout: '{"1":null,"2":null,"3":null,"S":null}', strategy: 'balanced',
    missionId: null, missionEndsAt: null, missionsCompleted: '[]', transformationId: null,
    transformationsOwned: '[]', lastZenkaiAt: null, zenkaiWindowStart: null, zenkaiCount24h: 0,
    lastZenkaiOpponentId: null, pveBattleDay: null, pveBattleCount: 0, stateVersion: 0,
    lastRegen: new Date(), createdAt: new Date(), updatedAt: new Date(), accountId: null, guildId: null,
  } as Player;
}

console.log('\n=== Androide real vs raças neutras de velocidade 50 ===');
const races = ['saiyajin', 'humano', 'namekuseijin', 'androide', 'majin'] as const;
for (const race of races) {
  if (race === 'androide') continue;
  let aWins = 0, n = 0;
  for (let s = 0; s < 2000; s++) {
    // androide como player
    const andr = buildPlayerCombatant(makePlayer('androide'));
    const other = buildPlayerCombatant(makePlayer(race));
    if (simulateBattle(andr, other, { playerStartHp: andr.maxHp, rng: makeRng(s) }).won) aWins++;
    n++;
    const andr2 = buildPlayerCombatant(makePlayer('androide'));
    const other2 = buildPlayerCombatant(makePlayer(race));
    if (!simulateBattle(other2, andr2, { playerStartHp: other2.maxHp, rng: makeRng(s) }).won) aWins++;
    n++;
  }
  console.log(`androide vs ${race.padEnd(14)} → androide: ${((aWins / n) * 100).toFixed(1)}%`);
}
