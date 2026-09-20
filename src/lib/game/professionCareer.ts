import type {
  ProfessionLootEntry,
  ProfessionProgress,
  ProfessionsMap,
  ProfessionId,
} from './types';
import {
  PROFESSION_LEVELS,
  PROFESSION_MASTERY_HOURS,
  PROFESSION_MATERIALS,
  professionMaterialRequiredLevel,
  PROFESSION_SHIFTS,
  getProfession,
} from './content/world';

// =====================================================================
// CARREIRA PROFISSIONAL — funções puras
// ---------------------------------------------------------------------
// O JSON legado {rank, completions} é convertido em horas na LEITURA.
// Isso preserva o tempo já trabalhado sem conceder atributos retroativos.
// A primeira gravação posterior normaliza o formato novo.
// =====================================================================

const LEGACY_RANK_BASE_HOURS = [0, 3, 7, 12, 18] as const;
const MAX_SAFE_PROFESSION_HOURS = 10_000_000;

function int(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function legacyProfessionHours(rankRaw: unknown, completionsRaw: unknown): number {
  const rank = clamp(int(rankRaw, 1), 1, LEGACY_RANK_BASE_HOURS.length);
  const completions = clamp(int(completionsRaw, 0), 0, MAX_SAFE_PROFESSION_HOURS);
  return clamp(LEGACY_RANK_BASE_HOURS[rank - 1] + completions, 0, PROFESSION_MASTERY_HOURS);
}

export function normalizeProfessionProgress(raw: unknown): ProfessionProgress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { hours: 0, lifetimeHours: 0, prestige: 0, statMilliRemainder: 0, cycleStatGranted: 0 };
  }
  const src = raw as Record<string, unknown>;

  // Retrocompatibilidade v0.6: { rank, completions }.
  const legacy = src.hours === undefined && (src.rank !== undefined || src.completions !== undefined);
  const rawHours = legacy ? legacyProfessionHours(src.rank, src.completions) : int(src.hours, 0);
  const hours = clamp(rawHours, 0, PROFESSION_MASTERY_HOURS);
  const lifetimeHours = clamp(
    Math.max(hours, int(src.lifetimeHours, hours)),
    0,
    MAX_SAFE_PROFESSION_HOURS
  );

  return {
    hours,
    lifetimeHours,
    prestige: clamp(int(src.prestige, 0), 0, 10_000),
    // Ganho de atributo passou a ser estritamente inteiro; qualquer saldo fracionário legado é descartado.
    statMilliRemainder: 0,
    cycleStatGranted: clamp(int(src.cycleStatGranted, 0), 0, 999_999),
  };
}

export function parseProfessions(raw: string | null | undefined): ProfessionsMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ProfessionsMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!getProfession(id)) continue;
      out[id] = normalizeProfessionProgress(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function sanitizeProfessionsObject(raw: unknown): ProfessionsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ProfessionsMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!getProfession(id)) continue;
    out[id] = normalizeProfessionProgress(value);
  }
  return out;
}

export function serializeProfessions(map: ProfessionsMap): string {
  return JSON.stringify(map);
}

export function professionLevelForHours(hoursRaw: number): number {
  const hours = clamp(Math.trunc(hoursRaw || 0), 0, PROFESSION_MASTERY_HOURS);
  let level = 1;
  for (let i = 0; i < PROFESSION_LEVELS.length - 1; i++) {
    if (hours >= PROFESSION_LEVELS[i].cumulativeHours) level = i + 2;
    else break;
  }
  return level;
}

export function professionLevel(progress: ProfessionProgress | undefined): number {
  return professionLevelForHours(progress?.hours ?? 0);
}

export function professionLevelTitle(levelRaw: number): string {
  return `Nível ${clamp(Math.trunc(levelRaw || 1), 1, PROFESSION_LEVELS.length)}`;
}

export function professionLevelDef(levelRaw: number) {
  const level = clamp(Math.trunc(levelRaw || 1), 1, PROFESSION_LEVELS.length);
  return PROFESSION_LEVELS[level - 1];
}

export function professionHoursIntoLevel(hoursRaw: number): number {
  const hours = clamp(Math.trunc(hoursRaw || 0), 0, PROFESSION_MASTERY_HOURS);
  const level = professionLevelForHours(hours);
  const previous = level <= 1 ? 0 : PROFESSION_LEVELS[level - 2].cumulativeHours;
  return Math.max(0, hours - previous);
}

export function professionShift(hoursRaw: number) {
  const hours = Math.trunc(hoursRaw);
  return PROFESSION_SHIFTS.find((s) => s.hours === hours);
}

export function professionXpPerHour(level: number, playerLevel: number, efficiency = 1): number {
  const tier = professionLevelDef(level);
  const safePlayerLevel = Math.max(1, Math.trunc(playerLevel || 1));
  return Math.max(1, Math.ceil(safePlayerLevel * tier.xpPerPlayerLevel * efficiency));
}

export interface ProfessionShiftRewards {
  hours: 1 | 2 | 4 | 8;
  efficiency: number;
  startLevel: number;
  endLevel: number;
  zeni: number;
  xp: number;
  attributeMilli: number;
  dragonBallChance: number;
  careerHoursAdded: number;
  lifetimeHoursAdded: number;
  hourLevels: number[];
}

/**
 * Calcula as recompensas BASE do turno. Raça/guilda/Acadêmico são aplicados
 * nas camadas centrais de economia; loot e Esfera são rolados no servidor.
 */
export function professionShiftRewards(
  startHours: number,
  shiftHours: 1 | 2 | 4 | 8,
  playerLevel: number
): ProfessionShiftRewards {
  const shift = professionShift(shiftHours);
  if (!shift) throw new Error('Turno profissional inválido.');

  const safeStart = clamp(Math.trunc(startHours || 0), 0, PROFESSION_MASTERY_HOURS);
  const hourLevels: number[] = [];
  let zeni = 0;
  let xp = 0;
  let attributeMilli = 0;

  for (let h = 0; h < shift.hours; h++) {
    const level = professionLevelForHours(Math.min(PROFESSION_MASTERY_HOURS, safeStart + h));
    const tier = professionLevelDef(level);
    hourLevels.push(level);
    zeni += tier.zeniPerHour;
    xp += professionXpPerHour(level, playerLevel, shift.efficiency);
    attributeMilli += tier.attributeMilliPerHour;
  }

  return {
    hours: shift.hours,
    efficiency: shift.efficiency,
    startLevel: hourLevels[0] ?? professionLevelForHours(safeStart),
    endLevel: professionLevelForHours(Math.min(PROFESSION_MASTERY_HOURS, safeStart + shift.hours)),
    zeni,
    xp,
    attributeMilli,
    dragonBallChance: professionLevelDef(hourLevels[0] ?? 1).dragonBallChance,
    careerHoursAdded: Math.max(0, Math.min(shift.hours, PROFESSION_MASTERY_HOURS - safeStart)),
    lifetimeHoursAdded: shift.hours,
    hourLevels,
  };
}

export function academicXpMultiplier(professions: ProfessionsMap): number {
  const academic = professions.academico;
  // Sem uma única hora acadêmica concluída, o bônus ainda não foi conquistado.
  if (!academic || academic.lifetimeHours <= 0) return 1;
  return 1 + professionLevel(academic) * 0.005;
}

export function academicXpBonusPct(professions: ProfessionsMap): number {
  return Math.round((academicXpMultiplier(professions) - 1) * 10_000) / 100;
}

/** Mestria de fabricação: -1% de tempo por nível Acadêmico, até -10%. */
export function academicCraftTimeMultiplier(levelRaw: number): number {
  const level = Math.max(0, Math.min(10, Math.trunc(levelRaw || 0)));
  return 1 - level * 0.01;
}

export function rollProfessionLoot(
  professionId: ProfessionId,
  hourLevels: number[],
  efficiency: number,
  rng: () => number
): ProfessionLootEntry[] {
  const commons = PROFESSION_MATERIALS.filter(
    (m) => m.professionId === professionId && m.rarity === 'common'
  );
  const rares = PROFESSION_MATERIALS.filter(
    (m) => m.professionId === professionId && m.rarity === 'rare'
  );
  if (commons.length === 0) return [];

  const amounts = new Map<string, number>();
  const add = (itemId: string, quantity: number) =>
    amounts.set(itemId, (amounts.get(itemId) ?? 0) + quantity);

  for (const level of hourLevels) {
    const unlockedCommons = commons.filter(
      (material) => professionMaterialRequiredLevel(material.tier) <= level
    );
    const common =
      unlockedCommons[Math.min(unlockedCommons.length - 1, Math.floor(rng() * unlockedCommons.length))];
    if (common) add(common.id, rng() < 0.5 ? 1 : 2);

    const unlockedRares = rares.filter(
      (material) => professionMaterialRequiredLevel(material.tier) <= level
    );
    const rareChance = professionLevelDef(level).rareChance * efficiency;
    if (unlockedRares.length > 0 && rng() < rareChance) {
      const rare =
        unlockedRares[Math.min(unlockedRares.length - 1, Math.floor(rng() * unlockedRares.length))];
      add(rare.id, 1);
    }
  }

  return Array.from(amounts, ([itemId, quantity]) => ({ itemId, quantity }));
}
