// =====================================================================
// SIMULAÇÃO ESTENDIDA — arquétipos de build × faixas de progressão
// ---------------------------------------------------------------------
// Cenários (mesma metodologia da linha de base: lados invertidos,
// sementes fixas, IC 95%):
//  * INÍCIO ... nível 5, stats ~20, sem itens/técnicas/transformações
//  * MEIO ..... nível 20, stats ~80, técnicas básicas equipadas
//  * FIM ...... nível 45, stats ~180, técnicas avançadas + transformação II
// Arquétipos por raça: FÍSICO, KI, TANQUE, VELOZ, EQUILIBRADO.
// Meta: média por raça dentro de 45–55% em CADA faixa (Riot Balance
// Framework adaptado — métricas por grupo, não agregado global).
// =====================================================================

import { buildPlayerCombatant, simulateBattle, makeRng } from '../src/lib/game/engine';
import type { Player } from '@prisma/client';
import type { RaceId } from '../src/lib/game/types';

const RACES: RaceId[] = ['saiyajin', 'humano', 'namekuseijin', 'androide', 'majin'];

type Archetype = 'fisico' | 'ki' | 'tank' | 'veloz' | 'equilibrado';

/** Distribuição de stats por arquétipo (orçamento fixo por faixa). */
function statsFor(arch: Archetype, budget: number): { strength: number; defense: number; speed: number; ki: number } {
  // pesos do arquétipo (normalizados, aplicados ao orçamento total)
  const weights: Record<Archetype, [number, number, number, number]> = {
    fisico: [0.42, 0.2, 0.18, 0.2],
    ki: [0.2, 0.2, 0.18, 0.42],
    tank: [0.22, 0.42, 0.16, 0.2],
    veloz: [0.24, 0.2, 0.42, 0.14],
    equilibrado: [0.25, 0.25, 0.25, 0.25],
  };
  const [wS, wD, wV, wK] = weights[arch];
  return {
    strength: Math.max(10, Math.round(budget * wS)),
    defense: Math.max(10, Math.round(budget * wD)),
    speed: Math.max(10, Math.round(budget * wV)),
    ki: Math.max(10, Math.round(budget * wK)),
  };
}

interface Band {
  label: string;
  level: number;
  budget: number;
  /** loadout coerente com o arquétipo (build de verdade, não artificial) */
  loadoutByArch: Record<Archetype, { techniques: string[]; loadout: Record<string, string | null>; strategy: string }>;
  transformation: string | null;
}

const BANDS: Band[] = [
  {
    label: 'INÍCIO (nv 5, orçamento 80, sem técnicas/transformações, equilibrado)',
    level: 5,
    budget: 80,
    loadoutByArch: {
      fisico: { techniques: [], loadout: { '1': null, '2': null, '3': null, S: null }, strategy: 'balanced' },
      ki: { techniques: [], loadout: { '1': null, '2': null, '3': null, S: null }, strategy: 'balanced' },
      tank: { techniques: [], loadout: { '1': null, '2': null, '3': null, S: null }, strategy: 'balanced' },
      veloz: { techniques: [], loadout: { '1': null, '2': null, '3': null, S: null }, strategy: 'balanced' },
      equilibrado: { techniques: [], loadout: { '1': null, '2': null, '3': null, S: null }, strategy: 'balanced' },
    },
    transformation: null,
  },
  {
    label: 'MEIO (nv 20, orçamento 320, técnicas básicas por arquétipo)',
    level: 20,
    budget: 320,
    loadoutByArch: {
      fisico: { techniques: ['rogafufuken', 'megaton_punch'], loadout: { '1': 'rogafufuken', '2': 'megaton_punch', '3': null, S: null }, strategy: 'melee' },
      ki: { techniques: ['kamehameha', 'dodonpa', 'kienzan'], loadout: { '1': 'kamehameha', '2': 'dodonpa', '3': 'kienzan', S: null }, strategy: 'ki_specialist' },
      tank: { techniques: ['rogafufuken', 'dodonpa'], loadout: { '1': 'rogafufuken', '2': 'dodonpa', '3': null, S: null }, strategy: 'defensive' },
      veloz: { techniques: ['rogafufuken', 'kamehameha'], loadout: { '1': 'rogafufuken', '2': 'kamehameha', '3': null, S: null }, strategy: 'aggressive' },
      equilibrado: { techniques: ['rogafufuken', 'kamehameha', 'kienzan'], loadout: { '1': 'rogafufuken', '2': 'kamehameha', '3': 'kienzan', S: null }, strategy: 'balanced' },
    },
    transformation: null,
  },
  {
    label: 'FIM (nv 45, orçamento 720, avançadas + suprema + transformação II)',
    level: 45,
    budget: 720,
    loadoutByArch: {
      fisico: { techniques: ['megaton_punch', 'kaioken', 'final_flash'], loadout: { '1': 'megaton_punch', '2': 'kaioken', '3': null, S: 'final_flash' }, strategy: 'melee' },
      ki: { techniques: ['kikoho', 'makankosappo', 'big_bang', 'final_flash'], loadout: { '1': 'kikoho', '2': 'makankosappo', '3': 'big_bang', S: 'final_flash' }, strategy: 'ki_specialist' },
      tank: { techniques: ['rogafufuken', 'kikoho', 'makankosappo', 'final_flash'], loadout: { '1': 'rogafufuken', '2': 'kikoho', '3': 'makankosappo', S: 'final_flash' }, strategy: 'defensive' },
      veloz: { techniques: ['kaioken', 'kikoho', 'big_bang', 'final_flash'], loadout: { '1': 'kaioken', '2': 'kikoho', '3': 'big_bang', S: 'final_flash' }, strategy: 'aggressive' },
      equilibrado: { techniques: ['kikoho', 'makankosappo', 'big_bang', 'final_flash'], loadout: { '1': 'kikoho', '2': 'makankosappo', '3': 'big_bang', S: 'final_flash' }, strategy: 'balanced' },
    },
    transformation: 'per-race-arch',
  },
];

/** Transformação de nível 3 COERENTE com o arquétipo (ramo da árvore). */
const TRANSFORM_BY_RACE_ARCH: Record<string, Record<Archetype, string>> = {
  saiyajin: { fisico: 'saiyajin_ss2_forja', ki: 'saiyajin_ss2_furia', tank: 'saiyajin_ss2_mestre', veloz: 'saiyajin_ss2_mestre', equilibrado: 'saiyajin_ss2_mestre' },
  humano: { fisico: 'humano_aura', ki: 'humano_kaio', tank: 'humano_aura', veloz: 'humano_instinto', equilibrado: 'humano_aura' },
  namekuseijin: { fisico: 'nameku_guardiao', ki: 'nameku_sabio', tank: 'nameku_dragao', veloz: 'nameku_guardiao', equilibrado: 'nameku_guardiao' },
  androide: { fisico: 'androide_absorcao', ki: 'androide_raio', tank: 'androide_eterno', veloz: 'androide_eterno', equilibrado: 'androide_eterno' },
  majin: { fisico: 'majin_kid', ki: 'majin_arcano', tank: 'majin_absoluto', veloz: 'majin_absoluto', equilibrado: 'majin_absoluto' },
};

function makeFighter(race: RaceId, arch: Archetype, band: Band): Player {
  const st = statsFor(arch, band.budget);
  const kit = band.loadoutByArch[arch];
  const transformation = band.transformation === null ? null : TRANSFORM_BY_RACE_ARCH[race][arch];
  return {
    id: `sim-${race}-${arch}`,
    name: `${race}/${arch}`,
    race,
    avatarUrl: null,
    level: band.level,
    xp: 0,
    zeni: 0,
    crystals: 0,
    hp: 9999,
    strength: st.strength,
    defense: st.defense,
    speed: st.speed,
    ki: st.ki,
    energy: 9999,
    battlesWon: 0,
    battlesLost: 0,
    pvpWins: 0,
    trainingsDone: 0,
    guildDonated: 0,
    missionsDone: 0,
    dragonBalls: 0,
    isBot: false,
    items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
    techniques: JSON.stringify(kit.techniques),
    loadout: JSON.stringify(kit.loadout),
    strategy: kit.strategy,
    missionId: null,
    missionEndsAt: null,
    missionsCompleted: '[]',
    transformationId: transformation,
    transformationsOwned: JSON.stringify(transformation === null ? [] : [transformation]),
    lastZenkaiAt: null,
    zenkaiWindowStart: null,
    zenkaiCount24h: 0,
    lastZenkaiOpponentId: null,
    pveBattleDay: null,
    pveBattleCount: 0,
    stateVersion: 0,
    lastRegen: new Date(),
    lastRegenHp: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    accountId: null,
    guildId: null,
  } as Player;
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

const ARCHS: Archetype[] = ['fisico', 'ki', 'tank', 'veloz', 'equilibrado'];

console.log('================ CENÁRIOS ESTENDIDOS (pós-v0.4) ================');
console.log('Metodologia: para cada confronto raça×raça (5 escolhe 2 = 10 pares),');
console.log('ambos com o MESMO arquétipo e faixa; 200 sementes por par, lados');
console.log('invertidos. Métrica: taxa de vitória MÉDIA da raça contra o pool.\n');

for (const band of BANDS) {
  console.log(`\n===== ${band.label} =====`);
  const rows: Array<Record<string, string | number>> = [];
  for (const race of RACES) {
    const stats = { w: 0, n: 0, dmg: 0, rounds: 0 };
    for (const other of RACES) {
      if (race === other) continue;
      for (const arch of ARCHS) {
        // a raça alvo usa CADA arquétipo contra o MESMO arquétipo das outras
        for (let seed = 0; seed < 40; seed++) {
          const a = buildPlayerCombatant(makeFighter(race, arch, band));
          const b = buildPlayerCombatant(makeFighter(other as RaceId, arch, band));
          const sim = simulateBattle(a, b, { playerStartHp: a.maxHp, rng: makeRng(seed) });
          stats.n++;
          if (sim.won) stats.w++;
          stats.dmg += sim.rounds.filter((r) => r.attacker === 'player').reduce((s, r) => s + r.damage, 0);
          stats.rounds += sim.rounds.length;

          const a2 = buildPlayerCombatant(makeFighter(race, arch, band));
          const b2 = buildPlayerCombatant(makeFighter(other as RaceId, arch, band));
          const sim2 = simulateBattle(b2, a2, { playerStartHp: b2.maxHp, rng: makeRng(seed) });
          stats.n++;
          if (!sim2.won) stats.w++;
          stats.dmg += sim2.rounds.filter((r) => r.attacker === 'enemy').reduce((s, r) => s + r.damage, 0);
          stats.rounds += sim2.rounds.length;
        }
      }
    }
    const wr = stats.w / stats.n;
    const [lo, hi] = Wilson95(stats.w, stats.n);
    rows.push({
      raça: race,
      participação: stats.n,
      'vitória%': +(wr * 100).toFixed(2),
      'IC95': `${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}`,
      'dano/luta': Math.round(stats.dmg / stats.n),
      'strikes/luta': +(stats.rounds / stats.n).toFixed(1),
    });
  }
  console.table(rows);

  // verificações da meta
  const worst = rows.reduce((m, r) => Math.min(m, r['vitória%'] as number), 100);
  const best = rows.reduce((m, r) => Math.max(m, r['vitória%'] as number), 0);
  console.log(`→ faixa entre raças: ${worst.toFixed(1)}% … ${best.toFixed(1)}% (meta 45–55%, tolerância 42–58%)`);
  if (worst < 42 || best > 58) {
    console.log('⚠ FORA DA META — recalibrar');
    process.exitCode = 1;
  } else {
    console.log('✓ dentro da meta');
  }
}
