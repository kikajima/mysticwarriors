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
  action: z.enum([
    'send_friend_request',
    'cancel_friend_request',
    'accept_friend_request',
    'decline_friend_request',
    'remove_friend',
    'block',
    'unblock',
  ]),
  playerId: z.string().min(1).max(80).optional(),
  targetId: z.string().min(1).max(80),
});

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

async function blockedIds(playerId: string): Promise<string[]> {
  const rows = await db.chatBlock.findMany({
    where: { playerId },
    select: { blockedPlayerId: true },
  });
  return rows.map((row) => row.blockedPlayerId);
}

async function isBlockedEitherWay(playerId: string, targetId: string): Promise<boolean> {
  return Boolean(await db.chatBlock.findFirst({
    where: {
      OR: [
        { playerId, blockedPlayerId: targetId },
        { playerId: targetId, blockedPlayerId: playerId },
      ],
    },
    select: { id: true },
  }));
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
  const hidden = new Set([...(await mutedIds(player.id)), ...(await blockedIds(player.id))]);
  const hiddenIds = [...hidden];
  const visibleSender: Prisma.ChatMessageWhereInput | undefined = hiddenIds.length
    ? { OR: [{ senderPlayerId: player.id }, { senderPlayerId: { notIn: hiddenIds } }] }
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
    if (await isBlockedEitherWay(player.id, targetId)) {
      throw new ApiError('FORBIDDEN', 'Esta conversa privada está bloqueada.');
    }
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
  const hidden = new Set([...(await mutedIds(player.id)), ...(await blockedIds(player.id))]);
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

  const rows = await db.player.findMany({
    where: {
      isBot: false,
      id: { not: player.id },
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
  if (!auth) return ok({
    authenticated: false,
    player: null,
    muted: [],
    friends: [],
    blocked: [],
    friendRequestsIncoming: [],
    friendRequestsOutgoing: [],
  });

  const explicitPlayerId = requestPlayerId(request);
  const player = explicitPlayerId
    ? await requireChatPlayer(auth, explicitPlayerId)
    : await getChatPlayer(auth);

  if (!player) return ok({
    authenticated: true,
    player: null,
    muted: [],
    friends: [],
    blocked: [],
    friendRequestsIncoming: [],
    friendRequestsOutgoing: [],
  });

  const [muted, friends, blocked, incomingRequests, outgoingRequests] = await Promise.all([
    db.chatMute.findMany({
      where: { playerId: player.id },
      select: { mutedPlayerId: true, mutedPlayerName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.chatFriend.findMany({
      where: { playerId: player.id },
      select: { friendPlayerId: true, friendPlayerName: true, createdAt: true },
      orderBy: [{ friendPlayerName: 'asc' }, { createdAt: 'asc' }],
    }),
    db.chatBlock.findMany({
      where: { playerId: player.id },
      select: { blockedPlayerId: true, blockedPlayerName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.chatFriendRequest.findMany({
      where: { recipientPlayerId: player.id },
      select: { senderPlayerId: true, senderPlayerName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.chatFriendRequest.findMany({
      where: { senderPlayerId: player.id },
      select: { recipientPlayerId: true, recipientPlayerName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
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
    friends: friends.map((row) => ({
      playerId: row.friendPlayerId,
      name: row.friendPlayerName,
      createdAt: row.createdAt.toISOString(),
    })),
    blocked: blocked.map((row) => ({
      playerId: row.blockedPlayerId,
      name: row.blockedPlayerName,
      createdAt: row.createdAt.toISOString(),
    })),
    friendRequestsIncoming: incomingRequests.map((row) => ({
      playerId: row.senderPlayerId,
      name: row.senderPlayerName,
      createdAt: row.createdAt.toISOString(),
    })),
    friendRequestsOutgoing: outgoingRequests.map((row) => ({
      playerId: row.recipientPlayerId,
      name: row.recipientPlayerName,
      createdAt: row.createdAt.toISOString(),
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
    if (await isBlockedEitherWay(player.id, target.id)) {
      throw new ApiError('FORBIDDEN', 'Não é possível enviar mensagem privada enquanto houver bloqueio entre vocês.');
    }
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
  if (data.targetId === player.id) {
    throw new ApiError('VALIDATION_ERROR', 'Escolha outro guerreiro.');
  }

  // Limpezas continuam reversíveis mesmo se o outro personagem for excluído.
  if (data.action === 'remove_friend') {
    await db.$transaction([
      db.chatFriend.deleteMany({
        where: {
          OR: [
            { playerId: player.id, friendPlayerId: data.targetId },
            { playerId: data.targetId, friendPlayerId: player.id },
          ],
        },
      }),
      db.chatFriendRequest.deleteMany({
        where: {
          OR: [
            { senderPlayerId: player.id, recipientPlayerId: data.targetId },
            { senderPlayerId: data.targetId, recipientPlayerId: player.id },
          ],
        },
      }),
    ]);
    return ok({ friendship: 'none', target: { playerId: data.targetId } });
  }

  if (data.action === 'cancel_friend_request') {
    await db.chatFriendRequest.deleteMany({
      where: { senderPlayerId: player.id, recipientPlayerId: data.targetId },
    });
    return ok({ friendship: 'none', target: { playerId: data.targetId } });
  }

  if (data.action === 'decline_friend_request') {
    await db.chatFriendRequest.deleteMany({
      where: { senderPlayerId: data.targetId, recipientPlayerId: player.id },
    });
    return ok({ friendship: 'none', target: { playerId: data.targetId } });
  }

  if (data.action === 'unblock') {
    await db.chatBlock.deleteMany({
      where: { playerId: player.id, blockedPlayerId: data.targetId },
    });
    return ok({ blocked: false, target: { playerId: data.targetId } });
  }

  const target = await db.player.findFirst({
    where: { id: data.targetId, isBot: false },
    select: { id: true, name: true },
  });
  if (!target) throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado.');

  if (data.action === 'send_friend_request') {
    if (await isBlockedEitherWay(player.id, target.id)) {
      throw new ApiError('FORBIDDEN', 'Não é possível enviar convite enquanto houver bloqueio entre vocês.');
    }
    const [alreadyFriend, incoming] = await Promise.all([
      db.chatFriend.findUnique({
        where: { playerId_friendPlayerId: { playerId: player.id, friendPlayerId: target.id } },
        select: { id: true },
      }),
      db.chatFriendRequest.findUnique({
        where: {
          senderPlayerId_recipientPlayerId: {
            senderPlayerId: target.id,
            recipientPlayerId: player.id,
          },
        },
        select: { id: true },
      }),
    ]);
    if (alreadyFriend) throw new ApiError('VALIDATION_ERROR', 'Vocês já são amigos.');
    if (incoming) {
      throw new ApiError('VALIDATION_ERROR', 'Você já recebeu um convite deste guerreiro. Aceite ou recuse o pedido.');
    }

    await db.chatFriendRequest.upsert({
      where: {
        senderPlayerId_recipientPlayerId: {
          senderPlayerId: player.id,
          recipientPlayerId: target.id,
        },
      },
      update: {
        senderPlayerName: player.name,
        recipientPlayerName: target.name,
      },
      create: {
        senderPlayerId: player.id,
        senderPlayerName: player.name,
        recipientPlayerId: target.id,
        recipientPlayerName: target.name,
      },
    });
    return ok({ friendship: 'pending', target: { playerId: target.id, name: target.name } });
  }

  if (data.action === 'accept_friend_request') {
    if (await isBlockedEitherWay(player.id, target.id)) {
      throw new ApiError('FORBIDDEN', 'Desfaça o bloqueio antes de aceitar este convite.');
    }
    const request = await db.chatFriendRequest.findUnique({
      where: {
        senderPlayerId_recipientPlayerId: {
          senderPlayerId: target.id,
          recipientPlayerId: player.id,
        },
      },
      select: { id: true },
    });
    if (!request) throw new ApiError('NOT_FOUND', 'Este convite de amizade não está mais pendente.');

    await db.$transaction([
      db.chatFriend.upsert({
        where: { playerId_friendPlayerId: { playerId: player.id, friendPlayerId: target.id } },
        update: { friendPlayerName: target.name },
        create: {
          playerId: player.id,
          friendPlayerId: target.id,
          friendPlayerName: target.name,
        },
      }),
      db.chatFriend.upsert({
        where: { playerId_friendPlayerId: { playerId: target.id, friendPlayerId: player.id } },
        update: { friendPlayerName: player.name },
        create: {
          playerId: target.id,
          friendPlayerId: player.id,
          friendPlayerName: player.name,
        },
      }),
      db.chatFriendRequest.deleteMany({
        where: {
          OR: [
            { senderPlayerId: player.id, recipientPlayerId: target.id },
            { senderPlayerId: target.id, recipientPlayerId: player.id },
          ],
        },
      }),
    ]);
    return ok({ friendship: 'friend', target: { playerId: target.id, name: target.name } });
  }

  // Bloquear desfaz amizade e cancela convites nos dois sentidos.
  await db.$transaction([
    db.chatFriend.deleteMany({
      where: {
        OR: [
          { playerId: player.id, friendPlayerId: target.id },
          { playerId: target.id, friendPlayerId: player.id },
        ],
      },
    }),
    db.chatFriendRequest.deleteMany({
      where: {
        OR: [
          { senderPlayerId: player.id, recipientPlayerId: target.id },
          { senderPlayerId: target.id, recipientPlayerId: player.id },
        ],
      },
    }),
    db.chatMute.deleteMany({
      where: { playerId: player.id, mutedPlayerId: target.id },
    }),
    db.chatBlock.upsert({
      where: { playerId_blockedPlayerId: { playerId: player.id, blockedPlayerId: target.id } },
      update: { blockedPlayerName: target.name },
      create: {
        playerId: player.id,
        blockedPlayerId: target.id,
        blockedPlayerName: target.name,
      },
    }),
  ]);
  return ok({ blocked: true, target: { playerId: target.id, name: target.name } });
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
    if ([
      'send_friend_request',
      'cancel_friend_request',
      'accept_friend_request',
      'decline_friend_request',
      'remove_friend',
      'block',
      'unblock',
    ].includes(String(raw?.action))) {
      const parsed = socialSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Ação social inválida.');
      return await changeSocial(parsed.data);
    }
    const parsed = muteSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Ação inválida.');
    return await changeMute(parsed.data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
