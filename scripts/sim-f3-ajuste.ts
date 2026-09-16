// =====================================================================
// F3-ajuste — EXPERIMENTO DE MODIFICADORES RACIAIS (Androide C1)
// --------------------------------------------------------------------
// O round-robin da auditoria (scripts/sim-audit-racial.ts) mediu no HEAD:
//   C1 (iniciante nv3/attrs 15): Androide 29,3% — 20,7pp do centro ⚠️
//   C6 (endgame nv45/attrs 250): Androide 63,4% — 13,7pp (dentro do
//   corredor ±15pp, mas na borda)
// Ajustar Androide com boosts uniformes empurra C6 PARA FORA do corredor.
// Este script testa CANDIDATOS injetando overrides no objeto RACES em
// runtime (sem tocar src/**) e mede C1/C2/C6 por candidato.
//
// Uso: bun scripts/sim-f3-ajuste.ts
// =====================================================================

import { buildPlayerCombatant, simulateBattle, makeRng } from '../src/lib/game/engine';
import { RACES } from '../src/lib/game/content/races';
import type { Player } from '@prisma/client';
import type { RaceId } from '../src/lib/game/types';

const RACE_ORDER: RaceId[] = ['saiyajin', 'humano', 'namekuseijin', 'androide', 'majin'];
const SEEDS = 250;

const NO_ITEMS = '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}';
const NO_TECH = '[]';
const NO_LOADOUT = '{"1":null,"2":null,"3":null,"S":null}';

interface Cfg { id: string; level: number; attr: number }
const CFGS: Cfg[] = [
  { id: 'C1', level: 3, attr: 15 },
  { id: 'C2', level: 10, attr: 50 },
  { id: 'C6', level: 45, attr: 250 },
];

function makePlayer(race: RaceId, cfg: Cfg): Player {
  return {
    id: `sim-${race}`, name: race, race, avatarUrl: null,
    level: cfg.level, xp: 0, zeni: 0, crystals: 0,
    hp: 80 + cfg.level * 15 + cfg.attr * 5,
    strength: cfg.attr, defense: cfg.attr, speed: cfg.attr, ki: cfg.attr,
    energy: 80 + cfg.attr * 2,
    battlesWon: 0, battlesLost: 0, pvpWins: 0, trainingsDone: 0,
    guildDonated: 0, missionsDone: 0, dragonBalls: 0,
    miracleWins: 0, davidWins: 0, isBot: false,
    items: NO_ITEMS, techniques: NO_TECH, loadout: NO_LOADOUT,
    strategy: 'balanced', missionId: null, missionEndsAt: null,
    missionsCompleted: '[]', transformationId: null, transformationsOwned: '[]',
    lastZenkaiAt: null, zenkaiWindowStart: null, zenkaiCount24h: 0,
    lastZenkaiOpponentId: null, pveBattleDay: null, pveBattleCount: 0,
    stateVersion: 0, lastRegen: new Date(), lastRegenHp: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
    accountId: null, guildId: null,
  } as unknown as Player;
}

function runConfigFixed(cfg: Cfg): Record<string, number> {
  const wins: Record<string, number> = {};
  const n: Record<string, number> = {};
  for (const r of RACE_ORDER) { wins[r] = 0; n[r] = 0; }
  for (let i = 0; i < RACE_ORDER.length; i++) {
    for (let j = i + 1; j < RACE_ORDER.length; j++) {
      const a = RACE_ORDER[i], b = RACE_ORDER[j];
      const pa = makePlayer(a, cfg), pb = makePlayer(b, cfg);
      for (let seed = 0; seed < SEEDS; seed++) {
        {
          const ca = buildPlayerCombatant({ ...pa }), cb = buildPlayerCombatant({ ...pb });
          const sim = simulateBattle(ca, cb, { playerStartHp: ca.maxHp, rng: makeRng(seed) });
          n[a]++; n[b]++; if (sim.won) wins[a]++; else wins[b]++;
        }
        {
          const ca = buildPlayerCombatant({ ...pa }), cb = buildPlayerCombatant({ ...pb });
          const sim = simulateBattle(cb, ca, { playerStartHp: cb.maxHp, rng: makeRng(seed) });
          n[a]++; n[b]++; if (sim.won) wins[b]++; else wins[a]++;
        }
      }
    }
  }
  const out: Record<string, number> = {};
  for (const r of RACE_ORDER) out[r] = +((wins[r] / n[r]) * 100).toFixed(2);
  return out;
}

interface Candidate {
  name: string;
  desc: string;
  apply: () => void;
}

const AND = RACES.androide.combat;
const ORIGINAL = { ...AND };

const CANDIDATES: Candidate[] = [
  { name: 'K0', desc: 'controle (HEAD atual)', apply: () => { Object.assign(AND, ORIGINAL); } },
  { name: 'G4', desc: 'dodge 0,045 + speed 1,035', apply: () => { Object.assign(AND, ORIGINAL); AND.dodgeBonus = 0.045; AND.speedMult = 1.035; } },
  { name: 'H4', desc: 'G4 + chance Ki 0,04', apply: () => { Object.assign(AND, ORIGINAL); AND.dodgeBonus = 0.045; AND.speedMult = 1.035; AND.kiAttackChanceBonus = 0.04; } },
  { name: 'H5', desc: 'G4 + chance Ki 0,06', apply: () => { Object.assign(AND, ORIGINAL); AND.dodgeBonus = 0.045; AND.speedMult = 1.035; AND.kiAttackChanceBonus = 0.06; } },
  { name: 'H8', desc: 'dodge 0,04 + speed 1,035 + chance Ki 0,06', apply: () => { Object.assign(AND, ORIGINAL); AND.dodgeBonus = 0.04; AND.speedMult = 1.035; AND.kiAttackChanceBonus = 0.06; } },
];

function main() {
  console.log('======================================================================================');
  console.log('F3-ajuste — candidatos para Androide (win rate % por config; alvo: 40–60, corredor 35–65)');
  console.log('======================================================================================');
  console.log('cand |                        C1 (nv3/15)                         ||       C6 (nv45/250)      || C2 (nv10/50)');
  console.log('     | sai    hum    nam    AND    maj   [disp]                   |  AND  [margem 65] |  AND');
  const results: Record<string, Record<string, Record<string, number>>> = {};
  for (const cand of CANDIDATES) {
    cand.apply();
    const per: Record<string, Record<string, number>> = {};
    for (const cfg of CFGS) per[cfg.id] = runConfigFixed(cfg);
    results[cand.name] = per;
    const c1 = per.C1, c6 = per.C6, c2 = per.C2;
    const dispC1 = Math.max(...RACE_ORDER.map((r) => Math.abs(c1[r] - 50)));
    const c1Line = RACE_ORDER.map((r) => (r === 'androide' ? '*' : ' ') + c1[r].toFixed(1).padStart(5)).join('');
    console.log(
      `${cand.name}   | ${c1Line}  [${dispC1.toFixed(1)}pp]  |  ${c6.androide.toFixed(1)}  ${c6.androide <= 65 ? 'ok' : 'FORA'}   | ${c2.androide.toFixed(1)}   — ${cand.desc}`
    );
  }
  Object.assign(AND, ORIGINAL); // restaura
  console.log('\n(* = Androide) — mesmo seeds 0..249 × 2 lados por par = 500 lutas/par/config/candidato');
}

main();
