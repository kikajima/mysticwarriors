import { describe, expect, test } from 'bun:test';

describe('progressão de atributos sem teto artificial', () => {
  test('schemas Prisma armazenam atributos e vitais como Float', async () => {
    for (const schema of ['schema.prisma', 'schema.sqlite.prisma']) {
      const src = await Bun.file(`${import.meta.dir}/../prisma/${schema}`).text();
      for (const field of ['hp', 'strength', 'defense', 'speed', 'ki', 'energy']) {
        expect(src).toMatch(new RegExp(`^\\s*${field}\\s+Float\\s+@default\\(`, 'm'));
      }
    }
  });

  test('migração PostgreSQL amplia as seis colunas para DOUBLE PRECISION', async () => {
    const src = await Bun.file(
      `${import.meta.dir}/../supabase/migrations/20260920211500_unbounded_player_stats.sql`
    ).text();
    for (const field of ['hp', 'strength', 'defense', 'speed', 'ki', 'energy']) {
      expect(src).toContain(`ALTER COLUMN "${field}" TYPE DOUBLE PRECISION`);
    }
  });

  test('runtime não contém mais constante nem erro de teto de atributo', async () => {
    const rules = await Bun.file(`${import.meta.dir}/../src/lib/game/rules.ts`).text();
    const actions = await Bun.file(`${import.meta.dir}/../src/lib/game/actions.ts`).text();
    const api = await Bun.file(`${import.meta.dir}/../src/lib/api.ts`).text();
    expect(rules).not.toContain('STAT_CAP');
    expect(actions).not.toContain('STAT_CAP_REACHED');
    expect(api).not.toContain('STAT_CAP_REACHED');
  });
});
