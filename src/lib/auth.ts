import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import type { Account, Player, Prisma, Session } from '@prisma/client';

// =====================================================================
// Autenticação e autorização server-side
// ---------------------------------------------------------------------
// Modelo de confiança: cookie de sessão (HttpOnly) -> Account -> Player.
// O "playerId" enviado pelo cliente apenas IDENTIFICA o personagem;
// a AUTORIZAÇÃO vem sempre da sessão: player.accountId === session.accountId.
// =====================================================================

export const SESSION_COOKIE = 'gm_session';
export const SESSION_TTL_DAYS = 30;

// ===== Hash de senha (scrypt nativo) =====

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, 'hex');
  if (candidate.length !== original.length) return false;
  return timingSafeEqual(candidate, original);
}

/** Token de sessão aleatório criptograficamente seguro. */
export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

// ===== Sessões =====

export interface AuthContext {
  account: Account;
  session: Session;
}

/** Cria uma sessão no banco e devolve o token (o chamador grava o cookie). */
export async function createSession(
  accountId: string,
  userAgent?: string,
  tx: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient
): Promise<Session> {
  const token = newSessionToken();
  return tx.session.create({
    data: {
      token,
      accountId,
      userAgent: userAgent?.slice(0, 200),
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
}

/** Invalida a sessão no banco (logout real). */
export async function revokeSession(token: string): Promise<void> {
  await db.session.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Valida o cookie de sessão e retorna account + session.
 * Checa existência, revogação e expiração no banco.
 */
export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: { account: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  return { account: session.account, session };
}

/** Versão que lança 401 — para rotas que exigem sessão. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new ApiError('UNAUTHORIZED', 'Sua sessão expirou. Entre novamente.');
  return auth;
}

// ===== Autorização de personagem =====

export type PlayerWithGuild = Player & { guild: { id: string; name: string; leaderId: string; level: number } | null };

/**
 * CENTRO DA AUTORIZAÇÃO: carrega o personagem e garante que ele
 * pertence à conta da sessão. Lança 404 (não existe) ou 403 (de outra conta).
 *
 * playerId NUNCA é fonte de autenticação — apenas de identificação.
 */
export async function requirePlayer(
  auth: AuthContext,
  playerId: string,
  tx: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient
): Promise<PlayerWithGuild> {
  const player = await tx.player.findUnique({
    where: { id: playerId },
    include: { guild: { select: { id: true, name: true, leaderId: true, level: true } } },
  });
  if (!player || player.isBot) {
    throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado.');
  }
  if (!player.accountId || player.accountId !== auth.account.id) {
    throw new ApiError('FORBIDDEN', 'Este guerreiro não pertence à sua conta.');
  }
  return player;
}

// ===== Cookies =====

export interface CookieOptions {
  secure?: boolean;
  maxAge?: number;
}

/** Grava o cookie de sessão em uma resposta NextResponse.
 *
 * v0.9.12 — PAINEL DE VISUALIZAÇÃO (iframe cross-site):
 * o jogo roda EMBUTIDO no painel de preview do chat (origem
 * preview-chat-*.space-z.ai dentro da interface, um SITE diferente).
 * Cookies SameSite=Lax NUNCA são anexados a fetches cross-site vindos
 * de um iframe — o login "funcionava" (200 + Set-Cookie) e a chamada
 * seguinte chegava SEM cookie (401): o dono não conseguia criar
 * personagem pelo painel (diagnóstico em dev.log: guest 200 → create
 * 401; supabase 200 → create 401).
 *
 * SameSite=None é o padrão para apps embutidos em iframes de outro site;
 * a especificação EXIGE Secure. Navegadores modernos aceitam cookies
 * Secure em HTTPS (preview/produção) e tratam http://localhost como
 * origem confiável (exceção que mantém o fluxo local de dev/testes).
 * CSRF permanece mitigado: todas as mutações são POST application/json
 * (preflight CORS obrigatório, que a API não aprova para origens
 * estranhas) + autorização por sessão server-side.
 */
export function setSessionCookie(response: NextResponse, token: string, opts: CookieOptions = {}): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: opts.secure ?? true,
    sameSite: 'none',
    path: '/',
    maxAge: opts.maxAge ?? SESSION_TTL_DAYS * 24 * 60 * 60,
  });
  return response;
}

/** Limpa o cookie de sessão (mesmos atributos para casar com o ativo). */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 0,
  });
  return response;
}

// ===== Views =====

export interface AccountSession {
  id: string;
  username: string;
  isGuest: boolean;
}

export function accountToView(account: {
  id: string;
  username: string | null;
  isGuest: boolean;
}): AccountSession {
  return {
    id: account.id,
    username: account.isGuest ? 'Convidado' : (account.username ?? 'Convidado'),
    isGuest: account.isGuest,
  };
}
