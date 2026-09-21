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

test('amizade exige convite pendente e aceite gera relação recíproca', async () => {
  await db.chatFriendRequest.create({
    data: {
      senderPlayerId: 'p1',
      senderPlayerName: 'Alpha',
      recipientPlayerId: 'p2',
      recipientPlayerName: 'Beta',
    },
  });
  expect(await db.chatFriendRequest.count({ where: { recipientPlayerId: 'p2' } })).toBe(1);
  expect(await db.chatFriend.count()).toBe(0);

  await db.$transaction([
    db.chatFriend.create({ data: { playerId: 'p1', friendPlayerId: 'p2', friendPlayerName: 'Beta' } }),
    db.chatFriend.create({ data: { playerId: 'p2', friendPlayerId: 'p1', friendPlayerName: 'Alpha' } }),
    db.chatFriendRequest.deleteMany({
      where: { senderPlayerId: 'p1', recipientPlayerId: 'p2' },
    }),
  ]);
  expect(await db.chatFriendRequest.count()).toBe(0);
  expect(await db.chatFriend.count()).toBe(2);
  expect(await db.chatFriend.count({ where: { playerId: 'p1', friendPlayerId: 'p2' } })).toBe(1);
  expect(await db.chatFriend.count({ where: { playerId: 'p2', friendPlayerId: 'p1' } })).toBe(1);
});

test('convites e bloqueios são únicos por direção', async () => {
  await db.chatFriendRequest.create({
    data: {
      senderPlayerId: 'p3',
      senderPlayerName: 'Gamma',
      recipientPlayerId: 'p4',
      recipientPlayerName: 'Delta',
    },
  });
  let duplicateInviteRejected = false;
  try {
    await db.chatFriendRequest.create({
      data: {
        senderPlayerId: 'p3',
        senderPlayerName: 'Gamma',
        recipientPlayerId: 'p4',
        recipientPlayerName: 'Delta',
      },
    });
  } catch {
    duplicateInviteRejected = true;
  }
  expect(duplicateInviteRejected).toBe(true);

  await db.chatBlock.create({
    data: { playerId: 'p1', blockedPlayerId: 'p3', blockedPlayerName: 'Gamma' },
  });
  let duplicateBlockRejected = false;
  try {
    await db.chatBlock.create({
      data: { playerId: 'p1', blockedPlayerId: 'p3', blockedPlayerName: 'Gamma' },
    });
  } catch {
    duplicateBlockRejected = true;
  }
  expect(duplicateBlockRejected).toBe(true);
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
  expect(widget).toContain("Enviar convite de amizade");
  expect(widget).toContain("Pedidos de amizade");
  expect(widget).toContain("Convites enviados");
  expect(widget).toContain("Aceitar");
  expect(widget).toContain("Recusar");
  expect(widget).toContain("Remover dos amigos");
  expect(widget).toContain("Bloquear jogador");
  expect(widget).toContain("Bloqueados");
  expect(widget).toContain("Amigos e contatos");
  expect(widget).toContain("Desbloquear guerreiro");
  expect(widget).toContain("id === 'private'");
  expect(widget).toContain("void loadDirectory()");
  expect(api).toContain("playerId: z.string().min(1).max(80).optional()");
  expect(api).toContain("'send_friend_request'");
  expect(api).toContain("'accept_friend_request'");
  expect(api).toContain("'decline_friend_request'");
  expect(api).toContain("'cancel_friend_request'");
  expect(api).toContain("isBlockedEitherWay");
  expect(api).toContain("db.chatFriendRequest.upsert");
  expect(api).toContain("db.chatFriend.upsert");
  expect(api).toContain("db.chatBlock.upsert");
  expect(api).toContain("take: q ? 50 : 200");
  expect(admin).toContain("z.literal('LIMPAR CHAT'");
  expect(admin).toContain('chatMessage.deleteMany');
});
