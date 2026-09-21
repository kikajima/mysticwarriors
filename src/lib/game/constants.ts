// =====================================================================
// CAMADA DE COMPATIBILIDADE — re-exporta o conteúdo centralizado.
// O conteúdo do jogo agora vive em ./content/* (data-driven).
// Novos códigos devem importar direto de ./content/*.
// =====================================================================

export { RACES, RACE_LIST, getRace } from './content/races';
export {
  TECHNIQUES,
  TRAINING_MASTERS,
  STRATEGIES,
  STRATEGY_LIST,
  getTechnique,
  getStrategy,
  slotsForCategory,
} from './content/techniques';
export {
  PROFESSIONS,
  PROFESSION_LEVELS,
  PROFESSION_MAX_LEVEL,
  PROFESSION_MASTERY_HOURS,
  PROFESSION_SHIFTS,
  DRAGON_BALL_SEARCH_SHIFTS,
  dragonBallSearchShift,
  DRAGON_BALL_SEARCH_MAX_CHANCE,
  DRAGON_BALL_PVP_STEAL_CHANCE,
  PROFESSION_MATERIALS,
  PROFESSION_MATERIAL_TIER_LEVEL,
  professionMaterialRequiredLevel,
  getProfession,
  getProfessionMaterial,
  ENEMIES,
  SHOP_ITEMS,
  REGEN,
  SELL_PRICE_RATIO,
  SHOP_MAX_QUANTITY,
  TRAIN_ENERGY_COST,
  BATTLE_ENERGY_COST,
  PROFESSION_ENERGY_COST,
  MAX_CHARACTERS_PER_ACCOUNT,
  GUILD_CREATION_COST,
  getItem,
  trainingGain,
  xpToNextLevel,
  baseTrainingCost,
  elixirPrice,
  professionEnergyCostOf,
  TRAINING_COST_CEILING,
  getEnemy,
  npcCombatPower,
} from './content/world';
export {
  professionLevel,
  professionLevelForHours,
  professionLevelTitle,
  professionLevelDef,
  professionHoursIntoLevel,
  professionShift,
  professionXpPerHour,
  professionShiftRewards,
  academicXpMultiplier,
  academicXpBonusPct,
  academicCraftTimeMultiplier,
  parseProfessions,
  serializeProfessions,
  rollProfessionLoot,
} from './professionCareer';
export {
  CRAFT_RECIPES,
  CRAFT_STACK_ITEMS,
  CRAFTED_ITEMS,
  getCraftRecipe,
  getCraftedItem,
  getCraftStackItem,
} from './content/crafting';
export { TRANSFORMATIONS, getTransformation, transformationsForRace } from './content/transformations';
export { randomWarriorName, BOTS } from './content/names';
export { DAILY_QUESTS, WEEKLY_QUESTS, ACHIEVEMENTS, getAchievement } from './content/quests';
export { COSMETICS, PRODUCTS, getCosmetic } from './content/cosmetics';
export { TALENTS, getTalent, parseTalents, validateTalentPurchase } from './content/talents';
// v0.9.18 — Torneio de Artes Marciais (chave de 8)
export {
  TOURNAMENT_ROUNDS,
  TOURNAMENT_COOLDOWN_MS,
  TOURNAMENT_ENTRY_FEE,
  QUARTAS_FIGHTERS,
  SEMI_FIGHTERS,
  FINAL_FIGHTERS,
  fightersForRound,
  fighterForRound,
  roundDef,
  tournamentRewards,
  tournamentXpReward,
  tournamentCooldownRemainingMs,
  parseTournament,
  type TournamentFighter,
  type TournamentRoundDef,
  type TournamentState,
} from './content/tournament';

import { baseTrainingCost } from './content/world';
import { raceEconomy } from './rules';

/** Custo de treino já com multiplicador racial (compatível com a UI). */
export function trainingCost(statValue: number, race: string): number {
  const econ = raceEconomy(race);
  return Math.max(1, Math.floor(baseTrainingCost(statValue) * econ.trainCostMult));
}
