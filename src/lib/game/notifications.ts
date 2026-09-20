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
 * Lista avisos ainda não confirmados. Não marca como entregue aqui:
 * a confirmação só acontece depois que o navegador realmente recebeu e
 * exibiu o pop-up, evitando perder uma notificação por queda de rede.
 */
export async function listPendingPlayerNotifications(
  tx: Tx,
  playerId: string,
  limit = 10
): Promise<PlayerNotificationView[]> {
  const rows = await tx.playerNotification.findMany({
    where: { playerId, deliveredAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.max(1, Math.min(25, Math.trunc(limit))),
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as PlayerNotificationView['kind'],
    title: row.title,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    metadata: parseMetadata(row.metadata),
  }));
}

export async function acknowledgePlayerNotifications(
  tx: Tx,
  playerId: string,
  ids: string[]
): Promise<number> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 25);
  if (unique.length === 0) return 0;
  const result = await tx.playerNotification.updateMany({
    where: { playerId, id: { in: unique }, deliveredAt: null },
    data: { deliveredAt: new Date() },
  });
  return result.count;
}
