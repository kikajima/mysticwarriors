import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, toErrorResponse } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { accountToView, createSession, hashPassword, setSessionCookie } from '@/lib/auth';
import { trackEvent } from '@/lib/analytics';

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'O usuário precisa ter pelo menos 3 caracteres')
    .max(20, 'O usuário pode ter no máximo 20 caracteres')
    .regex(/^[\p{L}\p{N}_-]+$/u, 'Use apenas letras, números, hífen ou underline'),
  password: z
    .string()
    .min(8, 'A senha precisa ter pelo menos 8 caracteres')
    .max(64, 'A senha pode ter no máximo 64 caracteres'),
});

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit(`register:${ip}`, LIMITS.register.limit, LIMITS.register.windowMs);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', `Muitas tentativas de cadastro. Tente novamente em ${Math.ceil(rl.retryAfterSec / 60)} minuto(s).`);
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dados inválidos');
    }

    const { username, password } = parsed.data;
    const normalized = username.trim();
    const lower = normalized.toLowerCase();

    const existing = await db.account.findFirst({
      where: { usernameLower: lower },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError('USERNAME_TAKEN', 'Este nome de usuário já está em uso. Escolha outro!');
    }

    const session = await db.$transaction(async (tx) => {
      // re-checa dentro da transação (condição de corrida de cadastro duplo)
      const race = await tx.account.findFirst({ where: { usernameLower: lower }, select: { id: true } });
      if (race) throw new ApiError('USERNAME_TAKEN', 'Este nome de usuário já está em uso. Escolha outro!');

      const account = await tx.account.create({
        data: {
          username: normalized,
          usernameLower: lower,
          passwordHash: hashPassword(password),
          isGuest: false,
        },
      });
      // sessão criada DENTRO da transação (mesmo client)
      return createSession(account.id, request.headers.get('user-agent') ?? undefined, tx);
    });

    await trackEvent('account_created', { accountId: session.accountId });

    const res = NextResponse.json({
      success: true,
      account: { id: session.accountId, username: normalized, isGuest: false },
      characters: [],
    });
    return setSessionCookie(res, session.token);
  } catch (error) {
    return toErrorResponse(error);
  }
}
