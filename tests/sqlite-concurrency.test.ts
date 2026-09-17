import { expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { resolveDbUrl } from '../src/lib/db-path';

test('SQLite: transações e gravações de polling simultâneas terminam sem perder atualizações', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-concurrency-'));
  const previousUrl = process.env.DATABASE_URL;
  const file = path.join(dir, 'test.db');
  writeFileSync(file, '');
  let client: PrismaClient | undefined;
  try {
    process.env.DATABASE_URL = `file:${file}`;
    client = new PrismaClient({
      datasources: { db: { url: resolveDbUrl() } },
      transactionOptions: { maxWait: 5000, timeout: 5000 },
    });
    const db = client;
    await db.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    await db.$executeRawUnsafe('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
    await db.$executeRawUnsafe('INSERT INTO counter VALUES (1, 0)');
    const transactions = Array.from({ length: 12 }, () => db.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ value: number }>>('SELECT value FROM counter WHERE id=1');
      await new Promise((resolve) => setTimeout(resolve, 5));
      await tx.$executeRawUnsafe('UPDATE counter SET value=? WHERE id=1', rows[0].value + 1);
    }));
    const writes = Array.from({ length: 12 }, () => db.$executeRawUnsafe('UPDATE counter SET value=value+1 WHERE id=1'));
    const reads = Array.from({ length: 12 }, () => db.$queryRawUnsafe('SELECT value FROM counter WHERE id=1'));
    // Espera todas as operações inclusive em caso de erro, antes de fechar o DB.
    const results = await Promise.allSettled([...transactions, ...writes, ...reads]);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    const rows = await db.$queryRawUnsafe<Array<{ value: number }>>('SELECT value FROM counter WHERE id=1');
    expect(Number(rows[0].value)).toBe(24);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await client?.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
