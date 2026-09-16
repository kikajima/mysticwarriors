/**
 * REPRODUÇÃO DO BUG RELATADO — luta termina na rodada 20 com ambos vivos.
 * Cenário do dono: jogador 199/280 (71%), inimiga 176/276 (64%) → DERROTA?
 *
 * Roda o torneio (semi: powerMult 0.95, Irmãs do Gelo) com guerreiros
 * realistas de vários níveis e verifica:
 *  1. frequência do limite de rodadas;
 *  2. o que o desempate decide nesses casos (ratio correto?);
 *  3. casos onde o perdedor tinha MAIS HP % que o vencedor (bug!).
 */
import { simulateBattle, buildPlayerCombatant, makeRng } from '../src/lib/game/engine';
import type { Player } from '@prisma/client';
import { fighterForRound, buildTournamentOpponent } from '../src/lib/game/content/tournament';

function mkPlayer(level: number, over: Partial<Player> = {}): Player {
  const base = Math.floor(level * 2.2);
  const p = {
    id: 'x',
    createdAt: new Date(),
    updatedAt: new Date(),
    accountId: null,
    activeForAccountId: null,
    name: 'Rei Taurion',
    race: 'humano',
    level,
    xp: 0,
    zeni: 0,
    crystals: 0,
    hp: 80 + level * 15 + base * 5,
    energy: 100,
    strength: base,
    ki: base,
    speed: base,
    defense: base,
    techniqueXp: 0,
    strategy: 'balanced',
    loadout: '[]',
    items: '[]',
    inventory: '[]',
    equipped: '[]',
    transformation: null,
    talents: '[]',
    cosmeticsEquipped: null,
    ownedCosmetics: '[]',
    avatarUrl: null,
    battlesWon: 0,
    battlesLost: 0,
    pvpWins: 0,
    tournament: null,
    tournamentTitles: 0,
    tournamentRoundWins: 0,
    dragonBalls: 0,
    shenronWishes: 0,
    trainingsDone: 0,
    missionsDone: 0,
    zenkaiCount: 0,
    miracleWins: 0,
    davidWins: 0,
    lastZenkaiAt: null,
    lastZenkaiOpponentId: null,
    lastDailyAt: null,
    lastWeeklyAt: null,
    guildId: null,
    guildRole: null,
    profession: null,
    professionXp: 0,
    lastFarmAt: null,
    gameMeta: null,
    ...over,
  } as unknown as Player;
  return p;
}

const LEVELS = [10, 12, 14, 16, 18, 20, 25, 30];
const SEEDS = 300;
let total = 0;
let limitRounds = 0;
let bugCases = 0;
let sampleShown = 0;

for (const level of LEVELS) {
  const player = mkPlayer(level);
  const pc = buildPlayerCombatant(player);
  const fighter = fighterForRound(2, 1); // SEMIFINAL — Irmãs do Gelo (❄)
  const enemy = buildTournamentOpponent(fighter, pc, 2);
  for (let seed = 0; seed < SEEDS; seed++) {
    const startHp = pc.maxHp; // entra cheio (cenário mais comum da semi)
    const sim = simulateBattle(pc, enemy, { playerStartHp: startHp, rng: makeRng(seed * 7919 + level) });
    total++;
    const lastRoundNo = sim.rounds[sim.rounds.length - 1]?.round ?? 0;
    const hitLimit =
      sim.playerEndHp > 0 && sim.enemyEndHp > 0 && lastRoundNo >= 20;
    if (hitLimit) {
      limitRounds++;
      const pRatio = sim.playerEndHp / sim.playerMaxHp;
      const eRatio = sim.enemyEndHp / sim.enemyMaxHp;
      const loserHadMorePct = !sim.won && pRatio > eRatio;
      const loserHadMoreAbs = !sim.won && sim.playerEndHp > sim.enemyEndHp;
      if (loserHadMorePct || loserHadMoreAbs) {
        bugCases++;
        if (sampleShown < 5) {
          sampleShown++;
          console.log(
            `BUG? nv${level} seed${seed}: R${lastRoundNo} → ${sim.won ? 'VITÓRIA' : 'DERROTA'} ` +
              `player ${sim.playerEndHp}/${sim.playerMaxHp} (${(pRatio * 100).toFixed(0)}%) ` +
              `enemy ${sim.enemyEndHp}/${sim.enemyMaxHp} (${(eRatio * 100).toFixed(0)}%)`
          );
        }
      } else if (sampleShown < 5) {
        sampleShown++;
        console.log(
          `limite nv${level} seed${seed}: R${lastRoundNo} → ${sim.won ? 'VITÓRIA' : 'DERROTA'} ` +
            `player ${sim.playerEndHp}/${sim.playerMaxHp} (${(pRatio * 100).toFixed(0)}%) ` +
            `enemy ${sim.enemyEndHp}/${sim.enemyMaxHp} (${(eRatio * 100).toFixed(0)}%)`
        );
      }
    }
  }
}

console.log(`\n=== RESULTADO ===`);
console.log(`total: ${total}, limite de rodadas: ${limitRounds} (${((limitRounds / total) * 100).toFixed(1)}%)`);
console.log(`casos com perdedor tendo MAIS HP (bug do desempate): ${bugCases}`);
