import type {
  GuildRankingCategory,
  GuildRankingEntry,
  PlayerRankingCategory,
  RankingEntry,
} from './types';

export const PLAYER_RANKING_CATEGORIES: Array<{
  id: PlayerRankingCategory;
  label: string;
  shortLabel: string;
  icon: string;
}> = [
  { id: 'level', label: 'Nível', shortLabel: 'Nível', icon: '⭐' },
  { id: 'power', label: 'Nível de Poder', shortLabel: 'Poder', icon: '⚡' },
  { id: 'tournament', label: 'Vitórias no Torneio', shortLabel: 'Torneio', icon: '🏆' },
  { id: 'boss_damage', label: 'Dano à Ameaça Global', shortLabel: 'Ameaça', icon: '🌌' },
];

export const GUILD_RANKING_CATEGORIES: Array<{
  id: GuildRankingCategory;
  label: string;
  shortLabel: string;
  icon: string;
}> = [
  { id: 'guild_power', label: 'Poder Total', shortLabel: 'Poder', icon: '⚡' },
  { id: 'guild_level', label: 'Nível da Guilda', shortLabel: 'Nível', icon: '🛡️' },
  { id: 'guild_tournament', label: 'Vitórias no Torneio', shortLabel: 'Torneio', icon: '🏆' },
  { id: 'guild_boss_damage', label: 'Dano à Ameaça Global', shortLabel: 'Ameaça', icon: '🌌' },
];

export function sortPlayerRankingEntries(entries: RankingEntry[], category: PlayerRankingCategory): RankingEntry[] {
  return [...entries].sort((a, b) => {
    if (category === 'power') return b.power - a.power || b.level - a.level || b.battlesWon - a.battlesWon || a.name.localeCompare(b.name);
    if (category === 'tournament') return b.tournamentWins - a.tournamentWins || b.tournamentTitles - a.tournamentTitles || b.power - a.power || a.name.localeCompare(b.name);
    if (category === 'boss_damage') return b.totalBossDamage - a.totalBossDamage || b.power - a.power || b.level - a.level || a.name.localeCompare(b.name);
    return b.level - a.level || b.power - a.power || b.battlesWon - a.battlesWon || a.name.localeCompare(b.name);
  });
}

export function sortGuildRankingEntries(entries: GuildRankingEntry[], category: GuildRankingCategory): GuildRankingEntry[] {
  return [...entries].sort((a, b) => {
    if (category === 'guild_level') return b.level - a.level || b.xp - a.xp || b.totalPower - a.totalPower || a.name.localeCompare(b.name);
    if (category === 'guild_tournament') return b.tournamentWins - a.tournamentWins || b.tournamentTitles - a.tournamentTitles || b.totalPower - a.totalPower || a.name.localeCompare(b.name);
    if (category === 'guild_boss_damage') return b.totalBossDamage - a.totalBossDamage || b.totalPower - a.totalPower || a.name.localeCompare(b.name);
    return b.totalPower - a.totalPower || b.averagePower - a.averagePower || b.level - a.level || a.name.localeCompare(b.name);
  });
}

export function playerRankingMetric(entry: RankingEntry, category: PlayerRankingCategory): number {
  if (category === 'power') return entry.power;
  if (category === 'tournament') return entry.tournamentWins;
  if (category === 'boss_damage') return entry.totalBossDamage;
  return entry.level;
}

export function guildRankingMetric(entry: GuildRankingEntry, category: GuildRankingCategory): number {
  if (category === 'guild_level') return entry.level;
  if (category === 'guild_tournament') return entry.tournamentWins;
  if (category === 'guild_boss_damage') return entry.totalBossDamage;
  return entry.totalPower;
}
