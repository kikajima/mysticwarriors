import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { resolveDbFilePath } from '../src/lib/db-path';

test('produção exige banco explícito externo e não escolhe cópia velha', () => {
  const env = (process.env as Record<string, string | undefined>).NODE_ENV, url = process.env.DATABASE_URL;
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-volume-'));
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    expect(() => resolveDbFilePath()).toThrow();
    process.env.DATABASE_URL = 'file:' + path.join(process.cwd(), 'db/custom.db');
    expect(() => resolveDbFilePath()).toThrow();
    process.env.DATABASE_URL = 'file:' + path.join(dir, 'missing.db');
    expect(() => resolveDbFilePath()).toThrow();
    const db = path.join(dir, 'custom.db'); writeFileSync(db, 'fixture');
    process.env.DATABASE_URL = 'file:' + db;
    expect(resolveDbFilePath()).toBe(db);
  } finally {
    if (env === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV; else (process.env as Record<string, string | undefined>).NODE_ENV = env;
    if (url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = url;
    rmSync(dir, { recursive: true, force: true });
  }
});

