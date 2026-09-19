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
  const muted = await mutedIds(player.id);
  const visibleSender: Prisma.ChatMessageWhereInput | undefined = muted.length
    ? { OR: [{ senderPlayerId: player.id }, { senderPlayerId: { notIn: muted } }] }
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
  const muted = new Set(await mutedIds(player.id));
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
    if (!otherId || !otherName || seen.has(otherId) || muted.has(otherId)) continue;
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
  if (!auth) return ok({ authenticated: false, player: null, muted: [] });

  const explicitPlayerId = requestPlayerId(request);
  const player = explicitPlayerId
    ? await requireChatPlayer(auth, explicitPlayerId)
    : await getChatPlayer(auth);

  if (!player) return ok({ authenticated: true, player: null, muted: [] });

  const muted = await db.chatMute.findMany({
    where: { playerId: player.id },
    select: { mutedPlayerId: true, mutedPlayerName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
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
    const parsed = muteSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Ação inválida.');
    return await changeMute(parsed.data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
