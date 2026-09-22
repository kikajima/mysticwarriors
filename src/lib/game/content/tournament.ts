import type { Combatant, RaceCombatDef } from '../types';
import { getStrategy } from './techniques';
import { xpToNextLevel } from './world';

// =====================================================================
// TORNEIO DE ARTES MARCIAIS (v0.9.18)
// ---------------------------------------------------------------------
// A chave de 8 do Grande Torneio: o jogador encara QUARTAS → SEMIFINAL →
// GRANDE FINAL contra lutadores de elite escalados PELO PRÓPRIO PODER dele
// (elástico — nunca fica trivial nem impossível com o progression).
//
// REGRAS CENTRAIS:
//  * eliminação direta: 1 derrota encerra a campanha;
//  * a VIDA CARREGA entre as lutas (drama do mangá: chegar machucado
//    na final é o preço de curar com Créditos no meio do caminho);
//  * cada luta custa energia como qualquer batalha;
//  * após o fim da campanha (título ou eliminação) começa um COOLDOWN
//    — a premiação é alta e não pode ser triturada em spam.
//
// O estado vive em Player.tournament (JSON aditivo); títulos e vitórias
// de rodada são colunas contáveis (métricas de conquistas).
//
// Tudo aqui é 100% PURO (sem db, sem rng) — a engine decide a luta.
// =====================================================================

/**
 * Duração do cooldown entre campanhas (ms).
 *
 * v0.9.24 (C1) — 15min → 30min para controlar a frequência econômica.
 * v0.9.25 — o torneio deixa de conceder cristais e passa a escalar Créditos
 * com o nível do guerreiro; o cooldown continua sendo a trava de frequência.
 */
export const TOURNAMENT_COOLDOWN_MS = 30 * 60_000;

/**
 * v0.9.24 (C1) — TAXA DE INSCRIÇÃO do comitê: cobrada UMA vez por
 * campanha (na luta de abertura, Quartas). Eliminado na estreia paga a
 * taxa e leva só o XP de consolação — risco de entrar no ringue.
 * Sunk cost consciente: mantém o clímax rewarding sem tornar a
 * atividade spam-ável gratuita.
 */
export const TOURNAMENT_ENTRY_FEE = 200;

export interface TournamentFighter {
  id: string;
  name: string;
  emoji: string;
  taunt: string;
  /** apelido de ringue exibido no card da luta */
  epithet: string;
  /** viés de distribuição do poder (multiplicadores sobre a base escalada) */
  bias: { atk: number; ki: number; spd: number; def: number };
  /** gradiente tailwind do card do lutador */
  color: string;
}

// ===== ELENCO FIXO DO TORNEIO (chave de 8: jogador + 7 lutadores) =====
// A rotação por runCount faz campanhas consecutivas pegarem "caras"
// diferentes em cada rodada — o elenco é fixo, os confrontos não.

export const QUARTAS_FIGHTERS: TournamentFighter[] = [
  {
    id: 'kuma',
    name: 'Mestre Kuma',
    emoji: '🐻',
    epithet: 'O Punho da Montanha',
    taunt: '"Trinta anos treinando nas montanhas. Você treina há quanto tempo... trinta dias?" — ele flete os dedos como patas',
    bias: { atk: 1.05, ki: 0.8, spd: 0.9, def: 1.1 },
    color: 'from-amber-800 to-yellow-950',
  },
  {
    id: 'tigre',
    name: 'Tigre de Ferro',
    emoji: '🐅',
    epithet: 'A Garra do Vale',
    taunt: '"ROAAAR!" — as unhas de aço raspam o chão da arena',
    bias: { atk: 1.15, ki: 0.7, spd: 1.0, def: 0.95 },
    color: 'from-orange-800 to-red-950',
  },
  {
    id: 'vera',
    name: 'Vera Vento',
    emoji: '🌪️',
    epithet: 'A Dança do Vendaval',
    taunt: '"Me vê pegar!" — ela já não está mais onde você olhou',
    bias: { atk: 0.9, ki: 0.95, spd: 1.25, def: 0.9 },
    color: 'from-teal-700 to-cyan-950',
  },
];

export const SEMI_FIGHTERS: TournamentFighter[] = [
  {
    id: 'ronin',
    name: 'Ronin Blade',
    emoji: '🗡️',
    epithet: 'O Cortador de Sombras',
    taunt: '"Minha lâmina corta o vento. O que faz você achar que corta eu não?" — o aço nem brilha de tão afiado',
    bias: { atk: 1.1, ki: 0.9, spd: 1.1, def: 0.95 },
    color: 'from-slate-700 to-slate-950',
  },
  {
    id: 'gelo',
    name: 'Irmãs do Gelo',
    emoji: '❄️',
    epithet: 'A Dupla Sincronizada',
    taunt: '"Duas mentes, um coração gelado..." — o ar congela onde elas pisam',
    bias: { atk: 0.95, ki: 1.15, spd: 1.0, def: 1.05 },
    color: 'from-sky-700 to-blue-950',
  },
  {
    id: 'sombra',
    name: 'Sombra Silente',
    emoji: '🌙',
    epithet: 'Aquilo que Bate Sem Avisar',
    taunt: '"..." — você tem certeza de que ele piscou os olhos?',
    bias: { atk: 1.0, ki: 1.05, spd: 1.15, def: 0.9 },
    color: 'from-violet-800 to-purple-950',
  },
];

export const FINAL_FIGHTERS: TournamentFighter[] = [
  {
    id: 'varnil',
    name: 'Grão-Mestre Varnil',
    emoji: '👑',
    epithet: 'O Defensor do Cinturão',
    taunt: '"Este cinturão passou por doze desafiantes em doze anos. Você é o décimo terceiro prato." — ele nem levanta da poltrona',
    // muro defensivo: tanque calibrado (viés médio ~+3%)
    bias: { atk: 1.04, ki: 1.04, spd: 1.0, def: 1.06 },
    color: 'from-yellow-600 to-amber-900',
  },
  {
    id: 'yurika',
    name: 'Campeã Yurika',
    emoji: '⚡',
    epithet: 'A Imperadora do Ringue',
    taunt: '"Meu reinado começou antes de você aprender a dar pontapé. Ele termina DEPOIS de você." — o ringue range sob o pé dela',
    // striker agressiva: golpe forte, defesa exposta (viés médio ~+2%)
    bias: { atk: 1.07, ki: 1.05, spd: 1.03, def: 0.92 },
    color: 'from-fuchsia-700 to-rose-950',
  },
];

export function fightersForRound(round: number): TournamentFighter[] {
  if (round === 1) return QUARTAS_FIGHTERS;
  if (round === 2) return SEMI_FIGHTERS;
  return FINAL_FIGHTERS;
}

/** Confronto da rodada — determinístico por (rodada, nº da campanha). */
export function fighterForRound(round: number, runCount: number): TournamentFighter {
  const cast = fightersForRound(round);
  return cast[runCount % cast.length];
}

// ===== RODADAS: força do adversário e premiação =====

export interface TournamentRoundDef {
  round: number;
  /** fase curta (badge) */
  short: string;
  /** nome da fase */
  name: string;
  /** multiplicador do PODER DO ADVERSÁRIO sobre o poder atual do jogador */
  powerMult: number;
  /** Créditos-base da rodada no patamar de referência (Nv. 10). */
  zeniBase: number;
  /** fração do XP exigido pelo nível ATUAL do jogador. */
  xpPct: number;
}

export const TOURNAMENT_REWARD_REFERENCE_LEVEL = 10;

export const TOURNAMENT_ROUNDS: TournamentRoundDef[] = [
  // v0.9.25 — os valores de Créditos abaixo são a BASE no nível 10.
  // A recompensa real cresce com o nível pela função tournamentCréditosReward.
  // Cristais foram removidos completamente da premiação direta do torneio.
  { round: 1, short: 'Quartas', name: 'Quartas de Final', powerMult: 0.82, zeniBase: 150, xpPct: 0.12 },
  { round: 2, short: 'Semifinal', name: 'Semifinal', powerMult: 0.95, zeniBase: 400, xpPct: 0.18 },
  // calibração (grind 200 seeds): a final é um duelo PAR — o viés do
  // campeão defensor (+6% médio) já é a vantagem dele; ×1.10 em cima
  // tornava a final quase impossível (8% de vitória entrando cheio)
  { round: 3, short: 'Final', name: 'GRANDE FINAL', powerMult: 1.0, zeniBase: 800, xpPct: 0.3 },
];

export function roundDef(round: number): TournamentRoundDef {
  return TOURNAMENT_ROUNDS[Math.min(Math.max(1, round), 3) - 1];
}

/**
 * Créditos exato da rodada no nível atual.
 *
 * O patamar Nv. 10 preserva o balanceamento anterior (150/400/800).
 * Acima dele, a renda cresce de forma moderada (expoente 1,25):
 * acompanha o encarecimento do jogo sem explodir tão rápido quanto a curva
 * de treino. Abaixo do Nv. 10, o piso 1× protege o iniciante da taxa de
 * inscrição e mantém o torneio relevante desde o começo.
 */
export function tournamentCréditosReward(round: number, playerLevel: number): number {
  const level = Math.max(1, Math.trunc(Number(playerLevel) || 1));
  const levelFactor = Math.max(1, Math.pow(level / TOURNAMENT_REWARD_REFERENCE_LEVEL, 1.25));
  return Math.max(1, Math.round(roundDef(round).zeniBase * levelFactor));
}

/** XP exato da premiação da rodada (fração do XP do nível atual). */
export function tournamentXpReward(round: number, playerLevel: number): number {
  const level = Math.max(1, Math.trunc(Number(playerLevel) || 1));
  return Math.max(1, Math.ceil(xpToNextLevel(level) * roundDef(round).xpPct));
}

export interface TournamentRewards {
  zeni: number;
  xp: number;
  /** true quando a vitória vale o TÍTULO de campeão (final) */
  title: boolean;
}

/** Premiação por vencer a rodada N no nível dado. */
export function tournamentRewards(round: number, playerLevel: number): TournamentRewards {
  return {
    zeni: tournamentCréditosReward(round, playerLevel),
    xp: tournamentXpReward(round, playerLevel),
    title: round === 3,
  };
}

// ===== ESTADO DA CAMPANHA (JSON em Player.tournament) =====

export interface TournamentState {
  /** rodada da PRÓXIMA luta: 1 quartas, 2 semi, 3 final; 0 = fora de campanha */
  round: number;
  /** vitórias na campanha atual */
  wins: number;
  /** nº da campanha (rotação do elenco + estatística) */
  runCount: number;
  /** melhor rodada alcançada em QUALQUER campanha (0 = nunca jogou) */
  bestRound: number;
  /** ISO timestamp do fim da última campanha (gatel de cooldown) */
  lastRunAt: string | null;
}

const EMPTY_STATE: TournamentState = {
  round: 0,
  wins: 0,
  runCount: 0,
  bestRound: 0,
  lastRunAt: null,
};

/** Parse tolerante a lixo/ausência — NUNCA lança. */
export function parseTournament(raw: string | null | undefined): TournamentState {
  if (!raw) return { ...EMPTY_STATE };
  try {
    const data = JSON.parse(raw) as Partial<TournamentState>;
    return {
      round: Number.isFinite(data.round) ? Math.min(3, Math.max(0, Math.floor(data.round as number))) : 0,
      wins: Number.isFinite(data.wins) ? Math.max(0, Math.floor(data.wins as number)) : 0,
      runCount: Number.isFinite(data.runCount) ? Math.max(0, Math.floor(data.runCount as number)) : 0,
      bestRound: Number.isFinite(data.bestRound) ? Math.min(3, Math.max(0, Math.floor(data.bestRound as number))) : 0,
      lastRunAt: typeof data.lastRunAt === 'string' ? data.lastRunAt : null,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function serializeTournament(state: TournamentState): string {
  return JSON.stringify({
    round: state.round,
    wins: state.wins,
    runCount: state.runCount,
    bestRound: state.bestRound,
    lastRunAt: state.lastRunAt,
  });
}

// ===== TRANSIÇÕES PURAS =====

export function startRun(state: TournamentState): TournamentState {
  return { ...state, round: 1, wins: 0, runCount: state.runCount + 1 };
}

/**
 * Transição após a luta da rodada `round`:
 *  * vitória na final → campanha encerrada COM título (chamador soma a coluna);
 *  * vitória nas outras → avança para a próxima rodada;
 *  * derrota → campanha encerrada sem título.
 * Ambos os fins de campanha registram lastRunAt (cooldown) e bestRound.
 */
export function advanceTournament(state: TournamentState, round: number, won: boolean, now: Date): TournamentState {
  const best = Math.max(state.bestRound, won ? round : round - 1);
  if (!won) {
    return { ...state, round: 0, wins: state.wins, bestRound: best, lastRunAt: now.toISOString() };
  }
  if (round >= 3) {
    return { ...state, round: 0, wins: state.wins + 1, bestRound: 3, lastRunAt: now.toISOString() };
  }
  return { ...state, round: round + 1, wins: state.wins + 1, bestRound: best };
}

/** Cooldown restante (ms) para poder iniciar nova campanha. */
export function tournamentCooldownRemainingMs(state: TournamentState, now: Date): number {
  if (state.round > 0 || !state.lastRunAt) return 0;
  const end = Date.parse(state.lastRunAt) + TOURNAMENT_COOLDOWN_MS;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - now.getTime());
}

export interface TournamentFightCheck {
  ok: boolean;
  reason?: string;
  /** estado já com a campanha aberta (round=1) quando a luta for de abertura */
  stateToFight?: TournamentState;
  /** rodada que será lutada */
  round?: number;
}

/**
 * Valida a intenção de lutar no torneio AGORA:
 *  * round > 0 → luta da rodada atual;
 *  * round = 0 → precisa do cooldown vencido; abre nova campanha (round 1).
 */
export function validateTournamentFight(state: TournamentState, now: Date): TournamentFightCheck {
  if (state.round > 0) {
    return { ok: true, stateToFight: state, round: state.round };
  }
  const remaining = tournamentCooldownRemainingMs(state, now);
  if (remaining > 0) {
    const min = Math.ceil(remaining / 60_000);
    return {
      ok: false,
      reason: `O comitê do torneio está reorganizando a chave — nova inscrição em ${min} minuto${min > 1 ? 's' : ''}.`,
    };
  }
  const opened = startRun(state);
  return { ok: true, stateToFight: opened, round: opened.round };
}

// ===== ADVERSÁRIO (elástico sobre o combatente ATUAL do jogador) =====

/** Combate racial NEUTRO — espelha o NEUTRAL_COMBAT da rules (mesmo papel
 * dos NPCs de PvE: bônus raciais são privilégio dos guerreiros). */
const NEUTRAL: RaceCombatDef = {
  physicalDamageMult: 1,
  kiDamageMult: 1,
  defenseMult: 1,
  dodgeBonus: 0,
  speedMult: 1,
  kiAttackChanceBonus: 0,
  absorbOnWinPct: 0,
};

/**
 * Constrói o combatente do lutador do torneio a partir do combatente REAL
 * do jogador (com equipamentos, transformação, talentos...):
 *  * o poder base escala pelo multiplicador da rodada;
 *  * o viés do lutador re-distribui o poder (tanque, velocista, usurário de Ki);
 *  * SEM técnicas e SEM talentos — a vantagem de recursos é do jogador;
 *    a vantagem NUMÉRICA é do campeão defensor.
 */
export function buildTournamentOpponent(fighter: TournamentFighter, player: Combatant, round: number): Combatant {
  const def = roundDef(round);
  const m = def.powerMult;
  const b = fighter.bias;
  const round2 = (x: number) => Math.max(1, Math.round(x));
  const strength = round2(player.strength * m * (b.atk * 0.5 + 0.5));
  const ki = round2(player.ki * m * (b.ki * 0.5 + 0.5));
  const defense = round2(player.defense * m * (b.def * 0.5 + 0.5));
  const speed = round2(player.speed * m * (b.spd * 0.5 + 0.5));
  const atkPower = round2(player.atkPower * m * b.atk);
  const kiPower = round2(player.kiPower * m * b.ki);
  const defPower = round2(player.defPower * m * b.def);
  const resPower = round2(player.resPower * m * b.def);
  const maxHp = round2((80 + player.level * 15 + defense * 5) * (0.9 + 0.1 * b.def));
  // nível "de ringue": próximo ao do jogador (a Armadura de Escala compara
  // o PODER, não o nível, mas o card e o log ficam coerentes)
  const level = Math.max(1, Math.round(player.level * m));
  // poder do visor de fluxo proporcional à ameaça real construída
  const power = round2((player.power * m * (b.atk + b.ki + b.def + b.spd)) / 4);
  const battleKi = 40 + ki * 4;
  return {
    name: fighter.name,
    emoji: fighter.emoji,
    level,
    race: 'none',
    strength,
    defense,
    speed,
    ki,
    maxHp,
    atkPower,
    kiPower,
    defPower,
    resPower,
    power,
    raceCombat: NEUTRAL,
    techniques: [],
    strategy: getStrategy('balanced'),
    maxBattleKi: battleKi,
    battleKi,
    transformation: null,
  };
}
