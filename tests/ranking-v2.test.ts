import { describe, expect, test } from 'bun:test';
import {
  GUILD_RANKING_CATEGORIES,
  PLAYER_RANKING_CATEGORIES,
  sortGuildRankingEntries,
  sortPlayerRankingEntries,
} from '../src/lib/game/ranking';
import type { GuildRankingEntry, RankingEntry } from '../src/lib/game/types';

function player(over: Partial<RankingEntry> & { id: string; name: string }): RankingEntry {
  return {
    race: 'humano',
    level: 1,
    power: 100,
    battlesWon: 0,
    battlesLost: 0,
    tournamentWins: 0,
    tournamentTitles: 0,
    totalBossDamage: 0,
    isMe: false,
    isBot: false,
    attackable: true,
    blockReason: null,
    ...over,
  };
}

function guild(over: Partial<GuildRankingEntry> & { id: string; name: string }): GuildRankingEntry {
  return {
    level: 1,
    xp: 0,
    totalPower: 0,
    averagePower: 0,
    memberCount: 0,
    tournamentWins: 0,
    tournamentTitles: 0,
    totalBossDamage: 0,
    isMine: false,
    ...over,
  };
}

describe('Ranking multidimensional', () => {
  test('expõe as quatro categorias pedidas para guerreiros', () => {
    expect(PLAYER_RANKING_CATEGORIES.map((c) => c.id)).toEqual(['level', 'power', 'tournament', 'boss_damage']);
  });

  test('ordena guerreiros por nível, poder, torneio e dano global', () => {
    const rows = [
      player({ id: 'a', name: 'A', level: 10, power: 1000, tournamentWins: 2, totalBossDamage: 500 }),
      player({ id: 'b', name: 'B', level: 9, power: 2000, tournamentWins: 8, totalBossDamage: 100 }),
      player({ id: 'c', name: 'C', level: 8, power: 1500, tournamentWins: 4, totalBossDamage: 9000 }),
    ];
    expect(sortPlayerRankingEntries(rows, 'level')[0].id).toBe('a');
    expect(sortPlayerRankingEntries(rows, 'power')[0].id).toBe('b');
    expect(sortPlayerRankingEntries(rows, 'tournament')[0].id).toBe('b');
    expect(sortPlayerRankingEntries(rows, 'boss_damage')[0].id).toBe('c');
  });

  test('guildas têm ranking por poder, nível, torneio e dano global', () => {
    expect(GUILD_RANKING_CATEGORIES.map((c) => c.id)).toEqual([
      'guild_power',
      'guild_level',
      'guild_tournament',
      'guild_boss_damage',
    ]);
    const rows = [
      guild({ id: 'a', name: 'A', level: 4, xp: 10, totalPower: 10000, tournamentWins: 10, totalBossDamage: 500 }),
      guild({ id: 'b', name: 'B', level: 6, xp: 20, totalPower: 9000, tournamentWins: 4, totalBossDamage: 5000 }),
      guild({ id: 'c', name: 'C', level: 3, xp: 5, totalPower: 20000, tournamentWins: 2, totalBossDamage: 100 }),
    ];
    expect(sortGuildRankingEntries(rows, 'guild_power')[0].id).toBe('c');
    expect(sortGuildRankingEntries(rows, 'guild_level')[0].id).toBe('b');
    expect(sortGuildRankingEntries(rows, 'guild_tournament')[0].id).toBe('a');
    expect(sortGuildRankingEntries(rows, 'guild_boss_damage')[0].id).toBe('b');
  });

  test('API aplica filtro de raça e agrega dano histórico da Ameaça Universal', async () => {
    const api = await Bun.file(`${import.meta.dir}/../src/app/api/game/ranking/route.ts`).text();
    expect(api).toContain("race !== 'all' ? { race }");
    expect(api).toContain("worldBossDamage.groupBy");
    expect(api).toContain("tournamentRoundWins");
    expect(api).toContain("computeDerived(p).power");
    expect(api).toContain("guildEntries");
  });

  test('painel oferece guerreiros, guildas e filtro por todas as raças', async () => {
    const ui = await Bun.file(`${import.meta.dir}/../src/components/game/RankingPanel.tsx`).text();
    expect(ui).toContain('Guerreiros');
    expect(ui).toContain('Guildas');
    expect(ui).toContain('Todas as raças');
    expect(ui).toContain('PLAYER_RANKING_CATEGORIES');
    expect(ui).toContain('GUILD_RANKING_CATEGORIES');
  });
});
