// =====================================================================
// SIMULAÇÃO DE BALANCEAMENTO — Myst Ki Warriors
// ---------------------------------------------------------------------
// Reproduz a linha de base descrita na revisão:
//  * nível 10, TODOS os atributos básicos em 50, vida cheia;
//  * estratégia equilibrada; SEM equipamentos, técnicas ou transformações;
//  * 10 pares de raças (5 escolhe 2), 500 sementes por par;
//  * repetição com OS LADOS INVERTIDOS → 10.000 lutas;
//  * 4.000 participações por raça.
//
// Uso:
//   bun scripts/sim-balance.ts                → linha de base (antes)
//   bun scripts/sim-balance.ts --extended     → cenários estendidos
//   MODE=after bun scripts/sim-balance.ts     → pós-mudanças (mesmas sementes)
// =====================================================================

import { buildPlayerCombatant, simulateBattle, makeRng } from '../src/lib/game/engine';
import type { Player } from '@prisma/client';
import type { RaceId } from '../src/lib/game/types';

const RACES: RaceId[] = ['saiyajin', 'humano', 'namekuseijin', 'androide', 'majin'];

/** Fábrica de Player sintético (não toca o banco). */
function makePlayer(race: RaceId, over: Partial<Player> = {}): Player {
  return {
    id: `sim-${race}`,
    name: race,
    race,
    avatarUrl: null,
    level: 10,
    xp: 0,
    zeni: 0,
    crystals: 0,
    hp: 80 + 10 * 15 + 50 * 5, // 480 — vida cheia derivada
    strength: 50,
    defense: 50,
    speed: 50,
    ki: 50,
    energy: 180,
    battlesWon: 0,
    battlesLost: 0,
    pvpWins: 0,
    trainingsDone: 0,
    guildDonated: 0,
    missionsDone: 0,
    dragonBalls: 0,
    isBot: false,
    items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
    techniques: '[]',
    loadout: '{"1":null,"2":null,"3":null,"S":null}',
    strategy: 'balanced',
    missionId: null,
    missionEndsAt: null,
    missionsCompleted: '[]',
    transformationId: null,
    transformationsOwned: '[]',
    lastZenkaiAt: null,
    zenkaiWindowStart: null,
    zenkaiCount24h: 0,
    lastZenkaiOpponentId: null,
    pveBattleDay: null,
    pveBattleCount: 0,
    stateVersion: 0,
    lastRegen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    accountId: null,
    guildId: null,
    ...over,
  } as Player;
}

interface RaceStats {
  participations: number;
  wins: number;
  roundLimit: number; // lutas que foram até o limite de rodadas (raça viva)
  roundsTotal: number;
  damageDealt: number;
  damageTaken: number;
  endHpPct: number;
}

function emptyStats(): RaceStats {
  return { participations: 0, wins: 0, roundLimit: 0, roundsTotal: 0, damageDealt: 0, damageTaken: 0, endHpPct: 0 };
}

function Wilson95(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** Roda um par (a,b) com sementes 0..N-1 nos DOIS arranjos de lado. */
function runPair(a: RaceId, b: RaceId, seeds: number, stats: Map<string, RaceStats>, meta: { roundLimitBoth: number; totalFights: number }) {
  const pa = makePlayer(a);
  const pb = makePlayer(b);
  for (let seed = 0; seed < seeds; seed++) {
    // lado 1: a como "player", b como "enemy"
    {
      const ca = buildPlayerCombatant({ ...pa });
      const cb = buildPlayerCombatant({ ...pb });
      const sim = simulateBattle(ca, cb, { playerStartHp: ca.maxHp, rng: makeRng(seed) });
      record(a, b, sim.won, sim, stats, meta);
    }
    // lado 2: lados invertidos (b como "player")
    {
      const ca = buildPlayerCombatant({ ...pa });
      const cb = buildPlayerCombatant({ ...pb });
      const sim = simulateBattle(cb, ca, { playerStartHp: cb.maxHp, rng: makeRng(seed) });
      record(b, a, sim.won, sim, stats, meta);
    }
  }
}

function record(
  winnerRace: string,
  loserRace: string,
  won: boolean,
  sim: ReturnType<typeof simulateBattle>,
  stats: Map<string, RaceStats>,
  meta: { roundLimitBoth: number; totalFights: number }
) {
  // quem "venceu" é o primeiro combatente do sim — chamador garante a ordem
  const w = stats.get(winnerRace)!;
  const l = stats.get(loserRace)!;
  w.participations++;
  l.participations++;
  if (won) w.wins++;
  else l.wins++;

  const dmgDealtByFirst = sim.rounds.filter((r) => r.attacker === 'player').reduce((s, r) => s + r.damage, 0);
  const dmgDealtBySecond = sim.rounds.filter((r) => r.attacker === 'enemy').reduce((s, r) => s + r.damage, 0);
  w.damageDealt += dmgDealtByFirst;
  w.damageTaken += dmgDealtBySecond;
  l.damageDealt += dmgDealtBySecond;
  l.damageTaken += dmgDealtByFirst;

  w.roundsTotal += sim.rounds.length;
  l.roundsTotal += sim.rounds.length;
  const bothAlive = sim.playerEndHp > 0 && sim.enemyEndHp > 0 && sim.rounds.length >= 30;
  if (bothAlive) {
    w.roundLimit++;
    l.roundLimit++;
    meta.roundLimitBoth++;
  }
  w.endHpPct += sim.playerEndHp / sim.playerMaxHp;
  l.endHpPct += sim.enemyEndHp / sim.enemyMaxHp;
  meta.totalFights++;
}

function main() {
  const stats = new Map<string, RaceStats>();
  for (const r of RACES) stats.set(r, emptyStats());
  const meta = { roundLimitBoth: 0, totalFights: 0 };
  const SEEDS = 500;

  for (let i = 0; i < RACES.length; i++) {
    for (let j = i + 1; j < RACES.length; j++) {
      runPair(RACES[i], RACES[j], SEEDS, stats, meta);
    }
  }

  console.log('================ LINHA DE BASE (controle) ================');
  console.log('Cenário: nível 10, atributos 50, vida cheia, equilibrado, sem itens/técnicas/transformações');
  console.log(`Lutas: ${meta.totalFights} | Sementes: 0..${SEEDS - 1} por par, lados invertidos`);
  console.log('');
  const rows = RACES.map((r) => {
    const s = stats.get(r)!;
    const wr = s.wins / s.participations;
    const [lo, hi] = Wilson95(s.wins, s.participations);
    return {
      raça: r.padEnd(14),
      vitória: (wr * 100).toFixed(3).padStart(7) + '%',
      IC95: `[${(lo * 100).toFixed(1)}%, ${(hi * 100).toFixed(1)}%]`,
      'lim.rodadas': ((s.roundLimit / s.participations) * 100).toFixed(1) + '%',
      'rodadas/média': (s.roundsTotal / s.participations).toFixed(1),
      'dano/liga': Math.round(s.damageDealt / s.participations),
      'dano/sofrido': Math.round(s.damageTaken / s.participations),
      'HP%fim': ((s.endHpPct / s.participations) * 100).toFixed(1) + '%',
    };
  });
  console.table(rows);
  console.log(`Lutas decididas no limite de rodadas (ambos vivos): ${((meta.roundLimitBoth / meta.totalFights) * 100).toFixed(1)}%`);

  // matriz de confronto par-a-par
  console.log('');
  console.log('=== Matriz de confronto (vitória % da linha contra a coluna) ===');
  const matrix: Record<string, string> = {};
  for (const a of RACES) {
    matrix[a] = '';
  }
  const pairStats = new Map<string, { w: number; n: number }>();
  // re-rodar pares coletando par-a-par
  for (let i = 0; i < RACES.length; i++) {
    for (let j = i + 1; j < RACES.length; j++) {
      const a = RACES[i];
      const b = RACES[j];
      const pa = makePlayer(a);
      const pb = makePlayer(b);
      let aWins = 0;
      let n = 0;
      for (let seed = 0; seed < SEEDS; seed++) {
        {
          const ca = buildPlayerCombatant({ ...pa });
          const cb = buildPlayerCombatant({ ...pb });
          const sim = simulateBattle(ca, cb, { playerStartHp: ca.maxHp, rng: makeRng(seed) });
          if (sim.won) aWins++;
          n++;
        }
        {
          const ca = buildPlayerCombatant({ ...pa });
          const cb = buildPlayerCombatant({ ...pb });
          const sim = simulateBattle(cb, ca, { playerStartHp: cb.maxHp, rng: makeRng(seed) });
          if (!sim.won) aWins++;
          n++;
        }
      }
      pairStats.set(`${a}|${b}`, { w: aWins, n });
    }
  }
  const header = '             ' + RACES.map((r) => r.padEnd(13)).join('');
  console.log(header);
  for (const a of RACES) {
    let line = a.padEnd(13);
    for (const b of RACES) {
      if (a === b) {
        line += '     —      ';
        continue;
      }
      // chave canônica: MESMA ordem de criação (RACES[i] | RACES[j], i<j)
      let key = `${a}|${b}`;
      let ps = pairStats.get(key);
      if (!ps) {
        key = `${b}|${a}`;
        ps = pairStats.get(key)!;
      }
      const aIsFirst = key.split('|')[0] === a;
      const wins = aIsFirst ? ps.w : ps.n - ps.w;
      line += ((wins / ps.n) * 100).toFixed(1).padStart(6) + '%     ';
    }
    console.log(line);
  }
}

main();
