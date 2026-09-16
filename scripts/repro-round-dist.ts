/** Distribuição de rodadas com loadout realista (técnicas equipadas). */
import { simulateBattle, buildPlayerCombatant, makeRng } from '../src/lib/game/engine';
import type { Player } from '@prisma/client';
import { buildTournamentOpponent, fighterForRound } from '../src/lib/game/content/tournament';

function mkPlayer(level: number, loadout: string, talents: string): Player {
  const base = Math.floor(level * 2.2);
  return {
    id: 'x', createdAt: new Date(), updatedAt: new Date(), accountId: null, activeForAccountId: null,
    name: 'Rei Taurion', race: 'saiyajin', level, xp: 0, zeni: 0, crystals: 0,
    hp: 80 + level * 15 + base * 5, energy: 100,
    strength: base, ki: base, speed: base, defense: base,
    techniqueXp: 100000, strategy: 'aggressive',
    loadout, items: '[]', inventory: '[]', equipped: '[]',
    transformation: null, talents, cosmeticsEquipped: null, ownedCosmetics: '[]',
    avatarUrl: null, battlesWon: 0, battlesLost: 0, pvpWins: 0,
    tournament: null, tournamentTitles: 0, tournamentRoundWins: 0,
    dragonBalls: 0, shenronWishes: 0, trainingsDone: 0, missionsDone: 0,
    zenkaiCount: 0, miracleWins: 0, davidWins: 0,
    lastZenkaiAt: null, lastZenkaiOpponentId: null, lastDailyAt: null, lastWeeklyAt: null,
    guildId: null, guildRole: null, profession: null, professionXp: 0, lastFarmAt: null, gameMeta: null,
  } as unknown as Player;
}

// loadout típico de nv14 agressivo com técnicas que ele conseguiria comprar
const LOADOUT = JSON.stringify(['rogafufuken', 'kamehameha', 'kienzan', 'kikoho']);
const TALENTS = JSON.stringify(['segundo-vento']);

const buckets = [0, 0, 0, 0, 0, 0, 0]; // <=5, 6-10, 11-15, 16-20, 21-30, 31-40, >40(limit)
let total = 0, limitHits = 0;
for (const level of [10, 14, 18, 22, 30]) {
  const player = mkPlayer(level, LOADOUT, TALENTS);
  const pc = buildPlayerCombatant(player);
  const fighter = fighterForRound(2, 1); // Irmãs do Gelo (semi)
  const enemy = buildTournamentOpponent(fighter, pc, 2);
  for (let seed = 0; seed < 400; seed++) {
    const sim = simulateBattle(pc, enemy, { playerStartHp: pc.maxHp, rng: makeRng(seed * 104729 + level) });
    total++;
    const rounds = sim.rounds[sim.rounds.length - 1]?.round ?? 0;
    const entries = sim.rounds.length;
    if (sim.playerEndHp > 0 && sim.enemyEndHp > 0) { limitHits++; buckets[6]++; }
    else if (rounds <= 5) buckets[0]++;
    else if (rounds <= 10) buckets[1]++;
    else if (rounds <= 15) buckets[2]++;
    else if (rounds <= 20) buckets[3]++;
    else if (rounds <= 30) buckets[4]++;
    else buckets[5]++;
    void entries;
  }
}
console.log('=== SEMIFINAL (Irmãs do Gelo) com loadout realista ===');
console.log(`<=5: ${buckets[0]} | 6-10: ${buckets[1]} | 11-15: ${buckets[2]} | 16-20: ${buckets[3]} | 21-30: ${buckets[4]} | 31+: ${buckets[5]} | LIMITE(40): ${buckets[6]}`);
console.log(`total ${total}, no limite: ${((limitHits / total) * 100).toFixed(1)}%`);
