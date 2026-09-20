import { describe, expect, test } from 'bun:test';

describe('ranking expandido — contratos de servidor e UI', () => {
  test('rota oferece todas as categorias de guerreiros e filtro por raça', async () => {
    const route = await Bun.file(`${import.meta.dir}/../src/app/api/game/ranking/route.ts`).text();
    expect(route).toContain("'level', 'power', 'wins', 'tournament', 'worldboss'");
    expect(route).toContain("searchParams.get('race')");
    expect(route).toContain('worldBossDamage.groupBy');
    expect(route).toContain('tournamentRoundWins');
    expect(route).toContain('tournamentTitles');
  });

  test('ranking de guildas usa poder total dos membros e nível da guilda', async () => {
    const route = await Bun.file(`${import.meta.dir}/../src/app/api/game/ranking/route.ts`).text();
    expect(route).toContain("scope === 'guilds'");
    expect(route).toContain("['power', 'level']");
    expect(route).toContain('totalPower: guild.members.reduce');
    expect(route).toContain('memberCount: guild.members.length');
    expect(route).toContain('totalDonated');
  });

  test('painel expõe categorias, raças e alternância Guerreiros/Guildas', async () => {
    const panel = await Bun.file(`${import.meta.dir}/../src/components/game/RankingPanel.tsx`).text();
    for (const label of ['Poder', 'Nível', 'Vitórias', 'Torneio', 'Ameaça', 'Guerreiros', 'Guildas', 'Todas as raças']) {
      expect(panel).toContain(label);
    }
    expect(panel).toContain("scope: selectedScope");
    expect(panel).toContain("params.set('race', selectedRace)");
  });
});
