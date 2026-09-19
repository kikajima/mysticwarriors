import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyPendingMigrations } from '../src/lib/game/persistence';

const dir = mkdtempSync(path.join(tmpdir(), 'mw-chat-'));
const db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'chat.db')}?connection_limit=1` } } });

beforeAll(async () => {
  expect(await applyPendingMigrations(db)).toBeGreaterThanOrEqual(0);
});

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test('chat persiste mensagens globais, privadas e de guilda sem FK destrutiva', async () => {
  const rows = await Promise.all([
    db.chatMessage.create({ data: { channel: 'global', senderPlayerId: 'p1', senderName: 'Alpha', body: 'global' } }),
    db.chatMessage.create({ data: { channel: 'private', senderPlayerId: 'p1', senderName: 'Alpha', recipientPlayerId: 'p2', recipientName: 'Beta', body: 'privado' } }),
    db.chatMessage.create({ data: { channel: 'guild', senderPlayerId: 'p1', senderName: 'Alpha', guildId: 'g1', guildName: 'Guilda QA', body: 'guilda' } }),
  ]);
  expect(rows.map((r) => r.channel).sort()).toEqual(['global', 'guild', 'private']);
  expect(await db.chatMessage.count()).toBe(3);
});

test('silêncio é unilateral e único por par', async () => {
  await db.chatMute.create({ data: { playerId: 'p2', mutedPlayerId: 'p1', mutedPlayerName: 'Alpha' } });
  await expect(
    db.chatMute.create({ data: { playerId: 'p2', mutedPlayerId: 'p1', mutedPlayerName: 'Alpha' } })
  ).rejects.toThrow();
  expect(await db.chatMute.count({ where: { playerId: 'p2' } })).toBe(1);
});

test('contrato: widget global e limpeza administrativa existem', async () => {
  const layout = await Bun.file(path.join(process.cwd(), 'src/app/layout.tsx')).text();
  const widget = await Bun.file(path.join(process.cwd(), 'src/components/ChatWidget.tsx')).text();
  const admin = await Bun.file(path.join(process.cwd(), 'src/app/api/admin/chat/route.ts')).text();
  expect(layout).toContain('<ChatWidget />');
  expect(widget).toContain("fixed bottom-20 sm:bottom-4 left-4");
  expect(widget).toContain("'global'");
  expect(widget).toContain("'guild'");
  expect(widget).toContain("'private'");
  expect(admin).toContain("z.literal('LIMPAR CHAT'");
  expect(admin).toContain('chatMessage.deleteMany');
});
