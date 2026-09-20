import { z } from 'zod';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { db } from '@/lib/db';
import { acknowledgePlayerNotifications } from '@/lib/game/notifications';
import { LIMITS, rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  playerId: z.string().min(1).max(64),
  ids: z.array(z.string().min(1).max(64)).min(1).max(25),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const rl = rateLimit(
      `notifications:${auth.session.id}`,
      LIMITS.state.limit,
      LIMITS.state.windowMs
    );
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', `Muitas confirmações rápidas. Tente novamente em ${rl.retryAfterSec}s.`);
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', 'Notificações inválidas.');
    }

    await requirePlayer(auth, parsed.data.playerId);
    const acknowledged = await db.$transaction((tx) =>
      acknowledgePlayerNotifications(tx, parsed.data.playerId, parsed.data.ids)
    );

    return ok({ acknowledged });
  } catch (error) {
    return toErrorResponse(error);
  }
}
