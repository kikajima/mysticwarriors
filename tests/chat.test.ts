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

test('amizade e bloqueio são relações persistentes entre personagens', async () => {
  const a = await db.player.create({ data: { id: 'social-a', name: 'Social Alpha', race: 'humano' } });
  const b = await db.player.create({ data: { id: 'social-b', name: 'Social Beta', race: 'saiyajin' } });

  const friendship = await db.friendship.create({
    data: { playerAId: a.id, playerBId: b.id, requestedById: a.id, status: 'pending' },
  });
  expect(friendship.status).toBe('pending');
  await db.friendship.update({ where: { id: friendship.id }, data: { status: 'accepted', acceptedAt: new Date() } });
  expect((await db.friendship.findUniqueOrThrow({ where: { id: friendship.id } })).status).toBe('accepted');

  await db.playerBlock.create({ data: { playerId: a.id, blockedPlayerId: b.id } });
  expect(await db.playerBlock.count({ where: { playerId: a.id } })).toBe(1);

  // FKs sociais são CASCADE: apagar um personagem não deixa relação órfã.
  await db.player.delete({ where: { id: a.id } });
  expect(await db.friendship.count()).toBe(0);
  expect(await db.playerBlock.count()).toBe(0);
  await db.player.delete({ where: { id: b.id } });
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
  expect(api).toContain("playerId: z.string().min(1).max(80).optional()");
  expect(api).toContain("take: q ? 50 : 200");
  expect(api).toContain("'friend_add'");
  expect(api).toContain("'friend_accept'");
  expect(api).toContain("'friend_remove'");
  expect(api).toContain("'block'");
  expect(api).toContain('assertNotBlocked');
  expect(widget).toContain('Solicitações de amizade');
  expect(widget).toContain('Amigos (');
  expect(widget).toContain('Bloqueados');
  expect(admin).toContain("z.literal('LIMPAR CHAT'");
  expect(admin).toContain('chatMessage.deleteMany');
});
