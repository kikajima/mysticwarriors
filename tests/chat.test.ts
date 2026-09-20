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
  let duplicateRejected = false;
  try {
    await db.chatMute.create({ data: { playerId: 'p2', mutedPlayerId: 'p1', mutedPlayerName: 'Alpha' } });
  } catch {
    duplicateRejected = true;
  }
  expect(duplicateRejected).toBe(true);
  expect(await db.chatMute.count({ where: { playerId: 'p2' } })).toBe(1);
});

test('relações sociais suportam amizade bilateral e bloqueio unilateral com unicidade por par', async () => {
  const alpha = await db.player.create({ data: { name: 'Social Alpha', race: 'humano' } });
  const beta = await db.player.create({ data: { name: 'Social Beta', race: 'saiyajin' } });

  await db.playerRelation.create({
    data: { playerId: alpha.id, targetPlayerId: beta.id, targetPlayerName: beta.name, status: 'friend' },
  });
  await db.playerRelation.create({
    data: { playerId: beta.id, targetPlayerId: alpha.id, targetPlayerName: alpha.name, status: 'friend' },
  });
  expect(await db.playerRelation.count({ where: { status: 'friend' } })).toBe(2);

  await db.playerRelation.deleteMany({
    where: {
      status: 'friend',
      OR: [
        { playerId: alpha.id, targetPlayerId: beta.id },
        { playerId: beta.id, targetPlayerId: alpha.id },
      ],
    },
  });
  await db.playerRelation.create({
    data: { playerId: alpha.id, targetPlayerId: beta.id, targetPlayerName: beta.name, status: 'blocked' },
  });
  expect(await db.playerRelation.count({ where: { playerId: alpha.id, status: 'blocked' } })).toBe(1);
  expect(await db.playerRelation.count({ where: { playerId: beta.id, status: 'blocked' } })).toBe(0);
});

test('contrato: chat só existe dentro do jogo e mantém limpeza administrativa', async () => {
  const layout = await Bun.file(path.join(process.cwd(), 'src/app/layout.tsx')).text();
  const page = await Bun.file(path.join(process.cwd(), 'src/app/jogar/page.tsx')).text();
  const widget = await Bun.file(path.join(process.cwd(), 'src/components/ChatWidget.tsx')).text();
  const api = await Bun.file(path.join(process.cwd(), 'src/app/api/chat/route.ts')).text();
  const admin = await Bun.file(path.join(process.cwd(), 'src/app/api/admin/chat/route.ts')).text();

  expect(layout).not.toContain('<ChatWidget />');
  expect(page).toContain('<ChatWidget key={player.id} player={player} />');
  expect(widget).toContain("fixed bottom-20 sm:bottom-4 left-4");
  expect(widget).toContain("loadMessages(false, false)");
  expect(widget).toContain("Todos os guerreiros");
  expect(widget).toContain("onFocus={() =>");
  expect(widget).toContain("playerId: player.id");
  expect(widget).toContain("'friend_add'");
  expect(widget).toContain("'friend_remove'");
  expect(widget).toContain("'block'");
  expect(widget).toContain("'unblock'");
  expect(api).toContain("playerId: z.string().min(1).max(80).optional()");
  expect(api).toContain("take: q ? 50 : 200");
  expect(api).toContain("db.playerRelation.upsert");
  expect(api).toContain("blockedEitherWay");
  expect(admin).toContain("z.literal('LIMPAR CHAT'");
  expect(admin).toContain('chatMessage.deleteMany');
});
