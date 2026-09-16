import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, toErrorResponse } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { accountToView, createSession, hashPassword, setSessionCookie } from '@/lib/auth';
import { randomWarriorName } from '@/lib/game/content/names';
import { trackEvent } from '@/lib/analytics';

/**
 * "Jogar como convidado": cria uma conta de convidado (isGuest=true) com
 * senha aleatória inutilizável e uma sessão em cookie HttpOnly.
 *
 * O personagem do convidado já nasce vinculado a essa conta — por isso a
 * conversão posterior para conta real ("Salvar meu guerreiro") nunca
 * duplica progresso: ela apenas promove a própria conta.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit(`guest:${ip}`, LIMITS.guest.limit, LIMITS.guest.windowMs);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', 'Muitas sessões de convidado criadas neste navegador. Tente novamente mais tarde.');
    }

    const session = await db.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          username: null,
          usernameLower: null,
          // senha aleatória: a conta de convidado não pode sofrer login direto
          passwordHash: hashPassword(randomBytesHex(32)),
          isGuest: true,
        },
      });
      return createSession(account.id, request.headers.get('user-agent') ?? undefined, tx);
    });

    await trackEvent('guest_started', { accountId: session.accountId });

    const res = NextResponse.json({
      success: true,
      account: { id: session.accountId, username: 'Convidado', isGuest: true },
      characters: [],
    });
    return setSessionCookie(res, session.token);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function randomBytesHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}
