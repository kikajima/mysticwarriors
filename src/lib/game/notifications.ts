import type { Prisma } from '@prisma/client';
import type { PlayerNotificationView } from './types';

type Tx = Prisma.TransactionClient;

export interface CreatePlayerNotificationInput {
  playerId: string;
  kind: PlayerNotificationView['kind'];
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function createPlayerNotification(
  tx: Tx,
  input: CreatePlayerNotificationInput
): Promise<void> {
  await tx.playerNotification.create({
    data: {
      playerId: input.playerId,
      kind: input.kind,
      title: input.title.slice(0, 120),
      message: input.message.slice(0, 500),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

/**
 * Entrega notificações exatamente uma vez. Duas polls concorrentes podem
 * ler os mesmos ids, mas somente quem conseguir marcar deliveredAt=null
 * -> timestamp inclui a linha na resposta.
 */
export async function claimPlayerNotifications(
  tx: Tx,
  playerId: string,
  limit = 10
): Promise<PlayerNotificationView[]> {
  const rows = await tx.playerNotification.findMany({
    where: { playerId, deliveredAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.max(1, Math.min(25, Math.trunc(limit))),
  });

  const delivered: PlayerNotificationView[] = [];
  const now = new Date();
  for (const row of rows) {
    const claimed = await tx.playerNotification.updateMany({
      where: { id: row.id, playerId, deliveredAt: null },
      data: { deliveredAt: now },
    });
    if (claimed.count !== 1) continue;
    delivered.push({
      id: row.id,
      kind: row.kind as PlayerNotificationView['kind'],
      title: row.title,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      metadata: parseMetadata(row.metadata),
    });
  }
  return delivered;
}
