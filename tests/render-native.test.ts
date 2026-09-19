import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('infra de produção não depende da Z.ai', () => {
  expect(existsSync(path.join(root, '.zscripts'))).toBe(false);
  expect(existsSync(path.join(root, 'Caddyfile'))).toBe(false);

  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  expect(pkg.name).toBe('mystic-warriors');
  expect(pkg.dependencies?.['z-ai-web-dev-sdk']).toBeUndefined();
  expect(pkg.scripts?.['db:reset']).toBeUndefined();
  expect(existsSync(path.join(root, 'ARQUIVOS-ALTERADOS.txt'))).toBe(false);

  const nextConfig = readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
  expect(nextConfig).not.toContain('space-z.ai');
});

test('produção usa PostgreSQL Supabase e testes preservam SQLite isolado', () => {
  const prodSchema = readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const testSchema = readFileSync(path.join(root, 'prisma/schema.sqlite.prisma'), 'utf8');
  expect(prodSchema).toContain('provider = "postgresql"');
  expect(testSchema).toContain('provider = "sqlite"');

  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  expect(pkg.scripts['db:generate']).toContain('schema.prisma');
  expect(pkg.scripts['db:generate:test']).toContain('schema.sqlite.prisma');
});

test('Render Free usa Supabase PostgreSQL sem Persistent Disk', () => {
  const render = readFileSync(path.join(root, 'render.yaml'), 'utf8');
  expect(render).toContain('name: mysticwarriors');
  expect(render).toContain("postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=game&sslmode=require");
  expect(render).toContain('bun install --frozen-lockfile && bun run db:generate && bun run build');
  expect(render).toContain('startCommand: bun run start');
  expect(render).toContain('healthCheckPath: /api/health');
  expect(render).toContain('autoDeployTrigger: checksPass');
  expect(render).toContain('- key: DATABASE_URL');
  expect(render).toContain('sync: false');
  expect(render).not.toContain('mountPath:');
  expect(render).not.toContain('disk:');
  expect(render).not.toContain('file:/var/data/custom.db');

  const start = readFileSync(path.join(root, 'scripts/start-production.mjs'), 'utf8');
  expect(start).toContain('PostgreSQL do Supabase');
  expect(start).toContain("schema') !== 'game'");
  expect(start).not.toContain('ALLOW_EMPTY_DB_INIT');
  expect(start).toContain('.next/standalone/server.js');
});

test('backup completo exige autorização administrativa', () => {
  const route = readFileSync(path.join(root, 'src/app/api/game/backup/route.ts'), 'utf8');
  expect(route).toContain('requirePanelAdmin(request)');
  expect(route).not.toContain('requireAuth()');
});

test('primeiro boot PostgreSQL garante bots e temporada', () => {
  const persistence = readFileSync(path.join(root, 'src/lib/game/persistence.ts'), 'utf8');
  expect(persistence).toContain("const { ensureSeed } = await import('./engine')");
  expect(persistence).toContain('await ensureSeed()');
  expect(persistence).toContain("const { ensureActiveSeason } = await import('@/lib/seasons')");
  expect(persistence).toContain('ensureActiveSeason(tx)');
});

test('reset PostgreSQL cria backup lógico persistente antes do wipe', () => {
  const reset = readFileSync(path.join(root, 'src/lib/game/serverReset.ts'), 'utf8');
  const prodSchema = readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  expect(prodSchema).toContain('model ServerResetBackup');
  expect(reset).toContain("makeBackupTarGz('user-backup', 'server-reset')");
  expect(reset).toContain('db.serverResetBackup.create');
  expect(reset).toContain('postgres:ServerResetBackup:');
});

test('Render Free não usa filesystem como fallback persistente de avatar', () => {
  const avatars = readFileSync(path.join(root, 'src/lib/avatars.ts'), 'utf8');
  const route = readFileSync(path.join(root, 'src/app/api/game/avatar/route.ts'), 'utf8');
  expect(avatars).toContain('productionUsesPostgres()');
  expect(avatars).toContain('Supabase Storage');
  expect(route).toContain('isPostgresDatabase() ? parsed.toString()');
});
