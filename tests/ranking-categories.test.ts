import { describe, expect, test } from 'bun:test';
import {
  GUILD_RANKING_CATEGORIES,
  WARRIOR_RANKING_CATEGORIES,
  compareGuildRanking,
  compareWarriorRanking,
} from '../src/lib/game/ranking';

describe('Ranking por categorias', () => {
  const base = {
    name: 'Base',
    level: 10,
    xp: 0,
    power: 1000,
    tournamentWins: 0,
    tournamentTitles: 0,
    bossDamage: 0,
  };

  test('publica as quatro categorias de guerreiro solicitadas', () => {
    expect(WARRIOR_RANKING_CATEGORIES.map((item) => item.id)).toEqual([
      'level',
      'power',
      'tournament',
      'boss_damage',
    ]);
    expect(WARRIOR_RANKING_CATEGORIES.map((item) => item.label)).toEqual([
      'Nível',
      'Nível de Poder',
      'Vitórias no Torneio',
      'Dano em Ameaças',
    ]);
  });

  test('nível, poder, torneio e dano usam seus próprios critérios', () => {
    expect(
      [
        { ...base, name: 'A', level: 20 },
        { ...base, name: 'B', level: 30 },
      ].sort((a, b) => compareWarriorRanking(a, b, 'level'))[0].name
    ).toBe('B');

    expect(
      [
        { ...base, name: 'A', power: 5000 },
        { ...base, name: 'B', power: 7000 },
      ].sort((a, b) => compareWarriorRanking(a, b, 'power'))[0].name
    ).toBe('B');

    expect(
      [
        { ...base, name: 'A', tournamentWins: 8, tournamentTitles: 1 },
        { ...base, name: 'B', tournamentWins: 9 },
      ].sort((a, b) => compareWarriorRanking(a, b, 'tournament'))[0].name
    ).toBe('B');

    expect(
      [
        { ...base, name: 'A', bossDamage: 100_000 },
        { ...base, name: 'B', bossDamage: 150_000 },
      ].sort((a, b) => compareWarriorRanking(a, b, 'boss_damage'))[0].name
    ).toBe('B');
  });

  test('ranking de guildas oferece poder total e nível com desempates estáveis', () => {
    expect(GUILD_RANKING_CATEGORIES.map((item) => item.id)).toEqual(['power', 'level']);
    expect(GUILD_RANKING_CATEGORIES.map((item) => item.label)).toEqual([
      'Poder Total',
      'Nível da Guilda',
    ]);

    const guilds = [
      { name: 'A', level: 4, xp: 1000, totalPower: 90_000, memberCount: 10, totalDonated: 5000 },
      { name: 'B', level: 3, xp: 900, totalPower: 120_000, memberCount: 8, totalDonated: 3000 },
    ];
    expect([...guilds].sort((a, b) => compareGuildRanking(a, b, 'power'))[0].name).toBe('B');
    expect([...guilds].sort((a, b) => compareGuildRanking(a, b, 'level'))[0].name).toBe('A');
  });

  test('API e UI mantêm filtro racial, histórico de boss e catálogo compartilhado', async () => {
    const route = await Bun.file(`${import.meta.dir}/../src/app/api/game/ranking/route.ts`).text();
    const panel = await Bun.file(`${import.meta.dir}/../src/components/game/RankingPanel.tsx`).text();

    expect(route).toContain('tournamentRoundWins');
    expect(route).toContain('bossDamage.reduce');
    expect(route).toContain('raceParam');
    expect(route).toContain('computeDerived');
    expect(route).toContain("kind === 'guilds'");

    expect(panel).toContain('Todas as raças');
    expect(panel).toContain('WARRIOR_RANKING_CATEGORIES');
    expect(panel).toContain('GUILD_RANKING_CATEGORIES');
  });
});
