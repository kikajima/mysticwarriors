import { test, expect } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { applyPendingMigrations } from '../src/lib/game/persistence';
import { initialPlayerData } from '../src/lib/game/characterInitial';

test('registro de dano do chefe sobrevive à reabertura do mesmo SQLite', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-boss-reopen-'));
  const url = 'file:' + path.join(dir, 'custom.db');
  let db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await applyPendingMigrations(db);
    const p = await db.player.create({ data: { ...initialPlayerData(), name: 'Storage QA', race: 'saiyajin' } });
    const b = await db.worldBoss.create({ data: { name: 'Storage QA boss', emoji: 'X', maxHp: 10000, currentHp: 10000, endsAt: new Date(Date.now() + 3600000) } });
    await db.$transaction(async tx => {
      await tx.worldBoss.update({ where: { id: b.id }, data: { currentHp: { decrement: 123 } } });
      await tx.worldBossDamage.create({ data: { bossId: b.id, playerId: p.id, damage: 123, attacks: 1 } });
    });
    await db.$disconnect();
    db = new PrismaClient({ datasources: { db: { url } } });
    expect((await db.worldBoss.findUniqueOrThrow({ where: { id: b.id } })).currentHp).toBe(9877);
    expect((await db.worldBossDamage.findUniqueOrThrow({ where: { bossId_playerId: { bossId: b.id, playerId: p.id } } })).damage).toBe(123);
  } finally { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
