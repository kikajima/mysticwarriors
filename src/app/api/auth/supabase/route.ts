import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, toErrorResponse } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import {
  accountToView,
  createSession,
  getAuth,
  hashPassword,
  setSessionCookie,
} from '@/lib/auth';
import { playerToView } from '@/lib/game/engine';
import { supabaseUserEndpoint, SUPABASE_PUBLISHABLE_KEY } from '@/lib/supabase/config';
import { trackEvent } from '@/lib/analytics';

// =====================================================================
// POST /api/auth/supabase — PONTE Supabase Auth → conta local (v0.8)
// ---------------------------------------------------------------------
// O cliente faz login/cadastro no Supabase (e-mail + senha) e envia o
// access token. O servidor VALIDA o token consultando o endpoint público
// /auth/v1/user (apenas chave publicável — nenhum segredo envolvido) e:
//
//   1. conta local já vinculada a esse id Supabase → apenas abre sessão;
//   2. sessão atual de CONVIDADO → PROMOVE a conta (personagens são
//      preservados — é o "Salvar meu guerreiro" da era Supabase);
//   3. nenhuma das anteriores → cria conta nova vinculada.
//
// A senha local de contas Supabase é aleatória e inutilizável: login
// sempre passa pelo Supabase. Toda a lógica do jogo (autorização por
// sessão, personagens, atividades) permanece intacta.
// =====================================================================

const bridgeSchema = z.object({
  accessToken: z.string().min(20, 'Token ausente').max(4096, 'Token inválido'),
  nick: z
    .string()
    .trim()
    .min(3, 'O apelido precisa ter pelo menos 3 caracteres')
    .max(20, 'O apelido pode ter no máximo 20 caracteres')
    .regex(/^[\p{L}\p{N}_-]+$/u, 'Use apenas letras, números, hífen ou underline no apelido')
    .optional(),
});

interface SupabaseUserInfo {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/** Valida o access token no Supabase com a chave PUBLICÁVEL apenas. */
async function verifySupabaseToken(accessToken: string): Promise<SupabaseUserInfo> {
  let res: Response;
  try {
    res = await fetch(supabaseUserEndpoint(), {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError('UNAUTHORIZED', 'Não foi possível falar com o servidor de contas. Tente novamente.');
  }
  if (!res.ok) {
    throw new ApiError('UNAUTHORIZED', 'Sua sessão de conta expirou. Entre novamente.');
  }
  const user = (await res.json()) as SupabaseUserInfo;
  if (!user?.id) {
    throw new ApiError('UNAUTHORIZED', 'Sua sessão de conta expirou. Entre novamente.');
  }
  return user;
}

/** Apelido preferido: form → metadados do cadastro → prefixo do e-mail. */
function resolveNick(body: string | undefined, user: SupabaseUserInfo): string {
  const candidates = [
    body,
    typeof user.user_metadata?.nick === 'string' ? (user.user_metadata.nick as string) : null,
    user.email ? user.email.split('@')[0] : null,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const normalized = raw.trim().slice(0, 20).replace(/[^\p{L}\p{N}_-]/gu, '');
    if (normalized.length >= 3) return normalized;
  }
  return 'guerreiro';
}

interface AccountLookup {
  account: { findFirst: (args: { where: { usernameLower: string }; select: { id: true } }) => Promise<{ id: string } | null> };
}

/** Nick único para Account.username (tenta base, depois base-XXXX). */
async function uniqueUsername(tx: AccountLookup, base: string): Promise<string> {
  const lower = base.toLowerCase();
  if (!(await tx.account.findFirst({ where: { usernameLower: lower }, select: { id: true } }))) {
    return base;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `${base.slice(0, 15)}-${suffix}`;
    if (!(await tx.account.findFirst({ where: { usernameLower: candidate.toLowerCase() }, select: { id: true } }))) {
      return candidate;
    }
  }
  return `guerreiro-${Math.random().toString(36).slice(2, 10)}`;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit(`supabase:${ip}`, LIMITS.supabase.limit, LIMITS.supabase.windowMs);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', `Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfterSec / 60)} minuto(s).`);
    }

    const body = await request.json();
    const parsed = bridgeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dados inválidos');
    }

    const user = await verifySupabaseToken(parsed.data.accessToken);
    const preferredNick = resolveNick(parsed.data.nick, user);

    const { account, promoted, rotatedSession } = await db.$transaction(async (tx) => {
      // 1. conta já vinculada a este id Supabase?
      const linked = await tx.account.findUnique({ where: { supabaseUserId: user.id } });
      if (linked) return { account: linked, promoted: false as const, rotatedSession: null };

      // 2. sessão atual de convidado → PROMOVE (personagens preservados)
      // A sessão usa a conexão já reservada: consultar o db global aqui
      // aguardaria a própria transação liberar o pool de uma conexão.
      const current = await getAuth(tx);
      const username = await uniqueUsername(tx, preferredNick);
      if (current?.account.isGuest) {
        const promotedAccount = await tx.account.update({
          where: { id: current.account.id },
          data: {
            supabaseUserId: user.id,
            username,
            usernameLower: username.toLowerCase(),
            // senha aleatória: contas Supabase nunca fazem login local
            passwordHash: hashPassword(randomHex(32)),
            isGuest: false,
          },
        });

        // A sessão de convidado foi emitida antes de a conta ter privilégios
        // permanentes. Ela é invalidada na própria transação da promoção e
        // substituída por um token novo (anti session-fixation).
        await tx.session.updateMany({
          where: { id: current.session.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        const freshSession = await createSession(
          promotedAccount.id,
          request.headers.get('user-agent') ?? undefined,
          tx
        );
        return { account: promotedAccount, promoted: true as const, rotatedSession: freshSession };
      }

      // 3. cria conta nova vinculada ao id Supabase
      const account = await tx.account.create({
        data: {
          supabaseUserId: user.id,
          username,
          usernameLower: username.toLowerCase(),
          passwordHash: hashPassword(randomHex(32)),
          isGuest: false,
        },
      });
      return { account, promoted: false as const, rotatedSession: null };
    });

    const session =
      rotatedSession ??
      (await createSession(account.id, request.headers.get('user-agent') ?? undefined));

    await trackEvent(promoted ? 'account_promoted_supabase' : 'supabase_login', {
      accountId: account.id,
      metadata: { supabaseUserId: user.id },
    });

    const characters = await db.player.findMany({
      where: { accountId: account.id, isBot: false },
      orderBy: { createdAt: 'asc' },
    });

    const activePlayerId =
      account.activePlayerId && characters.some((p) => p.id === account.activePlayerId)
        ? account.activePlayerId
        : null;

    const res = NextResponse.json({
      success: true,
      account: accountToView(account),
      characters: characters.map(playerToView),
      activePlayerId,
    });
    return setSessionCookie(res, session.token);
  } catch (error) {
    return toErrorResponse(error);
  }
}
