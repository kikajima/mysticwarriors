import { playerGuildBonuses, type GuildContext } from './guildRules';
import { MAX_ACTION_ENERGY } from '@/lib/game/rules';
import { db } from '@/lib/db';
import type { Prisma, Player } from '@prisma/client';
import { ApiError } from '@/lib/api';
import {
  ENEMIES,
  PROFESSIONS,
  getProfession,
  REGEN,
  getItem,
  npcCombatPower,
  xpToNextLevel,
} from './content/world';
import { getTechnique, getStrategy, slotsForCategory } from './content/techniques';
import { getTransformation } from './content/transformations';
import { BOTS } from './content/names';
import { parseCosmeticsEquipped } from './content/cosmetics';
import { parseTalents } from './content/talents';
import { parseTournament, tournamentCooldownRemainingMs } from './content/tournament';
import {
  parseProfessions as parseProfessionsCareer,
  serializeProfessions as serializeProfessionsCareer,
  professionLevelDef,
  professionXpPerHour,
} from './professionCareer';
import { raceCombat, raceEconomy, ACTIVITY_DURATION, dayKey } from './rules';
import { scaleCombatRules, aberturaChance, SCALE_COMBAT, scaleDiff } from './powerScale';
import { IMPETO, IMPETO_COMBO_THRESHOLD, clampImpeto, isHeavyBlow, effectiveScalePower } from './impeto';
import { activityToView } from './activities';
import { EQUIPMENT_SLOTS } from './types';
import type {
  BattleRound,
  BattleSimulation,
  Combatant,
  DerivedStats,
  ItemsState,
  Loadout,
  PlayerView,
  ProfessionsMap,
  RaceId,
  StrategyDef,
  TechniqueDef,
  TournamentView,
} from './types';
import type { Activity as ActivityEntity } from '@prisma/client';

// =====================================================================
// ENGINE DE COMBATE v2
// ---------------------------------------------------------------------
// * Ataques FÍSICOS escalam de Força + arma; ataques de ENERGIA escalam
//   de Ki + acessórios — Força deixou de ser obrigatória;
// * Defesa física (Defesa) e resistência de energia (Defesa + Ki);
// * Bônus raciais SIMÉTRICOS: valem para qualquer combatente, atacando
//   ou defendendo;
// * Empate de velocidade → 50/50 (sem vantagem para quem iniciou o PvP);
// * Técnicas vêm do LOADOUT equipado e consomem Ki de batalha;
// * Estratégia influencia as decisões automáticas, sem garantir vitória;
// * O resultado devolve TODOS os valores de HP (start/end/max) — a UI
//   nunca recalcula HP máximo por conta própria.
// =====================================================================

// ===== Parsing de estado (campos JSON) =====

export function parseItems(raw: string): ItemsState {
  try {
    const parsed = JSON.parse(raw);
    const owned: string[] = Array.isArray(parsed.owned)
      ? Array.from(new Set(parsed.owned.filter((i: unknown) => typeof i === 'string') as string[]))
      : [];
    // v0.9.10: stacks de equipamento/treino — quantidades por id. Só faz
    // sentido para ids presentes em owned; valores inválidos são descartados
    // e o mapa é sempre consistente (id ausente de owned = sem stack).
    const stacksSrc = parsed.stacks && typeof parsed.stacks === 'object' && !Array.isArray(parsed.stacks) ? parsed.stacks : {};
    const stacks: Record<string, number> = {};
    for (const [id, qty] of Object.entries(stacksSrc as Record<string, unknown>)) {
      const n = typeof qty === 'number' && Number.isFinite(qty) ? Math.floor(qty) : 0;
      if (owned.includes(id) && n >= 2 && n <= 999) stacks[id] = n; // 1 = implícito (sem entrada)
    }
    const pickSlot = (key: string): string | null => {
      const id = parsed[key];
      if (typeof id !== 'string' || !owned.includes(id)) return null;
      const item = getItem(id);
      return item?.category === key ? id : null;
    };
    return {
      weapon: pickSlot('weapon'),
      armor: pickSlot('armor'),
      accessory: pickSlot('accessory'),
      head: pickSlot('head'),
      wrists: pickSlot('wrists'),
      legs: pickSlot('legs'),
      boots: pickSlot('boots'),
      owned,
      consumables: parsed.consumables && typeof parsed.consumables === 'object' ? parsed.consumables : {},
      stacks,
    };
  } catch {
    return { weapon: null, armor: null, accessory: null, head: null, wrists: null, legs: null, boots: null, owned: [], consumables: {}, stacks: {} };
  }
}

/** v0.9.10: unidades totais de um equipamento/treino no inventário
 *  (stacks explícitas ou posse simples legado = 1). */
export function itemCount(items: ItemsState, id: string): number {
  return items.stacks[id] ?? (items.owned.includes(id) ? 1 : 0);
}

/** v0.9.10: aplica uma compra de N unidades de equipamento/treino ao
 *  estado do inventário (puro — testável). O caller persiste o resultado. */
export function applyEquipmentBuy(items: ItemsState, id: string, quantity: number): ItemsState {
  const before = itemCount(items, id); // contar ANTES de alterar owned
  if (before === 0) items.owned.push(id);
  const total = Math.min(999, before + quantity);
  if (total >= 2) items.stacks[id] = total;
  else delete items.stacks[id];
  return items;
}

/** v0.9.10: remove N unidades de equipamento/treino do inventário.
 *  Retorna false se não há unidades suficientes (caller deve abortar). */
export function applyEquipmentSell(items: ItemsState, id: string, quantity: number): boolean {
  const total = itemCount(items, id);
  if (quantity <= 0 || total < quantity) return false;
  const left = total - quantity;
  if (left >= 2) items.stacks[id] = left;
  else {
    delete items.stacks[id];
    if (left <= 0) {
      const idx = items.owned.indexOf(id);
      if (idx >= 0) items.owned.splice(idx, 1);
    }
  }
  return true;
}

export function parseTechniques(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function parseLoadout(raw: string): Loadout {
  try {
    const parsed = JSON.parse(raw);
    return {
      '1': typeof parsed['1'] === 'string' ? parsed['1'] : null,
      '2': typeof parsed['2'] === 'string' ? parsed['2'] : null,
      '3': typeof parsed['3'] === 'string' ? parsed['3'] : null,
      S: typeof parsed.S === 'string' ? parsed.S : null,
    };
  } catch {
    return { '1': null, '2': null, '3': null, S: null };
  }
}

export function parseTransformationsOwned(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function emptyLoadout(): Loadout {
  return { '1': null, '2': null, '3': null, S: null };
}

/** Técnicas do loadout que o jogador realmente aprendeu (o servidor valida no equip). */
export function loadoutTechniques(player: Pick<Player, 'techniques' | 'loadout'>): TechniqueDef[] {
  const learned = new Set(parseTechniques(player.techniques));
  const loadout = parseLoadout(player.loadout);
  const ids = [loadout['1'], loadout['2'], loadout['3'], loadout.S].filter((id): id is string => !!id && learned.has(id));
  return ids.map((id) => getTechnique(id)).filter((t): t is TechniqueDef => Boolean(t));
}

/** Valida se uma técnica pode ser equipada em um slot (categoria → slots permitidos). */
export function canEquipInSlot(tech: TechniqueDef, slot: keyof Loadout): boolean {
  return slotsForCategory(tech.category).includes(slot as '1' | '2' | '3' | 'S');
}

// ===== Bônus de equipamento =====

function equipmentBonuses(items: ItemsState) {
  let atk = 0;
  let def = 0;
  let spd = 0;
  let ki = 0;
  for (const slot of EQUIPMENT_SLOTS) {
    const id = items[slot] ?? null;
    if (!id) continue;
    const item = getItem(id);
    if (!item) continue;
    atk += item.atk ?? 0;
    def += item.def ?? 0;
    spd += item.spd ?? 0;
    ki += item.ki ?? 0;
  }
  return { atk, def, spd, ki };
}

// ===== Stats derivados =====

export function computeDerived(player: Player): DerivedStats {
  const items = parseItems(player.items);
  const eq = equipmentBonuses(items);
  const rc = raceCombat(player.race);
  const tr = player.transformationId ? getTransformation(player.transformationId) : null;
  const tm = tr?.multipliers;

  const maxHp = 80 + player.level * 15 + player.defense * 5;
  const maxEnergy = MAX_ACTION_ENERGY;
  const atkPower = Math.round(player.strength * 2.2 * rc.physicalDamageMult * (tm?.physical ?? 1)) + eq.atk;
  const kiPower = Math.round(player.ki * 2.4 * rc.kiDamageMult * (tm?.ki ?? 1)) + eq.ki;
  const defPower = Math.round(player.defense * 1.8 * rc.defenseMult * (tm?.defense ?? 1)) + eq.def;
  const resPower = Math.round((player.defense * 1.1 + (player.ki + eq.ki) * 0.9) * rc.defenseMult * (tm?.defense ?? 1));
  const speedTotal = Math.round((player.speed + eq.spd) * rc.speedMult * (tm?.speed ?? 1));
  const power = Math.round(
    player.level * 15 + atkPower + kiPower * 0.9 + defPower + resPower * 0.6 + speedTotal * 2
  );
  return { maxHp, maxEnergy, atkPower, kiPower, defPower, resPower, power };
}

// ===== Progresso de profissões =====
// Implementação pura vive em professionCareer.ts; reexport mantido para
// compatibilidade de imports históricos.
export { parseProfessions, serializeProfessions } from './professionCareer';

// ===== View para o cliente =====

/**
 * v0.9.6 (Mudança 3): a posse de cosméticos mora na PRÓPRIA linha do
 * personagem (Player.cosmeticsOwned, JSON [id]) — não existe mais include
 * de conta para popular a view. A antiga constante foi REMOVIDA; as rotas
 * que a espalhavam no `include` foram simplificadas.
 */

/** Parse do JSON de cosméticos possuídos (Player.cosmeticsOwned). */
export function parseCosmeticsOwned(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === 'string').slice(0, 100);
  } catch {
    return [];
  }
}

/** v0.9.18 — visão do Torneio de Artes Marciais para o cliente. */
function tournamentPlayerView(player: Player): TournamentView {
  const state = parseTournament(player.tournament);
  const cooldownMs = tournamentCooldownRemainingMs(state, new Date());
  return {
    round: state.round,
    wins: state.wins,
    runCount: state.runCount,
    bestRound: state.bestRound,
    titles: player.tournamentTitles,
    roundWins: player.tournamentRoundWins,
    cooldownEndsAt: cooldownMs > 0 ? new Date(Date.now() + cooldownMs).toISOString() : null,
  };
}

export function playerToView(
  player: Player & {
    guild?: { id: string; name: string; leaderId: string; level: number } | null;
    activities?: ActivityEntity[];
  },
  rankingPosition?: number | null
): PlayerView {
  const derived = computeDerived(player);
  const guild = player.guild ?? null;
  const tr = player.transformationId ? getTransformation(player.transformationId) : null;
  // atividade em andamento (treino/batalha) — mesma fonte do servidor
  const runningActivityEntity = (player.activities ?? []).find(
    (a) => a.completedAt === null && a.endsAt.getTime() > Date.now()
  );
  // intervalos de regeneração com bônus racial (mesma fórmula do applyRegen).
  // SEM arredondamento: com base 5s, round(5/1.1)=5 anularia o bônus de 10%
  // do humano — o cálculo floor(elapsed/int) funciona com intervalos fracionários
  const econ = raceEconomy(player.race);
  const energyIntervalSec = Math.max(1, REGEN.energySeconds / (econ.energyRegenMult * playerGuildBonuses(player).energyRate));
  const hpIntervalSec = Math.max(1, REGEN.hpSeconds / (econ.hpRegenMult * playerGuildBonuses(player).hpRate));
  // UNIFICAÇÃO (v0.4): o servidor é a fonte única da interpretação de
  // missão — "ativa" = timer ainda correndo; "pronta" = terminou, falta
  // coletar. A UI nunca decide isso sozinha.
  const missionRunning =
    !!player.missionId && !!player.missionEndsAt && player.missionEndsAt.getTime() > Date.now();
  const missionClaimable = !!player.missionId && !!player.missionEndsAt && !missionRunning;
  // v0.6: progresso nas profissões (rank/completions por professionId)
  const professions = parseProfessionsCareer(player.professions);
  return {
    id: player.id,
    name: player.name,
    race: player.race as RaceId,
    avatarUrl: player.avatarUrl ?? null,
    level: player.level,
    xp: player.xp,
    xpToNext: xpToNextLevel(player.level),
    zeni: player.zeni,
    crystals: player.crystals,
    hp: Math.min(player.hp, derived.maxHp),
    energy: Math.min(player.energy, derived.maxEnergy),
    strength: player.strength,
    defense: player.defense,
    speed: player.speed,
    ki: player.ki,
    battlesWon: player.battlesWon,
    battlesLost: player.battlesLost,
    missionsDone: player.missionsDone,
    dragonBalls: player.dragonBalls,
    items: parseItems(player.items),
    techniques: parseTechniques(player.techniques),
    loadout: parseLoadout(player.loadout),
    strategy: (player.strategy as PlayerView['strategy']) || 'balanced',
    transformation: tr ? { id: tr.id, name: tr.name, icon: tr.icon } : null,
    transformationsOwned: parseTransformationsOwned(player.transformationsOwned),
    guild: guild ? { id: guild.id, name: guild.name, isLeader: guild.leaderId === player.id, level: guild.level } : null,
    // ATIVA somente com timer correndo; coletável é campo próprio
    activeMission:
      missionRunning && player.missionId && player.missionEndsAt
        ? {
            missionId: player.missionId,
            startedAt: (player.missionStartedAt ?? new Date(player.missionEndsAt.getTime() - (player.missionHours ?? 1) * 3600_000)).toISOString(),
            endsAt: player.missionEndsAt.toISOString(),
            hours: ([1, 2, 4, 8].includes(player.missionHours ?? 1) ? (player.missionHours ?? 1) : 1) as 1 | 2 | 4 | 8,
          }
        : null,
    claimableMission:
      missionClaimable && player.missionId
        ? {
            missionId: player.missionId,
            hours: ([1, 2, 4, 8].includes(player.missionHours ?? 1) ? (player.missionHours ?? 1) : 1) as 1 | 2 | 4 | 8,
          }
        : null,
    professions,
    runningActivity: runningActivityEntity ? activityToView(runningActivityEntity) : null,
    // v0.9.6 (Mudança 3): posse e equipar são AMBOS do personagem —
    // cada guerreiro tem a própria coleção de cosméticos comprados
    cosmetics: {
      owned: parseCosmeticsOwned(player.cosmeticsOwned),
      equipped: parseCosmeticsEquipped(player.cosmeticsEquipped),
    },
    // v0.9.15 — talentos de Ímpeto (Cap. 7) dominados
    talents: parseTalents(player.talents),
    // v0.9.18 — Torneio de Artes Marciais: campanha + palmarés (colunas
    // contáveis vêm direto do registro; o cooldown é derivado do estado)
    tournament: tournamentPlayerView(player),
    derived,
    regen: {
      energyIntervalSec,
      hpIntervalSec,
      lastRegenAt: player.lastRegen.toISOString(),
      lastRegenHpAt: (player.lastRegenHp ?? player.lastRegen).toISOString(),
    },
    isBot: player.isBot,
    rankingPosition: rankingPosition ?? null,
  };
}

// ===== Regeneração por tempo (multiplicadores raciais) =====

/**
 * REGENERACAO COM RELÓGIOS INDEPENDENTES (v0.4):
 *  * Energia usa `lastRegen` (coluna original);
 *  * Vida usa `lastRegenHp` (coluna nova; null = assume o valor de lastRegen
 *    na primeira execução — compatível com dados existentes);
 *  * Cada recurso avança SEU relógio apenas pelos intervalos COMPLETOS
 *    consumidos, preservando a fração restante. O resultado depende só do
 *    tempo transcorrido — não da frequência de consultas (poll de 5s, 15s
 *    ou consulta única produzem o mesmo ganho);
 *  * Recurso CHEIO → relógio acompanha o presente (sem regen retroativo
 *    instantâneo quando o recurso volta a ser gasto);
 *  * Bônus raciais aplicados nos intervalos (fracionários, sem round).
 */
export function applyRegen(player: Player & GuildContext, nowMs: number = Date.now()): boolean {
  const now = nowMs;
  const derived = computeDerived(player);
  const econ = raceEconomy(player.race);
  const eInt = Math.max(1, REGEN.energySeconds / (econ.energyRegenMult * playerGuildBonuses(player).energyRate));
  const hInt = Math.max(1, REGEN.hpSeconds / (econ.hpRegenMult * playerGuildBonuses(player).hpRate));
  let changed = false;
  if (player.energy > derived.maxEnergy) {
    player.energy = derived.maxEnergy;
    changed = true;
  }

  // REFERÊNCIAS CAPTURADAS ANTES de qualquer mutação: o relógio de vida
  // usa lastRegenHp (ou lastRegen ORIGINAL como fallback) — nunca o
  // lastRegen já avançado pelo bloco de energia.
  const eRefMs = player.lastRegen.getTime();
  const hpRefMs = (player.lastRegenHp ?? player.lastRegen).getTime();

  // --- relógio da ENERGIA ---
  const eElapsedMs = now - eRefMs;
  if (eElapsedMs >= eInt * 1000) {
    const eGain = Math.floor(eElapsedMs / (eInt * 1000));
    if (player.energy < derived.maxEnergy) {
      player.energy = Math.min(derived.maxEnergy, player.energy + eGain);
      changed = true;
    }
    // avança APENAS pelos intervalos completos — fração preservada
    player.lastRegen = new Date(eRefMs + Math.floor(eGain * eInt * 1000));
  }
  if (player.energy >= derived.maxEnergy) {
    // cheio: corrige o relógio uma vez; não grava em todo polling.
    if (now - player.lastRegen.getTime() > 1000) {
      player.lastRegen = new Date(now);
      changed = true;
    }
  }

  // --- relógio da VIDA (independente) ---
  // fallback CONGELADO na primeira execução: enquanto o clock de vida é
  // null (dados anteriores à v0.4), ele é fixado na referência ORIGINAL —
  // nunca acompanha o lastRegen que a energia avança entre consultas.
  if (player.lastRegenHp === null) {
    player.lastRegenHp = new Date(hpRefMs);
    changed = true; // persiste o congelamento
  }
  const hElapsedMs = now - hpRefMs;
  if (hElapsedMs >= hInt * 1000) {
    const hGain = Math.floor(hElapsedMs / (hInt * 1000));
    if (player.hp < derived.maxHp) {
      player.hp = Math.min(derived.maxHp, player.hp + hGain);
      changed = true;
    }
    player.lastRegenHp = new Date(hpRefMs + Math.floor(hGain * hInt * 1000));
  }
  if (player.hp >= derived.maxHp) {
    // cheio: corrige o relógio uma vez; não grava em todo polling.
    if (now - (player.lastRegenHp?.getTime() ?? now) > 1000) {
      player.lastRegenHp = new Date(now);
      changed = true;
    }
  }
  return changed;
}

// ===== Construtores de combatentes =====

const BALANCED_STRATEGY = getStrategy('balanced');

export function buildPlayerCombatant(player: Player & GuildContext): Combatant {
  const items = parseItems(player.items);
  const eq = equipmentBonuses(items);
  const rc = raceCombat(player.race);
  const d = computeDerived(player);
  const tr = player.transformationId ? getTransformation(player.transformationId) : null;
  const kiTotal = player.ki + eq.ki;
  return {
    name: player.name,
    emoji: '🥋',
    guildCritical: playerGuildBonuses(player).critical,
    level: player.level,
    race: player.race as RaceId,
    strength: player.strength,
    defense: player.defense,
    speed: Math.round((player.speed + eq.spd) * rc.speedMult * (tr?.multipliers?.speed ?? 1)),
    ki: kiTotal,
    maxHp: d.maxHp,
    atkPower: d.atkPower,
    kiPower: d.kiPower,
    defPower: d.defPower,
    resPower: d.resPower,
    // poder de luta do scouter — alimenta a Armadura de Escala (5.1)
    power: d.power,
    raceCombat: rc,
    techniques: loadoutTechniques(player),
    strategy: getStrategy(player.strategy),
    maxBattleKi: 40 + kiTotal * 4,
    battleKi: 40 + kiTotal * 4,
    transformation: tr ? { name: tr.name, icon: tr.icon, physical: tr.multipliers?.physical ?? 1, ki: tr.multipliers?.ki ?? 1, defense: tr.multipliers?.defense ?? 1, speed: tr.multipliers?.speed ?? 1 } : null,
    // v0.9.15 — talentos dominados alimentam os gastos de 1 Ímpeto do Cap. 7
    talents: parseTalents(player.talents),
  };
}

export function buildNpcCombatant(enemyIdx: number): Combatant {
  const e = ENEMIES[enemyIdx];
  const neutral = raceCombat('humano'); // neutro
  const atkPower = Math.round(e.strength * 2.2);
  const kiPower = Math.round(e.ki * 2.4);
  return {
    name: e.name,
    emoji: e.emoji,
    level: e.level,
    race: 'none',
    strength: e.strength,
    defense: e.defense,
    speed: e.speed,
    ki: e.ki,
    maxHp: 80 + e.level * 15 + e.defense * 5,
    atkPower,
    kiPower,
    defPower: Math.round(e.defense * 1.8),
    resPower: Math.round(e.defense * 1.1 + e.ki * 0.9),
    // poder de luta do scouter — alimenta a Armadura de Escala (5.1)
    power: npcCombatPower(e),
    raceCombat: neutral,
    techniques: [],
    strategy: BALANCED_STRATEGY,
    maxBattleKi: 40 + e.ki * 4,
    battleKi: 40 + e.ki * 4,
    transformation: null,
  };
}

// ===== Simulação de batalha =====

// v0.9.21 (correção 1): 20 → 40. Com 20 rodadas, ~15% das lutas de
// torneio contra oponentes tanques (sem técnicas) terminavam NO LIMITE
// com os dois lados vivos — o dono viu uma derrota declarada com
// 71% × 64% de vida e nenhuma explicação. Com 40 rodadas a medição
// caiu para 0,0% (2.000 sementes × 8 níveis, com e sem loadout): a
// luta típica resolve por NOCAUTE em 11–15 rodadas. O limite vira
// rede de segurança com DECISÃO DOS JURADOS narrada no log.
// EXPORTADOS para o teste de contrato da wiki (a wiki publica estes valores).
export const MAX_ROUNDS = 40;
export const BASIC_ENERGY_KI_COST = 10;

/**
 * PARÂMETROS CENTRAIS DE COMBATE (v0.4) — fonte única consultada por
 * conteúdo, interface e servidor:
 *  * variance ............ variância do golpe (±15%);
 *  * maxMitigationPct .... MITIGAÇÃO MÁXIMA de um golpe como fração do
 *                           poder bruto (soft cap): nenhum tanque anula
 *                           um atacante (retornos marginais decrescentes
 *                           de Defesa; golpes fracos nunca viram 1);
 *  * kiRegenPerRound ..... regeneração de Ki de batalha por rodada;
 *  * Técnicas multiplicam o PODER BRUTO (antes da defesa) — a defesa
 *    participa do cálculo de todo golpe; defensePierce reduz a DEFESA
 *    EFETIVA (antes do cap); o Ki é consumido NO LANÇAMENTO do golpe —
 *    esquiva NÃO devolve Ki (regra anunciada na UI).
 */
export const COMBAT = {
  variance: 0.15,
  maxMitigationPct: 0.8,
  /** coeficientes de defesa (físico/energia) — calibrados para lutas
   *  decididas majoritariamente por KO (~6–9 rodadas) */
  physDefCoef: 0.78,
  energyDefCoef: 0.74,
  kiRegenPerRound: 0.08,
} as const;

export function battleDurationMs(rounds: number): number {
  const ms = ACTIVITY_DURATION.battleBaseMs + rounds * ACTIVITY_DURATION.battlePerRoundMs;
  return Math.min(ACTIVITY_DURATION.battleMaxMs, ms);
}

/**
 * RNG determinístico (mulberry32) para testes e reprodutibilidade.
 * A engine de combate NÃO chama Math.random diretamente: toda a
 * aleatoriedade passa pela fonte `rng` injetada em simulateBattle().
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG de produção: semente criptograficamente segura. */
export function battleRng(): () => number {
  return makeRng(randomSeedInt());
}

function randomSeedInt(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0];
}

/** Fábrica de rand(min, max) a partir de uma fonte rng injetável. */
function rangeFrom(rng: () => number): (min: number, max: number) => number {
  return (min, max) => min + rng() * (max - min);
}

/**
 * Decide quem começa. Velocidade maior começa; EMPATE → cara ou coroa
 * (50/50 via rng injetável) — sem vantagem oculta para quem iniciou o desafio.
 */
export function decideFirst(a: Combatant, b: Combatant, rng: () => number = battleRng()): 'a' | 'b' {
  if (a.speed > b.speed) return 'a';
  if (b.speed > a.speed) return 'b';
  return rng() < 0.5 ? 'a' : 'b';
}

interface SimOptions {
  playerStartHp: number;
  /** RNG seedável para testes determinísticos (opcional) */
  rng?: () => number;
}

/** Ação escolhida pelo combatente (exportada — reutilizada pelo Ameaça Universal). */
export interface ChosenAction {
  kind: 'technique' | 'physical' | 'energy';
  tech?: TechniqueDef;
}

/** Defesa estática de um alvo (para golpes fora de uma batalha completa). */
export interface StaticDefender {
  defPower: number;
  resPower: number;
  strategy: StrategyDef;
}

/**
 * Escolhe a ação do atacante — MESMA lógica do combate comum (estratégia,
 * técnicas do loadout, agressão, viés físico/Ki, bônus racial de raio).
 * Consumos de rng idênticos ao fluxo interno de simulateBattle.
 */
export interface ChooseActionOpts {
  /**
   * v0.9.24 (D1) — este LADO ainda não usou NENHUMA técnica na batalha.
   * Com técnicas acessíveis (Ki) a partir da 3ª rodada, o golpe especial
   * deixa de ser probabilidade e vira CERTEZA na primeira oportunidade:
   * lutador com técnica equipada usa PELO MENOS 1 por batalha. A missão
   * diária "use 5 técnicas" sai do território da sorte (P(0 técnicas/luta)
   * ≈ 3-5% com Especialista em Ki) sem alterar as 8-15 rodadas típicas
   * (é 1 golpe por batalha, não uma mudança de padrão).
   */
  noTechniqueYet?: boolean;
}

export function chooseAttackAction(
  attacker: Combatant,
  rng: () => number,
  roundsSoFar: number,
  opts?: ChooseActionOpts
): ChosenAction {
  const affordable = attacker.techniques.filter((t) => attacker.battleKi >= t.kiCost);
  const aggression = attacker.strategy.techniqueAggression;
  // v0.9.24 (D1) — GARANTIA DE ESPETÁCULO (curto-circuito SEM rng: o
  // determinismo dos testes com semente só muda quando a garantia dispara)
  const guarantee = !!opts?.noTechniqueYet && roundsSoFar >= 3 && affordable.length > 0;
  if (affordable.length > 0 && (guarantee || rng() < aggression)) {
    // técnicas supremas entram mais facilmente nos rounds finais
    const pool: TechniqueDef[] = [];
    for (const t of affordable) {
      pool.push(t);
      if (t.category !== 'supreme' || roundsSoFar >= 6) pool.push(t); // peso 2x
    }
    return { kind: 'technique', tech: pool[Math.floor(rng() * pool.length)] };
  }

  const bias = attacker.strategy.physicalBias;
  let energyChance = 0.35 + Math.min(0.15, attacker.ki * 0.002) + attacker.raceCombat.kiAttackChanceBonus;
  if (bias > 0) energyChance = 0.12;
  if (bias < 0) energyChance = 0.85;
  const canEnergy = attacker.battleKi >= BASIC_ENERGY_KI_COST;
  if (canEnergy && rng() < energyChance) return { kind: 'energy' };
  return { kind: 'physical' };
}

/**
 * Dano de um golpe contra um defensor estático — MESMA fórmula do combate
 * comum: poder bruto (atributos + raça + transformação + técnica),
 * perfuração, SOFT CAP de mitigação e multiplicadores de estratégia.
 * (Não rola esquiva — o alvo é colossal.)
 */
export function strikeDamageVsStatic(
  attacker: Combatant,
  defender: StaticDefender,
  action: ChosenAction,
  rand: (min: number, max: number) => number
): number {
  const isEnergy = action.kind === 'energy' || (action.kind === 'technique' && action.tech?.type === 'energy');
  let raw = (isEnergy ? attacker.kiPower : attacker.atkPower) * rand(1 - COMBAT.variance, 1 + COMBAT.variance);
  if (action.kind === 'technique' && action.tech) {
    raw *= action.tech.power;
  }
  let defTerm = isEnergy ? defender.resPower * COMBAT.energyDefCoef : defender.defPower * COMBAT.physDefCoef;
  const pierce = action.kind === 'technique' ? action.tech?.effects?.defensePierce ?? 0 : 0;
  if (pierce > 0) defTerm *= 1 - Math.min(0.8, pierce);
  const sub = Math.min(defTerm, raw * COMBAT.maxMitigationPct);
  let damage = raw - sub;
  damage *= attacker.strategy.damageDealtMult;
  damage *= defender.strategy.damageTakenMult;
  if (attacker.strategy.id === 'melee' && !isEnergy) damage *= 1.1;
  if (attacker.strategy.id === 'ki_specialist') damage *= isEnergy ? 1.2 : 0.85;
  return Math.max(1, Math.round(damage));
}

export function simulateBattle(
  player: Combatant,
  enemy: Combatant,
  opts: SimOptions
): BattleSimulation & { playerTechniquesUsed: string[] } {
  const rng = opts.rng ?? battleRng();
  /** Aleatoriedade 100% via rng injetado (determinístico em teste). */
  const rand = rangeFrom(rng);
  let pHp = opts.playerStartHp;
  let eHp = enemy.maxHp;
  const rounds: BattleRound[] = [];
  const playerTechniquesUsed = new Set<string>();
  // v0.9.24 (D1) — espelho do lado do oponente (a garantia de ≥1 técnica
  // é simétrica: defensores de PvP com loadout também entram no espetáculo)
  const enemyTechniquesUsed = new Set<string>();

  // v0.9.12 — ABERTURAS (regra 5.3): críticos do azarão (4+ escalas
  // abaixo) acumulam aberturas; 3 delas fazem a próxima TÉCNICA dele
  // tratar a diferença como apenas 3 ("quebra de barreira").
  let playerAberturas = 0;
  let enemyAberturas = 0;

  // v0.9.13 — ÍMPETO (Cap. 7 do ASCENSÃO Z): começa em 1; Espírito de
  // Superação dá +1 a quem enfrenta oponente ≥1 Escala acima; ganhos por
  // gatilho (golpe poderoso recebido, Abertura, metade da Vida); gastos
  // determinísticos (combo, defesa heroica, Quebra de Limite).
  let playerImpeto: number = IMPETO.start;
  let enemyImpeto: number = IMPETO.start;
  const startScaleDiff = scaleDiff(enemy.power, player.power); // >0 = inimigo acima
  if (startScaleDiff >= 1) playerImpeto = clampImpeto(playerImpeto + 1);
  if (startScaleDiff <= -1) enemyImpeto = clampImpeto(enemyImpeto + 1);
  // gatilho "cair abaixo da metade da Vida": uma vez por combate
  let playerHalfGained = false;
  let enemyHalfGained = false;
  // ganho "golpe poderoso recebido": uma vez por gatilho por rodada
  let playerHeavyRound = -1;
  let enemyHeavyRound = -1;
  // v0.9.15 — TALENTOS (Cap. 7): Repetição do Destino e Reposicionamento
  // Dramático disparam uma vez por rodada por lado
  let playerRerollRound = -1;
  let enemyRerollRound = -1;
  let playerRepositionRound = -1;
  let enemyRepositionRound = -1;
  // Quebra de Limite (Cap. 29): 1×/combate, +1 Escala por 2 rodadas
  let playerQuebraUsed = false;
  let enemyQuebraUsed = false;
  let playerQuebraRounds = 0;
  let enemyQuebraRounds = 0;
  // v0.9.16 — EXAUSTÃO PÓS-QUEBRA (Cap. 29: "Exaustão 2"): 2 rodadas de
  // fadiga quando o efeito da Quebra expira — o preço do milagre
  let playerExaustaoRounds = 0;
  let enemyExaustaoRounds = 0;
  // narração completa de entrada: 1× por lado por combate (não repete
  // quando o exausto ataca E defende na mesma rodada)
  let playerExaustaoAnnounced = false;
  let enemyExaustaoAnnounced = false;
  // v0.9.17 — SEGUNDO VENTO (talento, Cap. 29): o momento em que a
  // Exaustão ia entrar é interceptado por 2 Ímpetos — a fadiga não cobra.
  // Flag 1× por lado (a Quebra é 1×/combate; sem rng — determinismo)
  let playerSegundoVento = false;
  let enemySegundoVento = false;
  let playerSegundoVentoAnnounced = false;
  let enemySegundoVentoAnnounced = false;
  // v0.9.17 — conquistas narrativas: Reposicionamento Dramático com
  // sucesso contra oponente 2+ escalas acima ("David vs Golias")
  let playerDavidReposition = false;

  const playerFirst = decideFirst(player, enemy, rng) === 'a';

  /** Escolhe a ação do atacante: técnica (do loadout, se houver Ki) ou golpe básico. */
  function chooseAction(attacker: Combatant): ChosenAction {
    // v0.9.24 (D1) — por LADO: nenhum golpe especial ainda + rodada 3+ →
    // a técnica vira certeza (ver ChooseActionOpts). Simétrico: o defensor
    // de PvP com loadout também garante o seu espetáculo.
    const noTechniqueYet =
      attacker === player ? playerTechniquesUsed.size === 0 : enemyTechniquesUsed.size === 0;
    return chooseAttackAction(attacker, rng, rounds.length, { noTechniqueYet });
  }

  function strike(
    attacker: Combatant,
    defender: Combatant,
    roundNum: number,
    comboIndex = 0
  ): BattleRound {
    const isPlayerAttacking = attacker === player;
    const isComboExtra = comboIndex > 0;

    // ===== 1) ESCOLHA DA AÇÃO — o Ki é consumido NO LANÇAMENTO =====
    // (esquiva NÃO devolve Ki: a energia foi disparada de verdade)
    const action = chooseAction(attacker);
    if (action.kind === 'technique' && action.tech) {
      attacker.battleKi -= action.tech.kiCost;
      if (isPlayerAttacking) playerTechniquesUsed.add(action.tech.id);
      else enemyTechniquesUsed.add(action.tech.id);
    } else if (action.kind === 'energy') {
      attacker.battleKi -= BASIC_ENERGY_KI_COST;
    }

    // ===== 2) ESQUIVA DO DEFENSOR (raça + estratégia + precisão da técnica) =====
    // O VALOR do roll é reaproveitado no crítico de Abertura (passo 6) —
    // nenhuma chamada extra de rng: o determinismo dos testes continua.
    const spdDiff = defender.speed - attacker.speed;
    let dodgeChance = Math.max(0.03, Math.min(0.3, 0.05 + spdDiff * 0.005));
    dodgeChance += defender.raceCombat.dodgeBonus + defender.strategy.dodgeBonus;
    if (action.kind === 'technique' && action.tech) {
      dodgeChance -= action.tech.accuracy;
    }
    dodgeChance = Math.max(0.02, Math.min(0.4, dodgeChance));

    const dodgeRoll = rng();
    // ===== 2½) TALENTO — REPETIÇÃO DO DESTINO (Cap. 7: 1 Ímpeto) =====
    // "Repetir um d10": golpe esquivado → o atacante com o talento pode
    // pagar 1 Ímpeto para repetir o teste. Se o novo roll acerta, o golpe
    // SEGUE o fluxo normal (dano, escala, ímpeto — tudo conta). Nunca em
    // golpes extras de combo; 1×/rodada por lado. Consome rng APENAS
    // quando possuído + disparado — sem o talento a sequência aleatória
    // segue idêntica (determinismo preservado).
    let dodged = dodgeRoll < dodgeChance;
    let rerollSuffix = '';
    if (
      dodged &&
      !isComboExtra &&
      attacker.talents?.includes('repeticao-destino') &&
      (isPlayerAttacking ? playerRerollRound : enemyRerollRound) !== roundNum &&
      (isPlayerAttacking ? playerImpeto : enemyImpeto) >= IMPETO.rerollCost
    ) {
      if (isPlayerAttacking) {
        playerRerollRound = roundNum;
        playerImpeto -= IMPETO.rerollCost;
      } else {
        enemyRerollRound = roundNum;
        enemyImpeto -= IMPETO.rerollCost;
      }
      const retryRoll = rng();
      if (retryRoll >= dodgeChance) {
        dodged = false; // o destino atendeu — o golpe segue o fluxo normal
        rerollSuffix = ' [🎯 Repetição do Destino — 1 Ímpeto para repetir o teste!]';
      } else {
        return {
          round: roundNum,
          attacker: isPlayerAttacking ? 'player' : 'enemy',
          action: 'dodge',
          damage: 0,
          playerHp: pHp,
          enemyHp: eHp,
          playerKi: Math.max(0, Math.round(player.battleKi)),
          enemyKi: Math.max(0, Math.round(enemy.battleKi)),
          playerImpeto,
          enemyImpeto,
          impetoEvent: 'reroll',
          text: `${attacker.name} pagou 1 Ímpeto para 🎯 repetir o acerto — mas ${defender.name} desviou de novo!`,
          technique: action.tech?.name,
          techniqueIcon: action.tech?.icon,
        };
      }
    }
    if (dodged) {
      return {
        round: roundNum,
        attacker: isPlayerAttacking ? 'player' : 'enemy',
        action: 'dodge',
        damage: 0,
        playerHp: pHp,
        enemyHp: eHp,
        playerKi: Math.max(0, Math.round(player.battleKi)),
        enemyKi: Math.max(0, Math.round(enemy.battleKi)),
        playerImpeto,
        enemyImpeto,
        text: `${defender.name} desviou no último instante!`,
        technique: action.tech?.name,
        techniqueIcon: action.tech?.icon,
      };
    }

    const isEnergy = action.kind === 'energy' || (action.kind === 'technique' && action.tech?.type === 'energy');

    // ===== 3) PODER BRUTO (atributos + raça + transformação + técnica) =====
    // Multiplicadores raciais/de transformação já embutidos em atk/kiPower.
    // A TÉCNICA multiplica o poder bruto — a defesa participa do cálculo.
    let raw = (isEnergy ? attacker.kiPower : attacker.atkPower) * rand(1 - COMBAT.variance, 1 + COMBAT.variance);
    if (action.kind === 'technique' && action.tech) {
      raw *= action.tech.power;
    }
    // Cap. 7 — "cada ataque adicional sofre −2 cumulativo": golpe de
    // combo com força decrescente (−25% por golpe extra do combo).
    if (isComboExtra) {
      raw *= Math.pow(IMPETO.comboDamageDecay, comboIndex);
    }

    // ===== 4) DEFESA EFETIVA + SOFT CAP DE MITIGAÇÃO =====
    // defensePierce reduz a defesa efetiva; o cap garante que NENHUM golpe
    // seja reduzido a nada: a mitigação nunca passa de maxMitigationPct do
    // poder bruto (retornos marginais decrescentes de Defesa).
    let defTerm = isEnergy ? defender.resPower * COMBAT.energyDefCoef : defender.defPower * COMBAT.physDefCoef;
    const pierce = action.kind === 'technique' ? action.tech?.effects?.defensePierce ?? 0 : 0;
    if (pierce > 0) defTerm *= 1 - Math.min(0.8, pierce);
    const sub = Math.min(defTerm, raw * COMBAT.maxMitigationPct);

    // ===== 5) ESTRATÉGIAS (atacante e defensor — como antes, no líquido) =====
    let damage = raw - sub;
    damage *= attacker.strategy.damageDealtMult;
    damage *= defender.strategy.damageTakenMult;
    if (attacker.strategy.id === 'melee' && !isEnergy) damage *= 1.1;
    if (attacker.strategy.id === 'ki_specialist') damage *= isEnergy ? 1.2 : 0.85;

    // ===== 5½) EXAUSTÃO PÓS-QUEBRA (Cap. 29: "Exaustão 2") =====
    // Quem rompeu os limites paga 2 rodadas de fadiga quando o efeito
    // expira: golpes enfraquecidos (×0.85) e reações lentas (golpes
    // recebidos ×1.10). Multiplicadores puros — NÃO consome rng.
    // O round de ENTRADA narra o preço completo (1× por lado); os
    // seguintes carregam só o selo curto "💧 exausto".
    const attackerExaustaoRounds = isPlayerAttacking ? playerExaustaoRounds : enemyExaustaoRounds;
    const defenderExaustaoRounds = isPlayerAttacking ? enemyExaustaoRounds : playerExaustaoRounds;
    let exaustaoSuffix = '';
    let exaustaoEntered = false;
    if (attackerExaustaoRounds > 0) damage *= IMPETO.exaustaoDamageDealtMult;
    if (defenderExaustaoRounds > 0) damage *= IMPETO.exaustaoDamageTakenMult;
    // v0.9.17 — SEGUNDO VENTO (talento): a Exaustão ia entrar NESTA
    // rodada, mas 2 Ímpetos a cancelaram — narra o milagre completo no
    // primeiro strike em que o lado aparece (atacando OU defendendo)
    let ventoSuffix = '';
    let ventoEvent = false;
    if (playerSegundoVento && !playerSegundoVentoAnnounced) {
      playerSegundoVentoAnnounced = true;
      ventoEvent = true;
      ventoSuffix = ` [🌬️ SEGUNDO VENTO! ${isPlayerAttacking ? attacker.name : defender.name} gasta ${IMPETO.segundoVentoCost} Ímpetos e supera a fadiga — o milagre COMPLETO do Cap. 29!]`;
    } else if (enemySegundoVento && !enemySegundoVentoAnnounced) {
      enemySegundoVentoAnnounced = true;
      ventoEvent = true;
      ventoSuffix = ` [🌬️ SEGUNDO VENTO! ${isPlayerAttacking ? defender.name : attacker.name} gasta ${IMPETO.segundoVentoCost} Ímpetos e supera a fadiga — o milagre COMPLETO do Cap. 29!]`;
    }
    if (attackerExaustaoRounds > 0 || defenderExaustaoRounds > 0) {
      // quem ACABOU de entrar na fadiga nesta rodada (contador no máximo)
      const playerJustEntered = isPlayerAttacking
        ? defenderExaustaoRounds === IMPETO.exaustaoRounds
        : attackerExaustaoRounds === IMPETO.exaustaoRounds;
      const enemyJustEntered = isPlayerAttacking
        ? attackerExaustaoRounds === IMPETO.exaustaoRounds
        : defenderExaustaoRounds === IMPETO.exaustaoRounds;
      const tired = attackerExaustaoRounds > 0 ? attacker : defender;
      if (playerJustEntered && !playerExaustaoAnnounced) {
        playerExaustaoAnnounced = true;
        exaustaoEntered = true;
        exaustaoSuffix = ` [💧 EXAUSTÃO PÓS-LIMITE! ${tired.name} pagou o preço de romper os limites — 2 rodadas de fadiga!]`;
      } else if (enemyJustEntered && !enemyExaustaoAnnounced) {
        enemyExaustaoAnnounced = true;
        exaustaoEntered = true;
        exaustaoSuffix = ` [💧 EXAUSTÃO PÓS-LIMITE! ${tired.name} pagou o preço de romper os limites — 2 rodadas de fadiga!]`;
      } else {
        exaustaoSuffix = ' [💧 exausto]';
      }
    }

    // ===== 6) ARMADURA DE ESCALA — regras 5.1/5.3 do ASCENSÃO Z =====
    // Diferença de escala ajusta o dano: superior +7%/escala; inferior
    // atravessa Armadura de Escala (−12%/nível, máx. 3). Com 4+ escalas
    // de diferença os golpes do azarão são ESMAGADOS (×0.35) — MAS
    // críticos geram ABERTURAS e 3 delas fazem a TÉCNICA tratar a
    // diferença como 3 ("quebra de barreira"). Escala NÃO mexe em
    // esquiva/precisão (regra 5.2 — velocidade segue separada).
    // v0.9.13 — QUEBRA DE LIMITE ativa: o atacante luta com +1 Escala
    // (Cap. 29: "+1 Escala" escolhido entre os benefícios).
    let scaleEvent: BattleRound['scaleEvent'];
    let scaleSuffix = '';
    const attackerQuebra = (isPlayerAttacking ? playerQuebraRounds : enemyQuebraRounds) > 0;
    const defenderQuebra = (isPlayerAttacking ? enemyQuebraRounds : playerQuebraRounds) > 0;
    const attackerEffPower = effectiveScalePower(attacker.power, attackerQuebra);
    const defenderEffPower = effectiveScalePower(defender.power, defenderQuebra);
    const scale = scaleCombatRules(attackerEffPower, defenderEffPower);
    if (scale.diff !== 0) {
      const isTechnique = action.kind === 'technique';
      const myAberturas = isPlayerAttacking ? playerAberturas : enemyAberturas;
      // regra 5.3: 3 aberturas → técnica trata a diferença como 3
      const breakthrough =
        scale.crushing && isTechnique && myAberturas >= SCALE_COMBAT.aberturasNeeded;

      if (breakthrough) {
        if (isPlayerAttacking) playerAberturas -= SCALE_COMBAT.aberturasNeeded;
        else enemyAberturas -= SCALE_COMBAT.aberturasNeeded;
        scaleEvent = 'breakthrough';
        scaleSuffix = ' [QUEBRA DE BARREIRA — a técnica ignora a diferença de escala!]';
      } else {
        damage *= scale.damageMult;
        if (scale.crushing) {
          // azarão 4+ escalas abaixo: golpe esmagado… mas pode CRITICAR
          // (Abertura) — o roll da esquiva é reusado (determinismo)
          const critChance = Math.min(1, aberturaChance(attacker.speed, defender.speed) + (attacker.guildCritical ?? 0));
          if (dodgeRoll > 1 - critChance) {
            damage *= SCALE_COMBAT.aberturaCritMult;
            if (isPlayerAttacking) playerAberturas += 1;
            else enemyAberturas += 1;
            scaleEvent = 'abertura';
            // v0.9.13 — "obter crítico" é gatilho de Ímpeto (Cap. 7);
            // ataques adicionais de combo NÃO geram Ímpeto ao atacante.
            let impetoCritSuffix = '';
            if (!isComboExtra) {
              if (isPlayerAttacking) playerImpeto = clampImpeto(playerImpeto + 1);
              else enemyImpeto = clampImpeto(enemyImpeto + 1);
              impetoCritSuffix = ' +1 Ímpeto!';
            }
            scaleSuffix = ` [💥 ABERTURA! ${myAberturas + 1}/${SCALE_COMBAT.aberturasNeeded} — brecha na diferença de escala!${impetoCritSuffix}]`;
          } else {
            damage *= SCALE_COMBAT.crushingMult;
            scaleEvent = 'crushing';
            scaleSuffix = ' [a diferença de escala esmaga o golpe…]';
          }
        } else if (scale.armor > 0) {
          scaleEvent = 'armor';
          scaleSuffix = ` [🛡️ Armadura de Escala ${scale.armor} absorve parte do impacto]`;
        } else if (scale.advantage > 0) {
          scaleEvent = 'advantage';
          scaleSuffix = ` [+${scale.advantage} ${scale.advantage === 1 ? 'escala de vantagem' : 'escalas de vantagem'}!]`;
        }
      }
    }

    // Fora de golpes esmagados, o bônus de guilda cria uma chance de
    // crítico de 2pp, usando o mesmo sorteio de esquiva (sem novo RNG).
    if (!scale.crushing && dodgeRoll > 1 - (attacker.guildCritical ?? 0)) {
      damage *= SCALE_COMBAT.aberturaCritMult;
      scaleSuffix += ' [CRÍTICO DA GUILDA!]';
    }
    damage = Math.max(1, Math.round(damage));

    // ===== 6½) ÍMPETO — DEFESA HEROICA (Cap. 7: 2 Ímpetos) =====
    // Golpe poderoso chegando e Ímpeto em caixa: o defensor paga 2
    // Ímpetos para reduzir o impacto À METADE — a virada defensiva.
    // (Custo decidido deterministicamente — não consome rng.)
    let impetoEvent: BattleRound['impetoEvent'];
    let impetoSuffix = '';
    const defenderIsPlayer = !isPlayerAttacking;
    // ===== 6½-A) TALENTO — REPOSICIONAMENTO DRAMÁTICO (Cap. 7: 1 Ímpeto) =====
    // Golpe PODEROSO alcançando o defensor com o talento: paga 1 Ímpeto
    // para tentar sumir do ponto de impacto (esquiva extra com bônus,
    // teto próprio). Sucesso → dano ZERO (não conta como golpe recebido:
    // sem ganho de Ímpeto do defensor — ele nem foi tocado). Falha → o
    // golpe segue e a Defesa Heroica ainda pode agir em seguida.
    if (
      isHeavyBlow(damage, defender.maxHp) &&
      defender.talents?.includes('reposicionamento') &&
      (defenderIsPlayer ? playerRepositionRound : enemyRepositionRound) !== roundNum &&
      (defenderIsPlayer ? playerImpeto : enemyImpeto) >= IMPETO.repositionCost
    ) {
      if (defenderIsPlayer) {
        playerRepositionRound = roundNum;
        playerImpeto -= IMPETO.repositionCost;
      } else {
        enemyRepositionRound = roundNum;
        enemyImpeto -= IMPETO.repositionCost;
      }
      // chance da esquiva extra: base da rodada + bônus do talento
      const repositionChance = Math.max(0.05, Math.min(IMPETO.repositionDodgeCap, dodgeChance + IMPETO.repositionDodgeBonus));
      if (rng() < repositionChance) {
        impetoEvent = 'reposition';
        impetoSuffix = ` [🌀 Reposicionamento Dramático — ${defender.name} gasta 1 Ímpeto e desaparece do ponto de impacto!]`;
        damage = 0;
        // v0.9.17 — conquista "David vs Golias": anulou um golpe PODEROSO
        // de um oponente 2+ escalas acima (narrativa de superação)
        if (defenderIsPlayer && startScaleDiff >= 2) playerDavidReposition = true;
      } else {
        impetoSuffix = ` [🌀 ${defender.name} gasta 1 Ímpeto para se reposicionar… mas o instante escapa!]`;
        if (!impetoEvent) impetoEvent = 'reposition';
      }
    }
    if (
      isHeavyBlow(damage, defender.maxHp) &&
      (defenderIsPlayer ? playerImpeto : enemyImpeto) >= IMPETO.heroicDefenseCost
    ) {
      if (defenderIsPlayer) playerImpeto -= IMPETO.heroicDefenseCost;
      else enemyImpeto -= IMPETO.heroicDefenseCost;
      damage = Math.max(1, Math.round(damage * IMPETO.heroicDefenseMult));
      impetoEvent = 'heroic-defense';
      impetoSuffix = ` [🛡️ Defesa Heroica — ${defender.name} gasta 2 Ímpetos e reduz o impacto à metade!]`;
    }

    // efeito de auto-cura (técnicas futuras)
    if (action.kind === 'technique' && action.tech?.effects?.selfHealPct) {
      const heal = Math.round(attacker.maxHp * action.tech.effects.selfHealPct);
      if (isPlayerAttacking) pHp = Math.min(player.maxHp, pHp + heal);
      else eHp = Math.min(enemy.maxHp, eHp + heal);
    }

    if (isPlayerAttacking) eHp = Math.max(0, eHp - damage);
    else pHp = Math.max(0, pHp - damage);

    // ===== 6¾) ÍMPETO — GATILHOS DE GANHO (uma vez por gatilho/rodada) =====
    // • "receber um golpe poderoso" → o DEFENSOR ganha 1 (após a Defesa
    //   Heroica: golpe reduzido abaixo do limiar não conta mais — o
    //   gasto se paga);
    // • "cair abaixo da metade da Vida" → 1×/combate.
    let gainSuffix = '';
    if (defenderIsPlayer) {
      if (isHeavyBlow(damage, defender.maxHp) && playerHeavyRound !== roundNum) {
        playerHeavyRound = roundNum;
        playerImpeto = clampImpeto(playerImpeto + 1);
        gainSuffix += ` [🔥 ${defender.name} acumula Ímpeto do golpe pesado!]`;
        if (!impetoEvent) impetoEvent = 'gain';
      }
      if (!playerHalfGained && pHp > 0 && pHp < player.maxHp / 2) {
        playerHalfGained = true;
        playerImpeto = clampImpeto(playerImpeto + 1);
        gainSuffix += ` [🔥 ${defender.name} sente o perigo e ganha Ímpeto!]`;
        if (!impetoEvent) impetoEvent = 'gain';
      }
    } else {
      if (isHeavyBlow(damage, defender.maxHp) && enemyHeavyRound !== roundNum) {
        enemyHeavyRound = roundNum;
        enemyImpeto = clampImpeto(enemyImpeto + 1);
        gainSuffix += ` [🔥 ${defender.name} acumula Ímpeto do golpe pesado!]`;
        if (!impetoEvent) impetoEvent = 'gain';
      }
      if (!enemyHalfGained && eHp > 0 && eHp < enemy.maxHp / 2) {
        enemyHalfGained = true;
        enemyImpeto = clampImpeto(enemyImpeto + 1);
        gainSuffix += ` [🔥 ${defender.name} sente o perigo e ganha Ímpeto!]`;
        if (!impetoEvent) impetoEvent = 'gain';
      }
    }

    // ===== 6⅞) TALENTO — SEGUNDO VENTO (caminho IMEDIATO, v0.9.17) =====
    // O exausto com o talento retoma o fôlego NO INSTANTE em que o
    // Ímpeto chega a 2 (a adrenalina do golpe recebido vira fôlego novo
    // ANTES da próxima Defesa Heroica ou combo queimá-lo) — limpa a
    // fadiga restante JÁ nesta rodada. Determinístico (sem rng).
    if (defenderIsPlayer) {
      if (
        playerExaustaoRounds > 0 &&
        player.talents?.includes('segundo-vento') &&
        playerImpeto >= IMPETO.segundoVentoCost &&
        !playerSegundoVentoAnnounced
      ) {
        playerImpeto -= IMPETO.segundoVentoCost;
        playerExaustaoRounds = 0;
        playerSegundoVento = true;
        playerSegundoVentoAnnounced = true;
        ventoEvent = true;
        ventoSuffix = ` [🌬️ SEGUNDO VENTO! ${defender.name} supera a fadiga no meio dela — 2 Ímpetos queimados, o milagre COMPLETO do Cap. 29!]`;
      }
    } else if (
      enemyExaustaoRounds > 0 &&
      enemy.talents?.includes('segundo-vento') &&
      enemyImpeto >= IMPETO.segundoVentoCost &&
      !enemySegundoVentoAnnounced
    ) {
      enemyImpeto -= IMPETO.segundoVentoCost;
      enemyExaustaoRounds = 0;
      enemySegundoVento = true;
      enemySegundoVentoAnnounced = true;
      ventoEvent = true;
      ventoSuffix = ` [🌬️ SEGUNDO VENTO! ${defender.name} supera a fadiga no meio dela — 2 Ímpetos queimados, o milagre COMPLETO do Cap. 29!]`;
    }

    const round: BattleRound = {
      round: roundNum,
      attacker: isPlayerAttacking ? 'player' : 'enemy',
      action: action.kind === 'technique' ? 'technique' : isEnergy ? 'energy' : 'attack',
      damage,
      playerHp: pHp,
      enemyHp: eHp,
      playerKi: Math.max(0, Math.round(player.battleKi)),
      enemyKi: Math.max(0, Math.round(enemy.battleKi)),
      playerImpeto,
      enemyImpeto,
      impetoEvent: isComboExtra ? 'combo' : ventoEvent ? 'segundo-vento' : rerollSuffix ? 'reroll' : exaustaoEntered ? 'exaustao' : impetoEvent,
      text: '',
      technique: action.tech?.name,
      techniqueIcon: action.tech?.icon,
      scaleEvent,
    };

    if (isComboExtra) {
      // golpe extra do combo (Cap. 7: "Realize outro ataque imediatamente")
      if (action.kind === 'technique' && action.tech) {
        round.text = `${attacker.name} encadeia o combo com ${action.tech.icon} ${action.tech.name}! (-${damage} HP)${rerollSuffix}${scaleSuffix}${impetoSuffix}${exaustaoSuffix}${ventoSuffix}${gainSuffix}`;
      } else if (isEnergy) {
        round.text = `${attacker.name} encadeia o combo com uma onda de Ki! (-${damage} HP)${rerollSuffix}${scaleSuffix}${impetoSuffix}${exaustaoSuffix}${ventoSuffix}${gainSuffix}`;
      } else {
        round.text = `${attacker.name} encadeia outro golpe no combo! (-${damage} HP)${rerollSuffix}${scaleSuffix}${impetoSuffix}${exaustaoSuffix}${ventoSuffix}${gainSuffix}`;
      }
      if (damage === 0) round.text = round.text.replace(' (-0 HP)', ' (desapareceu!)');
      return round;
    }
    if (action.kind === 'technique' && action.tech) {
      round.text = `${attacker.name} desata ${action.tech.icon} ${action.tech.name} em ${defender.name}! (-${damage} HP)${rerollSuffix}${scaleSuffix}${impetoSuffix}${exaustaoSuffix}${ventoSuffix}${gainSuffix}`;
    } else if (isEnergy) {
      round.text = `${attacker.name} dispara uma onda de Ki devastadora em ${defender.name}! (-${damage} HP)${rerollSuffix}${scaleSuffix}${impetoSuffix}${exaustaoSuffix}${ventoSuffix}${gainSuffix}`;
    } else {
      round.text = `${attacker.name} acerta um golpe brutal em ${defender.name}! (-${damage} HP)${rerollSuffix}${scaleSuffix}${impetoSuffix}${exaustaoSuffix}${ventoSuffix}${gainSuffix}`;
    }
    // Reposicionamento com sucesso: o golpe sumiu — "(-0 HP)" não narra
    if (damage === 0) round.text = round.text.replace(' (-0 HP)', ' (desapareceu!)');
    return round;
  }

  /**
   * QUEBRA DE LIMITE (Cap. 29 — 3 Ímpetos + Ki, 1×/combate): ativada no
   * início do turno de quem caiu abaixo da metade da Vida — luta por
   * 2 rodadas com +1 Escala. O teste ESP+Disciplina do livro é
   * representado pelo custo acumulado (adaptação do auto-battler).
   * Devolve o prefixo narrativo (vazio se não ativou) — não consome rng.
   */
  function tryQuebra(attacker: Combatant, roundNum: number): string {
    const isP = attacker === player;
    const hp = isP ? pHp : eHp;
    const used = isP ? playerQuebraUsed : enemyQuebraUsed;
    const impeto = isP ? playerImpeto : enemyImpeto;
    if (
      !used &&
      impeto >= IMPETO.quebraCost &&
      attacker.battleKi >= IMPETO.quebraKiCost &&
      hp > 0 &&
      hp < attacker.maxHp * IMPETO.quebraHpThreshold
    ) {
      if (isP) {
        playerQuebraUsed = true;
        playerImpeto -= IMPETO.quebraCost;
        playerQuebraRounds = IMPETO.quebraRounds;
      } else {
        enemyQuebraUsed = true;
        enemyImpeto -= IMPETO.quebraCost;
        enemyQuebraRounds = IMPETO.quebraRounds;
      }
      attacker.battleKi -= IMPETO.quebraKiCost;
      return `[⚡ QUEBRA DE LIMITE! ${attacker.name} rompe os próprios limites — +1 Escala por ${IMPETO.quebraRounds} rodadas!] `;
    }
    return '';
  }

  /**
   * ESTENDER COMBO (Cap. 7 — 1 Ímpeto): após um golpe que ACERTOU, outro
   * ataque imediato com força decrescente (máx. 3 ataques totais). A
   * política de gasto segue a ESTRATÉGIA: agressivos encadeiam com 1
   * Ímpeto em caixa; contidos poupam para Defesa Heroica/Quebra.
   */
  function tryCombo(attacker: Combatant, defender: Combatant, lastRound: BattleRound, roundNum: number): void {
    if (lastRound.action === 'dodge') return; // combo só após ACERTAR
    const threshold = IMPETO_COMBO_THRESHOLD[attacker.strategy.id] ?? 2;
    let extensions = 0;
    while (
      extensions < IMPETO.comboMaxAttacks - 1 &&
      pHp > 0 &&
      eHp > 0 &&
      ((attacker === player ? playerImpeto : enemyImpeto) as number) >= Math.max(threshold, IMPETO.comboCost)
    ) {
      if (attacker === player) playerImpeto -= IMPETO.comboCost;
      else enemyImpeto -= IMPETO.comboCost;
      extensions++;
      const comboRound = strike(attacker, defender, roundNum, extensions);
      rounds.push(comboRound);
      if (comboRound.action === 'dodge') break; // combo interrompido
    }
  }

  let finalRound = 0;
  for (let r = 1; r <= MAX_ROUNDS && pHp > 0 && eHp > 0; r++) {
    finalRound = r;
    // decrementa a duração da Quebra de Limite (2 rodadas); ao EXPIRAR
    // entra a EXAUSTÃO (Cap. 29: "Exaustão 2") por 2 rodadas — quem
    // rompe os limites paga a fadiga logo depois do milagre
    // v0.9.17 — SEGUNDO VENTO (talento): quem domina o talento intercepta
    // a entrada da Exaustão gastando 2 Ímpetos (automático; só dispara
    // com Ímpeto em caixa — senão a fadiga cobra o preço do Cap. 29)
    if (playerQuebraRounds > 0) {
      playerQuebraRounds--;
      if (playerQuebraRounds === 0) {
        if (player.talents?.includes('segundo-vento') && playerImpeto >= IMPETO.segundoVentoCost) {
          playerImpeto -= IMPETO.segundoVentoCost;
          playerSegundoVento = true;
        } else {
          playerExaustaoRounds = IMPETO.exaustaoRounds;
        }
      }
    } else if (playerExaustaoRounds > 0) {
      // SEGUNDO VENTO — caminho RECUPERAÇÃO: a fadiga já cobrou suas
      // pedaladas, mas o guerreiro retoma o fôlego NO MEIO dela (o
      // sentido literal de "second wind") — limpa as rodadas restantes
      if (player.talents?.includes('segundo-vento') && playerImpeto >= IMPETO.segundoVentoCost) {
        playerImpeto -= IMPETO.segundoVentoCost;
        playerExaustaoRounds = 0;
        playerSegundoVento = true;
      } else {
        playerExaustaoRounds--;
      }
    }
    if (enemyQuebraRounds > 0) {
      enemyQuebraRounds--;
      if (enemyQuebraRounds === 0) {
        if (enemy.talents?.includes('segundo-vento') && enemyImpeto >= IMPETO.segundoVentoCost) {
          enemyImpeto -= IMPETO.segundoVentoCost;
          enemySegundoVento = true;
        } else {
          enemyExaustaoRounds = IMPETO.exaustaoRounds;
        }
      }
    } else if (enemyExaustaoRounds > 0) {
      if (enemy.talents?.includes('segundo-vento') && enemyImpeto >= IMPETO.segundoVentoCost) {
        enemyImpeto -= IMPETO.segundoVentoCost;
        enemyExaustaoRounds = 0;
        enemySegundoVento = true;
      } else {
        enemyExaustaoRounds--;
      }
    }
    // regeneração leve de Ki de batalha por round (parâmetro central)
    player.battleKi = Math.min(player.maxBattleKi, player.battleKi + Math.round(player.maxBattleKi * COMBAT.kiRegenPerRound));
    enemy.battleKi = Math.min(enemy.maxBattleKi, enemy.battleKi + Math.round(enemy.maxBattleKi * COMBAT.kiRegenPerRound));

    const firstAttacker = playerFirst ? player : enemy;
    const firstDefender = playerFirst ? enemy : player;
    const quebraPrefix = tryQuebra(firstAttacker, r);
    const first = strike(firstAttacker, firstDefender, r);
    first.text = quebraPrefix + first.text;
    if (quebraPrefix) first.impetoEvent = 'quebra-de-limite';
    rounds.push(first);
    tryCombo(firstAttacker, firstDefender, first, r);
    if (pHp > 0 && eHp > 0) {
      const secondAttacker = playerFirst ? enemy : player;
      const secondDefender = playerFirst ? player : enemy;
      const quebraPrefix2 = tryQuebra(secondAttacker, r);
      const second = strike(secondAttacker, secondDefender, r);
      second.text = quebraPrefix2 + second.text;
      if (quebraPrefix2) second.impetoEvent = 'quebra-de-limite';
      rounds.push(second);
      tryCombo(secondAttacker, secondDefender, second, r);
    }
  }

  let won: boolean;
  if (pHp <= 0 && eHp <= 0) {
    // ambos caíram: vence quem aplicou o golpe final (o último strike já registrou)
    won = rounds[rounds.length - 1]?.attacker === 'player';
  } else if (pHp <= 0) won = false;
  else if (eHp <= 0) won = true;
  else {
    // ===== DECISÃO DOS JURADOS (limite de rodadas sem nocaute) =====
    // Critérios PUBLICADOS no log (o jogador vê por que perdeu/ganhou):
    //   1º — MAIOR HP percentual (condição relativa sobre o máximo);
    //   2º — MAIOR HP absoluto;
    //   3º — sorteio (cara ou coroa, simetria total entre os lados).
    const pRatio = pHp / player.maxHp;
    const eRatio = eHp / enemy.maxHp;
    let criterion: 'percentual' | 'absoluto' | 'sorteio';
    if (pRatio !== eRatio) {
      won = pRatio > eRatio;
      criterion = 'percentual';
    } else if (pHp !== eHp) {
      won = pHp > eHp;
      criterion = 'absoluto';
    } else {
      won = rng() < 0.5;
      criterion = 'sorteio';
    }
    // Rodada narrada de decisão — v0.9.21: NUNCA mais um vencedor
    // "misterioso" com ambos os lados vivos (correção 1: o desempate
    // agora é regra explícita, auditável no próprio log).
    const winnerName = won ? player.name : enemy.name;
    const loserName = won ? enemy.name : player.name;
    const pct = (hp: number, max: number) => `${Math.round((hp / max) * 100)}% (${hp}/${max})`;
    const detail =
      criterion === 'sorteio'
        ? `empate técnico TOTAL (${pHp} de vida para cada lado) — a moeda do árbitro decidiu`
        : criterion === 'absoluto'
          ? `mesma condição relativa (${Math.round(pRatio * 100)}%), o HP absoluto desempatou (${pHp} contra ${eHp})`
          : `condição relativa superior — ${winnerName} terminou com ${pct(
              won ? pHp : eHp,
              won ? player.maxHp : enemy.maxHp
            )} contra ${pct(won ? eHp : pHp, won ? enemy.maxHp : player.maxHp)} de ${loserName}`;
    rounds.push({
      round: finalRound + 1,
      attacker: won ? 'player' : 'enemy',
      action: 'attack',
      damage: 0,
      playerHp: pHp,
      enemyHp: eHp,
      playerKi: Math.max(0, Math.round(player.battleKi)),
      enemyKi: Math.max(0, Math.round(enemy.battleKi)),
      playerImpeto,
      enemyImpeto,
      decision: 'round-limit',
      text: `⚖️ FIM DO TEMPO! ${MAX_ROUNDS} rodadas sem nocaute — a decisão vai aos jurados: ${detail}. ${winnerName} leva a vitória!`,
    });
  }

  return {
    won,
    rounds,
    // SEMPRE assignado: quem desferiu o primeiro golpe (decidido antes do loop)
    firstAction: { isPlayer: playerFirst },
    playerStartHp: opts.playerStartHp,
    playerEndHp: pHp <= 0 ? 0 : Math.max(1, pHp),
    playerMaxHp: player.maxHp,
    enemyStartHp: enemy.maxHp,
    enemyEndHp: eHp,
    enemyMaxHp: enemy.maxHp,
    techniquesUsed: Array.from(playerTechniquesUsed),
    playerTechniquesUsed: Array.from(playerTechniquesUsed),
    // v0.9.17 — conquistas narrativas (ASCENSÃO Z):
    // Milagre no Limite = venceu com a Quebra de Limite ativada;
    // David vs Golias = Reposicionamento exitoso contra 2+ escalas acima
    miracleWin: won && playerQuebraUsed,
    davidReposition: playerDavidReposition,
  };
}

// ===== Recompensas (multiplicadores raciais — SEM penalidade diária) =====

export function npcRewards(
  enemyIdx: number,
  race: string,
  won: boolean,
  rng?: () => number
): { zeni: number; xp: number } {
  const rand = rangeFrom(rng ?? battleRng());
  const e = ENEMIES[enemyIdx];
  const econ = raceEconomy(race);
  if (won) {
    const zeni = Math.max(1, Math.round(e.zeniReward * rand(0.9, 1.15) * econ.zeniBattleMult));
    const xp = Math.max(1, Math.round(e.xpReward * rand(0.9, 1.1) * econ.xpBattleMult));
    return { zeni, xp };
  }
  return { zeni: 0, xp: Math.round(e.xpReward * 0.15) };
}

export function pvpRewards(targetLevel: number, playerLevel: number, race: string): number {
  const econ = raceEconomy(race);
  const levelDiff = Math.max(-3, targetLevel - playerLevel);
  return Math.max(10, Math.round(60 * targetLevel * (1 + 0.08 * levelDiff) * econ.xpBattleMult));
}

/**
 * Compatibilidade para consumidores antigos: recompensa de UMA hora no nível
 * profissional informado. Turnos reais 1/2/4/8h usam professionShiftRewards.
 */
export function professionRewards(
  level: number,
  playerLevel: number,
  race: string,
  rng?: () => number
): { zeni: number; xp: number; foundDragonBall: boolean } {
  const r = rng ?? battleRng();
  const tier = professionLevelDef(level);
  const econ = raceEconomy(race);
  return {
    zeni: Math.max(1, Math.round(tier.zeniPerHour * econ.zeniMissionMult)),
    xp: professionXpPerHour(level, playerLevel, 1),
    foundDragonBall: r() < tier.dragonBallChance,
  };
}

/** LEGADO: profissões não gastam energia desde a v0.9. */
export function professionEnergyCost(_race: string): number {
  return 0;
}

// ===== Cura =====

export function healCost(player: Player): number {
  const d = computeDerived(player);
  return Math.max(0, (d.maxHp - player.hp) * 3);
}

// ===== Persistência otimista de JSON (anti-corrida) =====

/**
 * Grava um campo JSON do jogador com bloqueio otimista (stateVersion).
 * Duas requisições simultâneas que mutam itens/técnicas/loadout: apenas
 * a primeira passa; a segunda recebe CONFLICT e pode repetir.
 */
export async function updateJsonState(
  tx: Prisma.TransactionClient,
  player: Player,
  data: { items?: string; techniques?: string; loadout?: string; transformationsOwned?: string; strategy?: string }
): Promise<void> {
  const res = await tx.player.updateMany({
    where: { id: player.id, stateVersion: player.stateVersion },
    data: { ...data, stateVersion: { increment: 1 } },
  });
  if (res.count === 0) {
    throw new ApiError('CONFLICT', 'Estado do personagem mudou — tente novamente.');
  }
  player.stateVersion += 1;
  if (data.items !== undefined) player.items = data.items;
  if (data.techniques !== undefined) player.techniques = data.techniques;
  if (data.loadout !== undefined) player.loadout = data.loadout;
  if (data.transformationsOwned !== undefined) player.transformationsOwned = data.transformationsOwned;
  if (data.strategy !== undefined) player.strategy = data.strategy;
}

// ===== Seed de bots =====

export async function ensureSeed(): Promise<void> {
  const rand = rangeFrom(battleRng());
  const count = await db.player.count({ where: { isBot: true } });
  if (count >= BOTS.length) return;

  for (const bot of BOTS) {
    const existing = await db.player.findUnique({ where: { name: bot.name } });
    if (existing) continue;
    await db.player.create({
      data: {
        name: bot.name,
        race: bot.race,
        level: bot.level,
        xp: Math.floor(xpToNextLevel(bot.level) * 0.4),
        zeni: 200 * bot.level,
        hp: 80 + bot.level * 15 + Math.floor((8 + bot.level * 3.2) * 5),
        strength: Math.floor(8 + bot.level * 4.5),
        defense: Math.floor(8 + bot.level * 3.2),
        speed: Math.floor(8 + bot.level * 3.4),
        ki: Math.floor(8 + bot.level * 3.0),
        energy: 200,
        battlesWon: Math.floor(bot.level * rand(3, 7)),
        battlesLost: Math.floor(bot.level * rand(1, 3)),
        isBot: true,
      },
    });
  }
}

// Reabastece Zeni de bots drenados (para PvP continuar atraente)
export async function topUpBots(): Promise<void> {
  const bots = await db.player.findMany({ where: { isBot: true } });
  for (const bot of bots) {
    const minZeni = 150 * bot.level;
    if (bot.zeni < minZeni) {
      await db.player.update({
        where: { id: bot.id },
        data: { zeni: minZeni, hp: 80 + bot.level * 15 + bot.defense * 5 },
      });
    }
  }
}
// NOTA (v0.4): a reposição direta acima é legado do seed inicial — no fluxo
// de PvP (actionPvp) o reabastecimento usa addCurrency com ledger
// (source 'bot_topup'), separando INJEÇÃO de moeda do sistema de
// TRANSFERÊNCIAS entre jogadores.
