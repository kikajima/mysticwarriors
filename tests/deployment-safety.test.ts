import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isPostgresDatabase } from '../src/lib/game/persistence';

test('detecção do banco diferencia PostgreSQL de SQLite', () => {
  expect(isPostgresDatabase('postgresql://user:pass@host/db?schema=game')).toBe(true);
  expect(isPostgresDatabase('postgres://user:pass@host/db?schema=game')).toBe(true);
  expect(isPostgresDatabase('file:/tmp/custom.db')).toBe(false);
});

test('start de produção rejeita SQLite e exige schema game', () => {
  const start = readFileSync(path.join(process.cwd(), 'scripts/start-production.mjs'), 'utf8');
  expect(start).toContain('SQLite/file: não é aceito no Render Free');
  expect(start).toContain("searchParams.get('schema') !== 'game'");
});

test('blueprint não declara Persistent Disk nem senha de banco', () => {
  const render = readFileSync(path.join(process.cwd(), 'render.yaml'), 'utf8');
  expect(render).not.toContain('mountPath:');
  expect(render).not.toContain('sizeGB:');
  expect(render).not.toMatch(/postgres\.[^:]+:[^@\s]+@aws-/);
});
