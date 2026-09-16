import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, toErrorResponse } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { accountToView, hashPassword, requireAuth } from '@/lib/auth';
import { playerToView } from '@/lib/game/engine';
import { trackEvent } from '@/lib/analytics';

const convertSchema = z.object({
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

/**
 * "Salvar meu guerreiro": promove a conta de CONVIDADO da sessão para conta
 * real (username + senha), preservando TODOS os personagens e progressos.
 *
 * Atômico e sem duplicação: os personagens já pertencem a esta conta —
 * nenhuma linha de Player é criada ou movida. Apenas os campos de
 * identidade da conta são atualizados dentro de uma transação.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit(`convert:${ip}`, LIMITS.convert.limit, LIMITS.convert.windowMs);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', 'Muitas tentativas. Aguarde um momento.');
    }

    const auth = await requireAuth();
    if (!auth.account.isGuest) {
      throw new ApiError('ACCOUNT_NOT_GUEST', 'Sua conta já é permanente.');
    }

    const body = await request.json();
    const parsed = convertSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dados inválidos');
    }

    const { username, password } = parsed.data;
    const normalized = username.trim();
    const lower = normalized.toLowerCase();

    const account = await db.$transaction(async (tx) => {
      const taken = await tx.account.findFirst({ where: { usernameLower: lower }, select: { id: true } });
      if (taken) throw new ApiError('USERNAME_TAKEN', 'Este nome de usuário já está em uso. Escolha outro!');

      const updated = await tx.account.update({
        where: { id: auth.account.id },
        data: {
          username: normalized,
          usernameLower: lower,
          passwordHash: hashPassword(password),
          isGuest: false,
        },
      });
      return updated;
    });

    const characters = await db.player.findMany({
      where: { accountId: account.id, isBot: false },
      orderBy: { createdAt: 'asc' },
    });

    await trackEvent('account_created', { accountId: account.id, metadata: { via: 'guest_conversion' } });

    return NextResponse.json({
      success: true,
      account: accountToView(account),
      characters: characters.map(playerToView),
      message: 'Progresso salvo! Seu guerreiro agora está garantido na sua conta.',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
