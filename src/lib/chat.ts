import type { AuthContext } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const CHAT_MAX_MESSAGE = 500;
export const CHAT_PAGE_SIZE = 60;
export const CHAT_CHANNELS = ['global', 'guild', 'private'] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

export async function getChatPlayer(
  auth: AuthContext,
  playerId?: string | null,
  client: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient
) {
  const targetId = playerId ?? auth.account.activePlayerId;
  if (!targetId) return null;

  return client.player.findFirst({
    where: { id: targetId, accountId: auth.account.id, isBot: false },
    select: {
      id: true,
      name: true,
      race: true,
      level: true,
      guildId: true,
      guild: { select: { id: true, name: true } },
    },
  });
}

export async function requireChatPlayer(
  auth: AuthContext,
  playerId?: string | null,
  client: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient
) {
  const player = await getChatPlayer(auth, playerId, client);
  if (!player) {
    throw new ApiError('FORBIDDEN', 'Este guerreiro não pertence à sua conta ou não está disponível.');
  }
  return player;
}

// Compatibilidade interna com chamadas antigas: sem playerId explícito, usa o
// personagem ativo da conta. O widget novo sempre envia playerId para trocar
// de personagem sem esperar o polling do activePlayerId.
export async function getActiveChatPlayer(
  auth: AuthContext,
  client: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient
) {
  return getChatPlayer(auth, null, client);
}

export async function requireActiveChatPlayer(
  auth: AuthContext,
  client: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient
) {
  const player = await getActiveChatPlayer(auth, client);
  if (!player) {
    throw new ApiError('VALIDATION_ERROR', 'Selecione um guerreiro para usar o chat.');
  }
  return player;
}

export function chatMessageView(message: {
  id: string;
  channel: string;
  senderPlayerId: string;
  senderName: string;
  recipientPlayerId: string | null;
  recipientName: string | null;
  guildId: string | null;
  guildName: string | null;
  body: string;
  createdAt: Date;
}) {
  return {
    id: message.id,
    channel: message.channel,
    senderPlayerId: message.senderPlayerId,
    senderName: message.senderName,
    recipientPlayerId: message.recipientPlayerId,
    recipientName: message.recipientName,
    guildId: message.guildId,
    guildName: message.guildName,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

export function normalizeChatBody(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
}
