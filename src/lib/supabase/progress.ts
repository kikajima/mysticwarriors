// =====================================================================
// Supabase — snapshot de progresso na nuvem
// ---------------------------------------------------------------------
// v3 (v0.9.6 — Mudança 3, SEPARAR PERSONAGEM DE CONTA):
//   * cada PERSONAGEM é uma linha própria na tabela `personagens` do
//     Supabase; a coluna `estado` guarda exatamente um
//     CloudCharacterSnapshot (agora com `id` e `cosmeticsOwned`);
//   * a CONTA (profiles) ficou apenas com o login — nenhum valor de jogo
//     pertence a ela; TODA leitura/escrita usa o ID DO PERSONAGEM;
//   * cosméticos comprados são do personagem (coluna estado/
//     Player.cosmeticsOwned) — não mais uma lista da conta.
//
// O formato v2 (profiles.progresso com characters[] + cosmeticsOwned da
// conta) continua sendo ACEITO na restauração: a lista de cosméticos da
// conta é duplicada para cada personagem, exatamente como na migração.
//
// v2 (v0.9.4): cada personagem também carrega missionId/missionEndsAt
// (turno em andamento), quests[], achievementsClaimed[] e relógios de
// regeneração.
//
// Direções:
//  - serializeCharacterForCloud: Player (Prisma) → snapshot (server-side,
//    chamado por /api/game/cloud-snapshot e pelo painel de admin);
//  - sanitize*: JSON desconhecido → snapshot VÁLIDO e limitado
//    (server-side, chamado por /api/game/cloud-restore). O usuário tem
//    acesso de escrita às próprias linhas no Supabase (RLS), então TODO
//    valor vindo da nuvem é tratado como NÃO CONFIÁVEL.
//
// O cliente apenas TRANSPORTA o snapshot (nunca o constrói) — a fonte
// da verdade é sempre o servidor do jogo.
// =====================================================================

import type { Player } from '@prisma/client';
import type {
  RaceId,
  ItemsState,
  Loadout,
  StrategyId,
  ProfessionsMap,
} from '@/lib/game/types';
import type { CosmeticSlot } from '@/lib/game/content/cosmetics';
import { COSMETICS, COSMETIC_SLOTS } from '@/lib/game/content/cosmetics';
import { RACES } from '@/lib/game/content/races';
import { TECHNIQUES, STRATEGIES } from '@/lib/game/content/techniques';
import { TRANSFORMATIONS } from '@/lib/game/content/transformations';
import { PROFESSIONS, PROFESSION_MATERIALS, SHOP_ITEMS, MAX_CHARACTERS_PER_ACCOUNT } from '@/lib/game/content/world';
import { CRAFTED_ITEMS, CRAFT_STACK_ITEMS, CRAFT_RECIPES, MAX_CRAFT_BATCH, getCraftRecipe } from '@/lib/game/content/crafting';
import { DAILY_QUESTS, WEEKLY_QUESTS, ACHIEVEMENTS } from '@/lib/game/content/quests';
import { TALENTS } from '@/lib/game/content/talents';
import { TOURNAMENT_ROUNDS } from '@/lib/game/content/tournament';
import {
  parseItems,
  parseTechniques,
  parseLoadout,
  parseTransformationsOwned,
  parseProfessions,
  parseCosmeticsOwned,
} from '@/lib/game/engine';
import { sanitizeProfessionsObject } from '@/lib/game/professionCareer';
import { CLOUD_PROGRESS_VERSION } from './config';

export { CLOUD_PROGRESS_VERSION };

// ===== Limites de sanitização (generosos p/ nunca punir jogador real) =====
const CLAMP = {
  level: [1, 999],
  xp: [0, 1_000_000_000],
  zeni: [0, 100_000_000],
  crystals: [0, 100_000],
  // v0.9: atributos altos concedidos pelo painel de admin devem
  // sobreviver a uma restauração futura da nuvem (limite defensivo alto)
  hp: [1, 10_000_000],
  energy: [0, 10_000_000],
  stat: [1, 999_999],
  counter: [0, 1_000_000],
  dragonBalls: [0, 7],
  consumableCount: [0, 999],
  professionCompletions: [0, 999],
  professionHours: [0, 10_000_000],
  materialQuantity: [0, 1_000_000],
  maxTechniques: 50,
  maxTransformations: 30,
  maxCosmetics: 100,
  maxMissionsCompleted: 500,
  maxAvatarUrlLength: 500,
  maxNameLength: 20,
  // v0.9.4
  maxQuests: 10,
  maxAchievements: 100,
  // v0.9.18 — torneio de artes marciais
  tournamentRound: [0, TOURNAMENT_ROUNDS.length],
  maxTalents: 10,
} as const;

// ===== Tipos =====

export interface CloudQuestSnapshot {
  questId: string;
  kind: 'daily' | 'weekly';
  period: string;
  progress: number;
  claimed: boolean;
}

export interface CloudAchievementSnapshot {
  achievementId: string;
  claimedAt: string | null;
}

export interface CloudMaterialSnapshot {
  itemId: string;
  quantity: number;
}

export interface CloudCraftJobSnapshot {
  recipeId: string;
  outputItemId: string;
  outputQuantity: number;
  outputKind: 'stack' | 'player_item';
  batchQuantity: number;
  academicLevelStart: number;
  startedAt: string;
  endsAt: string;
}

export interface CloudCharacterSnapshot {
  /** v0.9.6: id do personagem (chave da linha em `personagens` e do Player
   * local — o mesmo nos dois lados). null = dado legado (v2) sem id. */
  id: string | null;
  name: string;
  race: RaceId;
  // v0.16 — gender REMOVIDO do snapshot de nuvem (mecânica extinta).
  // Snapshots LEGADOS no `estado` JSONB ainda podem conter "gender": a
  // sanitização simplesmente ignora o campo (leitura tolerante) e o
  // próximo save sobrescreve a linha sem ele. Ver supabase-remove-gender.sql.
  avatarUrl: string | null;
  level: number;
  xp: number;
  zeni: number;
  crystals: number;
  hp: number;
  energy: number;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
  battlesWon: number;
  battlesLost: number;
  pvpWins: number;
  trainingsDone: number;
  guildDonated: number;
  missionsDone: number;
  dragonBalls: number;
  /** Maestria própria da Oficina; ausente em snapshots antigos = 0. */
  craftingXp?: number;
  craftsCompleted?: number;
  items: ItemsState;
  techniques: string[];
  loadout: Loadout;
  strategy: StrategyId;
  missionsCompleted: string[];
  professions: ProfessionsMap;
  transformationId: string | null;
  transformationsOwned: string[];
  cosmeticsEquipped: Partial<Record<CosmeticSlot, string>>;
  /** v0.9.6: cosméticos COMPRADOS por ESTE personagem (posse própria). */
  cosmeticsOwned: string[];
  // ===== v0.9.4 — estado que antes ficava só no servidor =====
  /** Turno de profissão em andamento (id + início + duração + término). */
  missionId: string | null;
  missionStartedAt?: string | null;
  missionEndsAt: string | null;
  missionHours?: 1 | 2 | 4 | 8 | null;
  /** Materiais profissionais relacionais espelhados para recuperação. */
  materials?: CloudMaterialSnapshot[];
  /** Fila persistente da Oficina; ingredientes já foram consumidos no início. */
  craftJobs?: CloudCraftJobSnapshot[];
  /** Campo legado (snapshot de fila única); aceito apenas na restauração. */
  craftJob?: CloudCraftJobSnapshot | null;
  /** Relógios de regeneração (energia/vida continuam contando offline). */
  lastRegen: string;
  lastRegenHp: string | null;
  /** Diárias/semanais do período corrente (recompensas NUNCA vêm daqui). */
  quests: CloudQuestSnapshot[];
  /** Conquistas com recompensa já coletada (o progresso é derivado dos contadores). */
  achievementsClaimed: CloudAchievementSnapshot[];
  // ===== v0.9.15–v0.9.18 — progressão recente =====
  /** Talentos de Ímpeto (Cap. 7) dominados por ESTE personagem. */
  talents: string[];
  /** Conquistas narrativas: Milagre no Limite (vitória com Quebra). */
  miracleWins: number;
  /** Conquistas narrativas: David vs Golias (reposicionamento vs gigante). */
  davidWins: number;
  /** Estado da campanha do Torneio de Artes Marciais (null = nunca jogou). */
  tournament: CloudTournamentSnapshot | null;
  /** Títulos de campeão do torneio conquistados. */
  tournamentTitles: number;
  /** Lutas de torneio vencidas no total. */
  tournamentRoundWins: number;
}

/** v0.9.18 — campanha do torneio na nuvem (subconjunto sanitizado do estado). */
export interface CloudTournamentSnapshot {
  round: number;
  wins: number;
  runCount: number;
  bestRound: number;
  lastRunAt: string | null;
}

export interface CloudProgress {
  version: number;
  savedAt: string;
  activePlayerName: string | null;
  characters: CloudCharacterSnapshot[];
  cosmeticsOwned: string[];
}

// ===== Conjuntos de ids conhecidos (catálogos do jogo) =====

const KNOWN = {
  races: new Set(Object.keys(RACES)),
  techniques: new Set(TECHNIQUES.map((t) => t.id)),
  transformations: new Set(TRANSFORMATIONS.map((t) => t.id)),
  items: new Set([...SHOP_ITEMS, ...CRAFTED_ITEMS].map((i) => i.id)),
  professions: new Set<string>(PROFESSIONS.map((p) => p.id)),
  materials: new Set([...PROFESSION_MATERIALS, ...CRAFT_STACK_ITEMS].map((m) => m.id)),
  recipes: new Set(CRAFT_RECIPES.map((r) => r.id)),
  cosmetics: new Set(COSMETICS.map((c) => c.id)),
  strategies: new Set(Object.keys(STRATEGIES)),
  // v0.9.18 — talentos de Ímpeto (Cap. 7) dominados
  talents: new Set(TALENTS.map((t) => t.id)),
  // v0.9.4 — quests/conquistas (id → definição; só o PROGRESSO vem da
  // nuvem; alvos e recompensas são SEMPRE recalculados dos catálogos)
  quests: new Map(
    [...DAILY_QUESTS, ...WEEKLY_QUESTS].map((q) => [q.id, { kind: q.kind, target: q.target }])
  ),
  achievements: new Set(ACHIEVEMENTS.map((a) => a.id)),
} as const;

const PERIOD_DAILY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_WEEKLY_RE = /^\d{4}-W\d{2}$/;

// ===== Utilidades =====

function clampInt(value: unknown, [min, max]: readonly [number, number]): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function asString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > maxLen) return null;
  return v;
}

function dedupeFilter(list: unknown, known: Set<string>, cap: number): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const entry of list) {
    if (typeof entry === 'string' && known.has(entry) && !out.includes(entry)) {
      out.push(entry);
      if (out.length >= cap) break;
    }
  }
  return out;
}

function safeAvatarUrl(value: unknown): string | null {
  const raw = asString(value, CLAMP.maxAvatarUrlLength);
  if (!raw) return null;
  // apenas http(s) absoluto ou caminho interno de avatar servido pelo jogo
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/api/game/avatars/')) return raw;
  return null;
}

function sanitizeName(value: unknown): string | null {
  const raw = asString(value, CLAMP.maxNameLength);
  if (!raw || raw.length < 2) return null;
  if (!/^[\p{L}\p{N} _-]+$/u.test(raw)) return null;
  return raw;
}

/** Data ISO dentro de uma janela segura; fora dela (ou inválida) → null. */
function sanitizeIsoDate(value: unknown, maxAgoMs: number, maxAheadMs: number): Date | null {
  if (typeof value !== 'string' || value.length < 10 || value.length > 40) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  if (t < now - maxAgoMs || t > now + maxAheadMs) return null;
  return new Date(t);
}

/** Diárias/semanais do período corrente — só o PROGRESSO é confiado. */
function sanitizeQuests(raw: unknown): CloudQuestSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: CloudQuestSnapshot[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (out.length >= CLAMP.maxQuests) break;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const questId = asString(e.questId, 64);
    if (!questId) continue;
    const def = KNOWN.quests.get(questId);
    if (!def) continue;
    const kind = e.kind === 'weekly' ? 'weekly' : 'daily';
    if (kind !== def.kind) continue;
    const period = asString(e.period, 16);
    if (!period) continue;
    if (kind === 'daily' && !PERIOD_DAILY_RE.test(period)) continue;
    if (kind === 'weekly' && !PERIOD_WEEKLY_RE.test(period)) continue;
    const key = `${questId}:${period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      questId,
      kind,
      period,
      progress: clampInt(e.progress, [0, def.target]),
      claimed: e.claimed === true,
    });
  }
  return out;
}

/** Conquistas já coletadas — ids do catálogo, data razoável. */
function sanitizeAchievementsClaimed(raw: unknown): CloudAchievementSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: CloudAchievementSnapshot[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (out.length >= CLAMP.maxAchievements) break;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const achievementId = asString(e.achievementId, 64);
    if (!achievementId || !KNOWN.achievements.has(achievementId) || seen.has(achievementId)) continue;
    seen.add(achievementId);
    const claimedAt = sanitizeIsoDate(e.claimedAt, 400 * 86400_000, 5 * 60_000);
    out.push({ achievementId, claimedAt: claimedAt ? claimedAt.toISOString() : null });
  }
  return out;
}

/** Turno de profissão em andamento — id válido + término dentro da janela. */
function sanitizeMission(
  rawId: unknown,
  rawStartedAt: unknown,
  rawEndsAt: unknown,
  rawHours: unknown
): { missionId: string; missionStartedAt: string; missionEndsAt: string; missionHours: 1 | 2 | 4 | 8 } | null {
  const missionId = asString(rawId, 64);
  if (!missionId || !KNOWN.professions.has(missionId)) return null;
  // Janela generosa: turno máximo é 8h; aceitamos vencidos de até 7 dias e
  // até 48h no futuro para tolerar relógios/abas antigas sem aceitar absurdo.
  const endsAt = sanitizeIsoDate(rawEndsAt, 7 * 86400_000, 48 * 3600_000);
  if (!endsAt) return null;
  const parsedHours = Math.trunc(Number(rawHours));
  const missionHours = ([1, 2, 4, 8].includes(parsedHours) ? parsedHours : 1) as 1 | 2 | 4 | 8;
  const startedAt =
    sanitizeIsoDate(rawStartedAt, 7 * 86400_000, 5 * 60_000) ??
    new Date(endsAt.getTime() - missionHours * 3600_000);
  return {
    missionId,
    missionStartedAt: startedAt.toISOString(),
    missionEndsAt: endsAt.toISOString(),
    missionHours,
  };
}

/** Fabricação em andamento vinda da nuvem — catálogo atual é autoritativo. */
function sanitizeCraftJob(raw: unknown): CloudCraftJobSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  const recipeId = asString(c.recipeId, 100);
  if (!recipeId || !KNOWN.recipes.has(recipeId)) return null;
  const recipe = getCraftRecipe(recipeId);
  if (!recipe) return null;

  // Lotes de Tier 5 podem durar até ~10 dias e uma fila de três itens pode
  // terminar quase 30 dias à frente. A janela continua limitada, mas precisa
  // aceitar essa duração legítima.
  const endsAt = sanitizeIsoDate(c.endsAt, 45 * 86400_000, 35 * 86400_000);
  if (!endsAt) return null;
  const startedAt =
    sanitizeIsoDate(c.startedAt, 45 * 86400_000, 35 * 86400_000) ??
    new Date(endsAt.getTime() - recipe.baseDurationMin * 60_000);

  const inferredBatch = Math.max(
    1,
    Math.min(
      MAX_CRAFT_BATCH,
      clampInt(
        c.batchQuantity ??
          Math.max(1, Math.floor(Number(c.outputQuantity ?? recipe.outputQuantity) / recipe.outputQuantity)),
        [1, MAX_CRAFT_BATCH]
      )
    )
  );

  return {
    recipeId: recipe.id,
    outputItemId: recipe.outputItemId,
    outputQuantity: recipe.outputQuantity * inferredBatch,
    outputKind: recipe.outputKind,
    batchQuantity: inferredBatch,
    academicLevelStart: clampInt(c.academicLevelStart, [0, 10]),
    startedAt: startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

function sanitizeCraftJobs(raw: unknown, legacy: unknown): CloudCraftJobSnapshot[] {
  const source = Array.isArray(raw) ? raw.slice(0, 3) : legacy ? [legacy] : [];
  return source
    .map(sanitizeCraftJob)
    .filter((job): job is CloudCraftJobSnapshot => job !== null)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .slice(0, 3);
}

// =====================================================================
// SERIALIZAÇÃO: entidades Prisma → snapshot (fonte: servidor do jogo)
// =====================================================================

/** Extras do personagem coletados do banco (server-side) — v0.9.4. */
export interface CharacterExtras {
  quests: CloudQuestSnapshot[];
  achievements: CloudAchievementSnapshot[];
  materials?: CloudMaterialSnapshot[];
  craftJobs?: CloudCraftJobSnapshot[];
  /** Legado para snapshots antigos; serialização nova usa craftJobs. */
  craftJob?: CloudCraftJobSnapshot | null;
}

export function serializeCharacterForCloud(
  player: Player,
  extras?: CharacterExtras
): CloudCharacterSnapshot {
  return {
    id: player.id,
    name: player.name,
    race: player.race as RaceId,
    avatarUrl: player.avatarUrl ?? null,
    level: player.level,
    xp: player.xp,
    zeni: player.zeni,
    crystals: player.crystals,
    hp: player.hp,
    energy: player.energy,
    strength: player.strength,
    defense: player.defense,
    speed: player.speed,
    ki: player.ki,
    battlesWon: player.battlesWon,
    battlesLost: player.battlesLost,
    pvpWins: player.pvpWins,
    trainingsDone: player.trainingsDone,
    guildDonated: player.guildDonated,
    missionsDone: player.missionsDone,
    dragonBalls: player.dragonBalls,
    craftingXp: player.craftingXp,
    craftsCompleted: player.craftsCompleted,
    items: parseItems(player.items),
    techniques: parseTechniques(player.techniques),
    loadout: parseLoadout(player.loadout),
    strategy: (STRATEGIES[player.strategy as StrategyId] ? (player.strategy as StrategyId) : 'balanced'),
    missionsCompleted: parseJsonArray(player.missionsCompleted, CLAMP.maxMissionsCompleted),
    professions: parseProfessions(player.professions),
    transformationId: player.transformationId ?? null,
    transformationsOwned: parseTransformationsOwned(player.transformationsOwned),
    cosmeticsEquipped: parseEquippedCosmetics(player.cosmeticsEquipped),
    // v0.9.6: posse de cosméticos DESTE personagem
    cosmeticsOwned: parseCosmeticsOwned(player.cosmeticsOwned),
    // v0.9.4
    missionId: player.missionId ?? null,
    missionStartedAt: player.missionStartedAt ? player.missionStartedAt.toISOString() : null,
    missionEndsAt: player.missionEndsAt ? player.missionEndsAt.toISOString() : null,
    missionHours: ([1, 2, 4, 8].includes(player.missionHours ?? 0) ? player.missionHours : null) as 1 | 2 | 4 | 8 | null,
    materials: extras?.materials ?? [],
    craftJobs: extras?.craftJobs ?? (extras?.craftJob ? [extras.craftJob] : []),
    lastRegen: player.lastRegen ? new Date(player.lastRegen).toISOString() : new Date().toISOString(),
    lastRegenHp: player.lastRegenHp ? new Date(player.lastRegenHp).toISOString() : null,
    quests: extras?.quests ?? [],
    achievementsClaimed: extras?.achievements ?? [],
    // v0.9.15–v0.9.18 — progressão recente (talentos, narrativas, torneio)
    talents: parseTalentsCloud(player.talents),
    miracleWins: player.miracleWins,
    davidWins: player.davidWins,
    tournament: parseTournamentCloud(player.tournament),
    tournamentTitles: player.tournamentTitles,
    tournamentRoundWins: player.tournamentRoundWins,
  };
}

/** Talentos válidos do catálogo (defensivo — nunca confia no JSON salvo). */
function parseTalentsCloud(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is string => typeof e === 'string' && KNOWN.talents.has(e)).slice(0, CLAMP.maxTalents);
  } catch {
    return [];
  }
}

/** Estado do torneio (JSON da coluna) → snapshot de nuvem sanitizado. */
function parseTournamentCloud(raw: string | null): CloudTournamentSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clampRound = (v: unknown) => Math.max(0, Math.min(TOURNAMENT_ROUNDS.length, Math.trunc(Number(v) || 0)));
    return {
      round: clampRound(parsed.round),
      wins: clampInt(parsed.wins, CLAMP.tournamentRound),
      runCount: clampInt(parsed.runCount, CLAMP.counter),
      bestRound: clampRound(parsed.bestRound),
      lastRunAt: sanitizeIsoDate(parsed.lastRunAt, 400 * 86400_000, 5 * 60_000)?.toISOString() ?? null,
    };
  } catch {
    return null;
  }
}

function parseJsonArray(raw: string | null, cap: number): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is string => typeof e === 'string').slice(0, cap);
  } catch {
    return [];
  }
}

function parseEquippedCosmetics(raw: string | null): Partial<Record<CosmeticSlot, string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Partial<Record<CosmeticSlot, string>> = {};
    for (const [slot, id] of Object.entries(parsed as Record<string, unknown>)) {
      if (COSMETIC_SLOTS.has(slot) && typeof id === 'string' && KNOWN.cosmetics.has(id)) {
        out[slot as CosmeticSlot] = id;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeProgressForCloud(
  players: Player[],
  cosmeticsOwned: string[],
  activePlayerName: string | null,
  extrasByPlayerId?: Map<string, CharacterExtras>
): CloudProgress {
  return {
    version: CLOUD_PROGRESS_VERSION,
    savedAt: new Date().toISOString(),
    activePlayerName,
    characters: players.map((p) => serializeCharacterForCloud(p, extrasByPlayerId?.get(p.id))),
    cosmeticsOwned: cosmeticsOwned.filter((id) => KNOWN.cosmetics.has(id)),
  };
}

// =====================================================================
// SANITIZAÇÃO: JSON da nuvem (não confiável) → snapshot válido
// =====================================================================

export class CloudValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudValidationError';
  }
}

function sanitizeItems(raw: unknown): ItemsState {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const owned = dedupeFilter(src.owned, KNOWN.items, 200);
  const pickEquipped = (key: 'weapon' | 'armor' | 'head' | 'wrists' | 'legs' | 'boots' | 'accessory'): string | null => {
    const id = asString(src[key], 64);
    return id && KNOWN.items.has(id) && owned.includes(id) ? id : null;
  };
  const consumablesSrc = (src.consumables && typeof src.consumables === 'object' ? src.consumables : {}) as Record<string, unknown>;
  const consumables: Record<string, number> = {};
  for (const [id, count] of Object.entries(consumablesSrc)) {
    if (KNOWN.items.has(id)) {
      const n = clampInt(count, CLAMP.consumableCount);
      if (n > 0) consumables[id] = n;
    }
  }
  // v0.9.10: quantidades de equipamento/treino (stacks de reservas) —
  // só ids conhecidos E presentes em owned; 1 unidade é implícita (sem
  // entrada no mapa). Valor inválido/ausente = descarta a entrada (NUNCA
  // inventa unidade — clampInt com mínimo 2 fabricaria stacks falsas).
  const stacksSrc = src.stacks && typeof src.stacks === 'object' && !Array.isArray(src.stacks) ? src.stacks : {};
  const stacks: Record<string, number> = {};
  for (const [id, qty] of Object.entries(stacksSrc as Record<string, unknown>)) {
    if (KNOWN.items.has(id) && owned.includes(id)) {
      const n = typeof qty === 'number' ? qty : Number(qty);
      if (Number.isFinite(n)) {
        const clean = Math.trunc(n);
        if (clean >= 2 && clean <= 999) stacks[id] = clean;
      }
    }
  }
  return {
    weapon: pickEquipped('weapon'),
    armor: pickEquipped('armor'),
    head: pickEquipped('head'),
    wrists: pickEquipped('wrists'),
    legs: pickEquipped('legs'),
    boots: pickEquipped('boots'),
    accessory: pickEquipped('accessory'),
    owned,
    consumables,
    stacks,
  };
}

function sanitizeLoadout(raw: unknown, techniques: string[]): Loadout {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (slot: '1' | '2' | '3' | 'S'): string | null => {
    const id = asString(src[slot], 64);
    return id && techniques.includes(id) ? id : null;
  };
  return { '1': pick('1'), '2': pick('2'), '3': pick('3'), S: pick('S') };
}

function sanitizeProfessions(raw: unknown): ProfessionsMap {
  return sanitizeProfessionsObject(raw);
}

function sanitizeMaterials(raw: unknown): CloudMaterialSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const totals = new Map<string, number>();
  for (const entry of raw.slice(0, 200)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const itemId = asString(row.itemId, 64);
    if (!itemId || !KNOWN.materials.has(itemId)) continue;
    const quantity = clampInt(row.quantity, CLAMP.materialQuantity);
    if (quantity <= 0) continue;
    totals.set(itemId, Math.min(CLAMP.materialQuantity[1], (totals.get(itemId) ?? 0) + quantity));
  }
  return Array.from(totals, ([itemId, quantity]) => ({ itemId, quantity }));
}

function sanitizeCharacter(raw: unknown, accountCosmetics: string[]): CloudCharacterSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CloudValidationError('Personagem inválido no progresso salvo.');
  }
  const c = raw as Record<string, unknown>;

  const name = sanitizeName(c.name);
  if (!name) throw new CloudValidationError('Nome de guerreiro inválido no progresso salvo.');

  const race = asString(c.race, 32);
  if (!race || !KNOWN.races.has(race)) {
    throw new CloudValidationError(`Raça inválida para o guerreiro "${name}".`);
  }

  // v0.9.6: posse de cosméticos DESTE personagem; snapshot v2 (lista na
  // CONTA) é duplicada para cada personagem — mesma regra da migração.
  const ownList = dedupeFilter(c.cosmeticsOwned, KNOWN.cosmetics, CLAMP.maxCosmetics);
  const cosmeticsOwned = ownList.length > 0 ? ownList : accountCosmetics;

  const techniques = dedupeFilter(c.techniques, KNOWN.techniques, CLAMP.maxTechniques);
  const transformationsOwned = dedupeFilter(c.transformationsOwned, KNOWN.transformations, CLAMP.maxTransformations);
  const transformationIdRaw = asString(c.transformationId, 64);
  const transformationId =
    transformationIdRaw && KNOWN.transformations.has(transformationIdRaw) && transformationsOwned.includes(transformationIdRaw)
      ? transformationIdRaw
      : null;

  // equipados só valem se o PRÓPRIO personagem possui o cosmético
  const equipped: Partial<Record<CosmeticSlot, string>> = {};
  const equippedSrc = (c.cosmeticsEquipped && typeof c.cosmeticsEquipped === 'object' ? c.cosmeticsEquipped : {}) as Record<string, unknown>;
  for (const [slot, id] of Object.entries(equippedSrc)) {
    if (COSMETIC_SLOTS.has(slot) && typeof id === 'string' && KNOWN.cosmetics.has(id) && cosmeticsOwned.includes(id)) {
      equipped[slot as CosmeticSlot] = id;
    }
  }

  const strategyRaw = asString(c.strategy, 32);
  const strategy: StrategyId = strategyRaw && KNOWN.strategies.has(strategyRaw) ? (strategyRaw as StrategyId) : 'balanced';

  // v0.9.4 — turno em andamento, relógios, quests e conquistas
  const mission = sanitizeMission(c.missionId, c.missionStartedAt, c.missionEndsAt, c.missionHours);
  const lastRegen = sanitizeIsoDate(c.lastRegen, 30 * 86400_000, 5 * 60_000) ?? new Date();
  const lastRegenHp = sanitizeIsoDate(c.lastRegenHp, 30 * 86400_000, 5 * 60_000);

  return {
    id: asString(c.id, 64),
    name,
    race: race as RaceId,
    avatarUrl: safeAvatarUrl(c.avatarUrl),
    level: clampInt(c.level, CLAMP.level),
    xp: clampInt(c.xp, CLAMP.xp),
    zeni: clampInt(c.zeni, CLAMP.zeni),
    crystals: clampInt(c.crystals, CLAMP.crystals),
    hp: clampInt(c.hp, CLAMP.hp),
    energy: clampInt(c.energy, CLAMP.energy),
    strength: clampInt(c.strength, CLAMP.stat),
    defense: clampInt(c.defense, CLAMP.stat),
    speed: clampInt(c.speed, CLAMP.stat),
    ki: clampInt(c.ki, CLAMP.stat),
    battlesWon: clampInt(c.battlesWon, CLAMP.counter),
    battlesLost: clampInt(c.battlesLost, CLAMP.counter),
    pvpWins: clampInt(c.pvpWins, CLAMP.counter),
    trainingsDone: clampInt(c.trainingsDone, CLAMP.counter),
    guildDonated: clampInt(c.guildDonated, CLAMP.counter),
    missionsDone: clampInt(c.missionsDone, CLAMP.counter),
    dragonBalls: clampInt(c.dragonBalls, CLAMP.dragonBalls),
    craftingXp: clampInt(c.craftingXp, CLAMP.xp),
    craftsCompleted: clampInt(c.craftsCompleted, CLAMP.counter),
    items: sanitizeItems(c.items),
    techniques,
    loadout: sanitizeLoadout(c.loadout, techniques),
    strategy,
    missionsCompleted: Array.isArray(c.missionsCompleted)
      ? c.missionsCompleted.filter((e): e is string => typeof e === 'string' && e.length <= 64).slice(0, CLAMP.maxMissionsCompleted)
      : [],
    professions: sanitizeProfessions(c.professions),
    transformationId,
    transformationsOwned,
    cosmeticsEquipped: equipped,
    cosmeticsOwned,
    missionId: mission?.missionId ?? null,
    missionStartedAt: mission?.missionStartedAt ?? null,
    missionEndsAt: mission?.missionEndsAt ?? null,
    missionHours: mission?.missionHours ?? null,
    materials: sanitizeMaterials(c.materials),
    craftJobs: sanitizeCraftJobs(c.craftJobs, c.craftJob),
    lastRegen: lastRegen.toISOString(),
    lastRegenHp: lastRegenHp ? lastRegenHp.toISOString() : null,
    quests: sanitizeQuests(c.quests),
    achievementsClaimed: sanitizeAchievementsClaimed(c.achievementsClaimed),
    // v0.9.15–v0.9.18 — talentos/narrativas/torneio (ausente em snapshots
    // antigos → padrões seguros; ids fora do catálogo são descartados)
    talents: dedupeFilter(c.talents, KNOWN.talents, CLAMP.maxTalents),
    miracleWins: clampInt(c.miracleWins, CLAMP.counter),
    davidWins: clampInt(c.davidWins, CLAMP.counter),
    tournament: sanitizeTournamentCloud(c.tournament),
    tournamentTitles: clampInt(c.tournamentTitles, CLAMP.counter),
    tournamentRoundWins: clampInt(c.tournamentRoundWins, CLAMP.counter),
  };
}

/** Campanha do torneio vinda da nuvem (não confiável) → estado válido. */
function sanitizeTournamentCloud(raw: unknown): CloudTournamentSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const clampRound = (v: unknown) => Math.max(0, Math.min(TOURNAMENT_ROUNDS.length, Math.trunc(Number(v) || 0)));
  return {
    round: clampRound(t.round),
    wins: clampInt(t.wins, CLAMP.tournamentRound),
    runCount: clampInt(t.runCount, CLAMP.counter),
    bestRound: clampRound(t.bestRound),
    lastRunAt: sanitizeIsoDate(t.lastRunAt, 400 * 86400_000, 5 * 60_000)?.toISOString() ?? null,
  };
}

/**
 * Sanitiza o `estado` de UMA linha da tabela `personagens` (v0.9.6).
 * Usado pela rota de restauração para cada personagem individualmente —
 * mesma defesa em profundidade de sempre (catálogos, clamps, janelas).
 */
export function sanitizeCloudCharacterState(raw: unknown): CloudCharacterSnapshot {
  return sanitizeCharacter(raw, []);
}

/**
 * Valida e sanitiza um `progresso` vindo da nuvem.
 * Lança CloudValidationError quando a estrutura é irrecuperável.
 */
export function sanitizeCloudProgress(raw: unknown): CloudProgress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CloudValidationError('Progresso salvo em formato inválido.');
  }
  const p = raw as Record<string, unknown>;

  const cosmeticsOwned = dedupeFilter(p.cosmeticsOwned, KNOWN.cosmetics, CLAMP.maxCosmetics);

  const charsRaw = Array.isArray(p.characters) ? p.characters : [];
  if (charsRaw.length > MAX_CHARACTERS_PER_ACCOUNT) {
    throw new CloudValidationError(`Progresso com mais de ${MAX_CHARACTERS_PER_ACCOUNT} personagens.`);
  }

  const characters: CloudCharacterSnapshot[] = [];
  const seenNames = new Set<string>();
  for (const charRaw of charsRaw) {
    const char = sanitizeCharacter(charRaw, cosmeticsOwned);
    if (seenNames.has(char.name)) continue; // duplicata no snapshot → ignora
    seenNames.add(char.name);
    characters.push(char);
  }

  const activePlayerName = sanitizeName(p.activePlayerName);

  return {
    version: CLOUD_PROGRESS_VERSION,
    savedAt: asString(p.savedAt, 40) ?? new Date().toISOString(),
    activePlayerName,
    characters,
    cosmeticsOwned,
  };
}

/**
 * Snapshot sanitizado → dados de criação Prisma (Player.create).
 * v0.9.4: também leva o turno em andamento e os relógios de regeneração
 * (quests/conquistas são restauradas separadamente pela rota de
 * restauração, que revalida contra os catálogos).
 */
export function cloudCharacterToPlayerData(char: CloudCharacterSnapshot, nameOverride?: string): {
  id?: string;
  name: string;
  race: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  zeni: number;
  crystals: number;
  hp: number;
  energy: number;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
  battlesWon: number;
  battlesLost: number;
  pvpWins: number;
  trainingsDone: number;
  guildDonated: number;
  missionsDone: number;
  dragonBalls: number;
  craftingXp: number;
  craftsCompleted: number;
  items: string;
  techniques: string;
  loadout: string;
  strategy: string;
  missionsCompleted: string;
  professions: string;
  transformationId: string | null;
  transformationsOwned: string;
  cosmeticsEquipped: string;
  cosmeticsOwned: string;
  missionId: string | null;
  missionStartedAt: Date | null;
  missionEndsAt: Date | null;
  missionHours: number | null;
  lastRegen: Date;
  lastRegenHp: Date | null;
  talents: string;
  miracleWins: number;
  davidWins: number;
  tournament: string | null;
  tournamentTitles: number;
  tournamentRoundWins: number;
} {
  return {
    // v0.9.6: quando a linha da nuvem tem id, o Player local NASCE com o
    // MESMO id — o personagem mantém a identidade entre nuvem e servidor
    // (o próximo save sobrescreve a própria linha, nunca duplica).
    ...(char.id ? { id: char.id } : {}),
    name: nameOverride ?? char.name,
    race: char.race,
    avatarUrl: char.avatarUrl,
    level: char.level,
    xp: char.xp,
    zeni: char.zeni,
    crystals: char.crystals,
    hp: char.hp,
    energy: char.energy,
    strength: char.strength,
    defense: char.defense,
    speed: char.speed,
    ki: char.ki,
    battlesWon: char.battlesWon,
    battlesLost: char.battlesLost,
    pvpWins: char.pvpWins,
    trainingsDone: char.trainingsDone,
    guildDonated: char.guildDonated,
    missionsDone: char.missionsDone,
    dragonBalls: char.dragonBalls,
    craftingXp: char.craftingXp ?? 0,
    craftsCompleted: char.craftsCompleted ?? 0,
    items: JSON.stringify(char.items),
    techniques: JSON.stringify(char.techniques),
    loadout: JSON.stringify(char.loadout),
    strategy: char.strategy,
    missionsCompleted: JSON.stringify(char.missionsCompleted),
    professions: JSON.stringify(char.professions),
    transformationId: char.transformationId,
    transformationsOwned: JSON.stringify(char.transformationsOwned),
    cosmeticsEquipped: JSON.stringify(char.cosmeticsEquipped),
    cosmeticsOwned: JSON.stringify(char.cosmeticsOwned),
    missionId: char.missionId,
    missionStartedAt: char.missionStartedAt ? new Date(char.missionStartedAt) : null,
    missionEndsAt: char.missionEndsAt ? new Date(char.missionEndsAt) : null,
    missionHours: char.missionHours ?? null,
    lastRegen: new Date(char.lastRegen),
    lastRegenHp: char.lastRegenHp ? new Date(char.lastRegenHp) : null,
    // v0.9.15–v0.9.18 — talentos, narrativas e torneio sobrevivem à nuvem
    talents: JSON.stringify(char.talents),
    miracleWins: char.miracleWins,
    davidWins: char.davidWins,
    tournament: char.tournament ? JSON.stringify(char.tournament) : null,
    tournamentTitles: char.tournamentTitles,
    tournamentRoundWins: char.tournamentRoundWins,
  };
}
