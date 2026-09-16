import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, toErrorResponse } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { accountToView, createSession, setSessionCookie, verifyPassword } from '@/lib/auth';
import { playerToView } from '@/lib/game/engine';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário'),
  password: z.string().min(1, 'Informe a senha'),
});

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit(`login:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', `Muitas tentativas de login. Tente novamente em ${Math.ceil(rl.retryAfterSec / 60)} minuto(s).`);
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dados inválidos');
    }

    const { username, password } = parsed.data;
    const account = await db.account.findFirst({
      where: { usernameLower: username.trim().toLowerCase(), isGuest: false },
    });

    // Mensagem genérica: não revela se o usuário existe (anti-enumeração)
    if (!account || !verifyPassword(password, account.passwordHash)) {
      throw new ApiError('UNAUTHORIZED', 'Usuário ou senha incorretos.');
    }

    const session = await createSession(account.id, request.headers.get('user-agent') ?? undefined);

    const characters = await db.player.findMany({
      where: { accountId: account.id, isBot: false },
      orderBy: { createdAt: 'asc' },
    });

    const res = NextResponse.json({
      success: true,
      account: accountToView(account),
      characters: characters.map(playerToView),
    });
    return setSessionCookie(res, session.token);
  } catch (error) {
    return toErrorResponse(error);
  }
}
