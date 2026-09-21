import type { GuildRankingCategory, WarriorRankingCategory } from './types';

export const WARRIOR_RANKING_CATEGORIES: ReadonlyArray<{
  id: WarriorRankingCategory;
  label: string;
  icon: string;
  description: string;
}> = [
  { id: 'level', label: 'Nível', icon: '📈', description: 'Maior nível de personagem.' },
  { id: 'power', label: 'Nível de Poder', icon: '⚡', description: 'Poder atual do scouter, incluindo equipamentos e efeitos ativos.' },
  { id: 'tournament', label: 'Vitórias no Torneio', icon: '🏆', description: 'Total histórico de lutas vencidas no Torneio de Artes Marciais.' },
  { id: 'boss_damage', label: 'Dano em Ameaças', icon: '☄️', description: 'Dano histórico somado em todas as Ameaças Globais registradas.' },
];

export const GUILD_RANKING_CATEGORIES: ReadonlyArray<{
  id: GuildRankingCategory;
  label: string;
  icon: string;
  description: string;
}> = [
  { id: 'power', label: 'Poder Total', icon: '⚡', description: 'Soma do poder atual de todos os membros da guilda.' },
  { id: 'level', label: 'Nível da Guilda', icon: '🛡️', description: 'Nível atual da guilda; XP e poder total resolvem empates.' },
];

export interface RankableWarrior {
  name: string;
  level: number;
  xp: number;
  power: number;
  tournamentWins: number;
  tournamentTitles: number;
  bossDamage: number;
}

export interface RankableGuild {
  name: string;
  level: number;
  xp: number;
  totalPower: number;
  memberCount: number;
  totalDonated: number;
}

const desc = (a: number, b: number) => b - a;

export function compareWarriorRanking(
  a: RankableWarrior,
  b: RankableWarrior,
  category: WarriorRankingCategory
): number {
  let primary = 0;
  if (category === 'level') primary = desc(a.level, b.level) || desc(a.xp, b.xp);
  else if (category === 'power') primary = desc(a.power, b.power) || desc(a.level, b.level);
  else if (category === 'tournament') {
    primary =
      desc(a.tournamentWins, b.tournamentWins) ||
      desc(a.tournamentTitles, b.tournamentTitles) ||
      desc(a.power, b.power);
  } else {
    primary =
      desc(a.bossDamage, b.bossDamage) ||
      desc(a.power, b.power) ||
      desc(a.tournamentWins, b.tournamentWins);
  }
  return primary || a.name.localeCompare(b.name, 'pt-BR');
}

export function compareGuildRanking(
  a: RankableGuild,
  b: RankableGuild,
  category: GuildRankingCategory
): number {
  const primary =
    category === 'power'
      ? desc(a.totalPower, b.totalPower) || desc(a.level, b.level)
      : desc(a.level, b.level) || desc(a.xp, b.xp) || desc(a.totalPower, b.totalPower);

  return (
    primary ||
    desc(a.memberCount, b.memberCount) ||
    desc(a.totalDonated, b.totalDonated) ||
    a.name.localeCompare(b.name, 'pt-BR')
  );
}
