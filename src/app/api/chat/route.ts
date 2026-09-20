import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getAuth, requireAuth } from '@/lib/auth';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import {
  CHAT_CHANNELS,
  CHAT_MAX_MESSAGE,
  CHAT_PAGE_SIZE,
  chatMessageView,
  getChatPlayer,
  normalizeChatBody,
  requireChatPlayer,
  type ChatChannel,
} from '@/lib/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sendSchema = z.object({
  action: z.literal('send'),
  playerId: z.string().min(1).max(80).optional(),
  channel: z.enum(CHAT_CHANNELS),
  body: z.string().max(CHAT_MAX_MESSAGE),
  targetId: z.string().min(1).max(80).optional(),
});

const muteSchema = z.object({
  action: z.enum(['mute', 'unmute']),
  playerId: z.string().min(1).max(80).optional(),
  targetId: z.string().min(1).max(80),
});

const socialSchema = z.object({
  action: z.enum(['friend_add', 'friend_accept', 'friend_remove', 'block', 'unblock']),
  playerId: z.string().min(1).max(80).optional(),
  targetId: z.string().min(1).max(80),
});

function friendshipPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function blockedPeerIds(playerId: string): Promise<string[]> {
  const [made, received] = await Promise.all([
    db.playerBlock.findMany({ where: { playerId }, select: { blockedPlayerId: true } }),
    db.playerBlock.findMany({ where: { blockedPlayerId: playerId }, select: { playerId: true } }),
  ]);
  return Array.from(new Set([
    ...made.map((row) => row.blockedPlayerId),
    ...received.map((row) => row.playerId),
  ]));
}

async function assertNotBlocked(a: string, b: string): Promise<void> {
  const blocked = await db.playerBlock.findFirst({
    where: {
      OR: [
        { playerId: a, blockedPlayerId: b },
        { playerId: b, blockedPlayerId: a },
      ],
    },
    select: { id: true },
  });
  if (blocked) throw new ApiError('FORBIDDEN', 'Esta interação está bloqueada.');
}

function parseBefore(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requestPlayerId(request: Request): string | null {
  return new URL(request.url).searchParams.get('playerId');
}

async function mutedIds(playerId: string): Promise<string[]> {
  const rows = await db.chatMute.findMany({
    where: { playerId },
    select: { mutedPlayerId: true },
  });
  return rows.map((row) => row.mutedPlayerId);
}

async function listMessages(request: Request) {
  const auth = await requireAuth();
  const player = await requireChatPlayer(auth, requestPlayerId(request));
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel') as ChatChannel | null;
  if (!channel || !CHAT_CHANNELS.includes(channel)) {
    throw new ApiError('VALIDATION_ERROR', 'Canal de chat inválido.');
  }

  const before = parseBefore(url.searchParams.get('before'));
  const [muted, blockedPeers] = await Promise.all([mutedIds(player.id), blockedPeerIds(player.id)]);
  const hiddenSenders = Array.from(new Set([...muted, ...blockedPeers]));
  const visibleSender: Prisma.ChatMessageWhereInput | undefined = hiddenSenders.length
    ? { OR: [{ senderPlayerId: player.id }, { senderPlayerId: { notIn: hiddenSenders } }] }
    : undefined;

  let channelWhere: Prisma.ChatMessageWhereInput;
  if (channel === 'global') {
    channelWhere = { channel: 'global' };
  } else if (channel === 'guild') {
    if (!player.guildId) throw new ApiError('FORBIDDEN', 'Seu guerreiro não participa de uma guilda.');
    channelWhere = { channel: 'guild', guildId: player.guildId };
  } else {
    const targetId = url.searchParams.get('targetId');
    if (!targetId) throw new ApiError('VALIDATION_ERROR', 'Escolha um guerreiro para a conversa privada.');
    await assertNotBlocked(player.id, targetId);
    channelWhere = {
      channel: 'private',
      OR: [
        { senderPlayerId: player.id, recipientPlayerId: targetId },
        { senderPlayerId: targetId, recipientPlayerId: player.id },
      ],
    };
  }

  const rows = await db.chatMessage.findMany({
    where: {
      AND: [
        channelWhere,
        ...(visibleSender ? [visibleSender] : []),
        ...(before ? [{ createdAt: { lt: before } }] : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: CHAT_PAGE_SIZE,
  });

  rows.reverse();
  return ok({
    messages: rows.map(chatMessageView),
    hasMore: rows.length === CHAT_PAGE_SIZE,
  });
}

async function listConversations(request: Request) {
  const auth = await requireAuth();
  const player = await requireChatPlayer(auth, requestPlayerId(request));
  const [mutedList, blockedList] = await Promise.all([mutedIds(player.id), blockedPeerIds(player.id)]);
  const hidden = new Set([...mutedList, ...blockedList]);
  const rows = await db.chatMessage.findMany({
    where: {
      channel: 'private',
      OR: [{ senderPlayerId: player.id }, { recipientPlayerId: player.id }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 250,
  });

  const seen = new Set<string>();
  const conversations: Array<{
    playerId: string;
    name: string;
    lastMessage: string;
    createdAt: string;
    mine: boolean;
  }> = [];

  for (const row of rows) {
    const mine = row.senderPlayerId === player.id;
    const otherId = mine ? row.recipientPlayerId : row.senderPlayerId;
    const otherName = mine ? row.recipientName : row.senderName;
    if (!otherId || !otherName || seen.has(otherId) || hidden.has(otherId)) continue;
    seen.add(otherId);
    conversations.push({
      playerId: otherId,
      name: otherName,
      lastMessage: row.body,
      createdAt: row.createdAt.toISOString(),
      mine,
    });
  }

  return ok({ conversations });
}

async function searchPlayers(request: Request) {
  const auth = await requireAuth();
  const player = await requireChatPlayer(auth, requestPlayerId(request));
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length > 30) throw new ApiError('VALIDATION_ERROR', 'Busca muito longa.');
  const blocked = await blockedPeerIds(player.id);

  const rows = await db.player.findMany({
    where: {
      isBot: false,
      id: { not: player.id, ...(blocked.length ? { notIn: blocked } : {}) },
      ...(q ? { name: { contains: q } } : {}),
    },
    select: { id: true, name: true, level: true, race: true, guildId: true },
    orderBy: { name: 'asc' },
    take: q ? 50 : 200,
  });
  return ok({ players: rows });
}

async function context(request: Request) {
  const auth = await getAuth();
  if (!auth) return ok({ authenticated: false, player: null, muted: [], friends: [], friendRequests: [], sentRequests: [], blocked: [] });

  const explicitPlayerId = requestPlayerId(request);
  const player = explicitPlayerId
    ? await requireChatPlayer(auth, explicitPlayerId)
    : await getChatPlayer(auth);

  if (!player) return ok({ authenticated: true, player: null, muted: [], friends: [], friendRequests: [], sentRequests: [], blocked: [] });

  const [muted, friendships, blocks] = await Promise.all([
    db.chatMute.findMany({
    where: { playerId: player.id },
    select: { mutedPlayerId: true, mutedPlayerName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    }),
    db.friendship.findMany({
      where: { OR: [{ playerAId: player.id }, { playerBId: player.id }] },
      include: {
        playerA: { select: { id: true, name: true, level: true, race: true } },
        playerB: { select: { id: true, name: true, level: true, race: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    db.playerBlock.findMany({
      where: { playerId: player.id },
      include: { blockedPlayer: { select: { id: true, name: true, level: true, race: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const relation = friendships.map((row) => ({
    row,
    other: row.playerAId === player.id ? row.playerB : row.playerA,
  }));
  return ok({
    authenticated: true,
    player: {
      id: player.id,
      name: player.name,
      race: player.race,
      level: player.level,
      guild: player.guild,
    },
    muted: muted.map((row) => ({
      playerId: row.mutedPlayerId,
      name: row.mutedPlayerName,
      createdAt: row.createdAt.toISOString(),
    })),
    friends: relation.filter(({ row }) => row.status === 'accepted').map(({ other, row }) => ({
      ...other,
      since: (row.acceptedAt ?? row.updatedAt).toISOString(),
    })),
    friendRequests: relation.filter(({ row }) => row.status === 'pending' && row.requestedById !== player.id).map(({ other, row }) => ({
      ...other,
      requestedAt: row.createdAt.toISOString(),
    })),
    sentRequests: relation.filter(({ row }) => row.status === 'pending' && row.requestedById === player.id).map(({ other, row }) => ({
      ...other,
      requestedAt: row.createdAt.toISOString(),
    })),
    blocked: blocks.map((row) => ({
      ...row.blockedPlayer,
      blockedAt: row.createdAt.toISOString(),
    })),
  });
}

async function sendMessage(data: z.infer<typeof sendSchema>) {
  const auth = await requireAuth();
  const player = await requireChatPlayer(auth, data.playerId);
  const rl = rateLimit(`chat-send:${player.id}`, 12, 30_000);
  if (!rl.allowed) {
    throw new ApiError('RATE_LIMITED', `Muitas mensagens seguidas. Aguarde ${rl.retryAfterSec}s.`);
  }

  const body = normalizeChatBody(data.body);
  if (!body) throw new ApiError('VALIDATION_ERROR', 'Digite uma mensagem.');
  if (body.length > CHAT_MAX_MESSAGE) {
    throw new ApiError('VALIDATION_ERROR', `A mensagem pode ter no máximo ${CHAT_MAX_MESSAGE} caracteres.`);
  }

  let recipientPlayerId: string | null = null;
  let recipientName: string | null = null;
  let guildId: string | null = null;
  let guildName: string | null = null;

  if (data.channel === 'private') {
    if (!data.targetId) throw new ApiError('VALIDATION_ERROR', 'Escolha o destinatário.');
    if (data.targetId === player.id) throw new ApiError('VALIDATION_ERROR', 'Escolha outro guerreiro.');
    const target = await db.player.findFirst({
      where: { id: data.targetId, isBot: false },
      select: { id: true, name: true },
    });
    if (!target) throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado.');
    await assertNotBlocked(player.id, target.id);
    const mutedByMe = await db.chatMute.findUnique({
      where: { playerId_mutedPlayerId: { playerId: player.id, mutedPlayerId: target.id } },
      select: { id: true },
    });
    if (mutedByMe) {
      throw new ApiError('VALIDATION_ERROR', 'Você silenciou este guerreiro. Remova o silêncio antes de conversar.');
    }
    recipientPlayerId = target.id;
    recipientName = target.name;
  }

  if (data.channel === 'guild') {
    if (!player.guildId || !player.guild) {
      throw new ApiError('FORBIDDEN', 'Seu guerreiro não participa de uma guilda.');
    }
    guildId = player.guildId;
    guildName = player.guild.name;
  }

  const created = await db.chatMessage.create({
    data: {
      channel: data.channel,
      senderPlayerId: player.id,
      senderName: player.name,
      recipientPlayerId,
      recipientName,
      guildId,
      guildName,
      body,
    },
  });

  return ok({ message: chatMessageView(created) }, 201);
}

async function changeMute(data: z.infer<typeof muteSchema>) {
  const auth = await requireAuth();
  const player = await requireChatPlayer(auth, data.playerId);
  if (data.targetId === player.id) throw new ApiError('VALIDATION_ERROR', 'Você não pode silenciar a si mesmo.');

  if (data.action === 'unmute') {
    await db.chatMute.deleteMany({
      where: { playerId: player.id, mutedPlayerId: data.targetId },
    });
    return ok({ muted: false });
  }

  const target = await db.player.findFirst({
    where: { id: data.targetId, isBot: false },
    select: { id: true, name: true },
  });
  if (!target) throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado.');

  await db.chatMute.upsert({
    where: { playerId_mutedPlayerId: { playerId: player.id, mutedPlayerId: target.id } },
    update: { mutedPlayerName: target.name },
    create: {
      playerId: player.id,
      mutedPlayerId: target.id,
      mutedPlayerName: target.name,
    },
  });
  return ok({ muted: true, target: { playerId: target.id, name: target.name } });
}

async function changeSocial(data: z.infer<typeof socialSchema>) {
  const auth = await requireAuth();
  const player = await requireChatPlayer(auth, data.playerId);
  if (data.targetId === player.id) throw new ApiError('VALIDATION_ERROR', 'Escolha outro guerreiro.');

  const target = await db.player.findFirst({
    where: { id: data.targetId, isBot: false },
    select: { id: true, name: true, level: true, race: true },
  });
  if (!target) throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado.');

  const [playerAId, playerBId] = friendshipPair(player.id, target.id);

  if (data.action === 'block') {
    await db.$transaction(async (tx) => {
      await tx.friendship.deleteMany({ where: { playerAId, playerBId } });
      await tx.playerBlock.upsert({
        where: { playerId_blockedPlayerId: { playerId: player.id, blockedPlayerId: target.id } },
        update: {},
        create: { playerId: player.id, blockedPlayerId: target.id },
      });
    });
    return ok({ blocked: true, target });
  }

  if (data.action === 'unblock') {
    await db.playerBlock.deleteMany({ where: { playerId: player.id, blockedPlayerId: target.id } });
    return ok({ blocked: false, target });
  }

  await assertNotBlocked(player.id, target.id);

  if (data.action === 'friend_remove') {
    await db.friendship.deleteMany({ where: { playerAId, playerBId } });
    return ok({ friendship: null, target });
  }

  const existing = await db.friendship.findUnique({
    where: { playerAId_playerBId: { playerAId, playerBId } },
  });

  if (data.action === 'friend_accept') {
    if (!existing || existing.status !== 'pending' || existing.requestedById === player.id) {
      throw new ApiError('VALIDATION_ERROR', 'Não há solicitação de amizade deste guerreiro para aceitar.');
    }
    const friendship = await db.friendship.update({
      where: { id: existing.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });
    return ok({ friendship, target });
  }

  // friend_add: pedido recíproco aceita automaticamente.
  if (existing?.status === 'accepted') return ok({ friendship: existing, target });
  if (existing?.status === 'pending') {
    if (existing.requestedById === player.id) return ok({ friendship: existing, target });
    const friendship = await db.friendship.update({
      where: { id: existing.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });
    return ok({ friendship, target });
  }

  const friendship = await db.friendship.create({
    data: { playerAId, playerBId, requestedById: player.id, status: 'pending' },
  });
  return ok({ friendship, target }, 201);
}

export async function GET(request: Request) {
  try {
    const view = new URL(request.url).searchParams.get('view') ?? 'context';
    if (view === 'context') return await context(request);
    if (view === 'messages') return await listMessages(request);
    if (view === 'conversations') return await listConversations(request);
    if (view === 'players') return await searchPlayers(request);
    throw new ApiError('NOT_FOUND', 'Visão de chat não encontrada.');
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    if (raw?.action === 'send') {
      const parsed = sendSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
      return await sendMessage(parsed.data);
    }
    if (['mute', 'unmute'].includes(raw?.action)) {
      const parsed = muteSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Ação inválida.');
      return await changeMute(parsed.data);
    }
    const parsed = socialSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Ação social inválida.');
    return await changeSocial(parsed.data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
