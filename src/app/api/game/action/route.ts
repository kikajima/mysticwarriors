import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { getAuth, requireAuth } from '@/lib/auth';
import { executeGameAction, type ActionResult } from '@/lib/game/actions';
import { playerToView } from '@/lib/game/engine';
import { ensureBalanceVersion } from '@/lib/game/balance';
import { maybeBeacon } from '@/lib/game/persistence';
import { bossAttacksPerWindow } from '@/lib/worldboss';
import { db } from '@/lib/db';
import { ensureQuests } from '@/lib/progression';
import { Prisma } from '@prisma/client';

// =====================================================================
// POST /api/game/action — TODAS as ações do jogo
// ---------------------------------------------------------------------
// Autorização: cookie de sessão → account → player.accountId.
// O playerId do corpo apenas IDENTIFICA o personagem; se não pertencer
// à conta da sessão → 403. Sem sessão → 401.
// Toda a lógica roda em transação com regras centralizadas.
//
// v0.3 — IDEMPOTÊNCIA (anti replay): o cliente pode enviar `requestId`
// (UUID por tentativa). O servidor registra (playerId, requestId) ANTES
// de executar: um retry em rede com o MESMO id devolve o resultado em
// cache (TTL 5 min) em vez de executar a ação duas vezes.
// =====================================================================

const DEDUP_TTL_MS = 5 * 60_000; // 5 minutos

// =====================================================================
// v-auditoria F4 — SERIALIZAÇÃO GLOBAL DAS AÇÕES (hardening de concorrência)
// ---------------------------------------------------------------------
// Motivação (evidência E2E da auditoria): rajadas de ações concorrentes
// (double-click, duas abas, N jogadores no boss) intercalavam transações
// interativas no SQLite e produziam dois sintomas ruins:
//  (a) CONFLICT 409 do stateVersion (bloqueio otimista) — seguro, mas
//      atrapalhava o jogador;
//  (b) P1008 após a ação JÁ COMMITADA (500 no ensureQuests/leitura final
//      sem catch — o jogador via erro numa compra que tinha passado!).
// O banco É single-writer; serializar na aplicação apenas formaliza isso:
// uma ação por vez, com TODO o seu pós-processamento (dedup cache, quests,
// estado fresco) dentro da mesma fila. Leituras (state GET) seguem
// concorrentes no WAL. Processo único + SQLite local ⇒ correto e simples.
// =====================================================================
let actionChain: Promise<unknown> = Promise.resolve();

async function withActionLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = actionChain.then(fn, fn); // executa mesmo se o anterior falhou
  actionChain = run.catch(() => undefined);
  return run;
}

function isTransientSqliteError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P1008' || error.code === 'P2028' || error.code === 'P2034')
  );
}

async function executeActionWithRetry(
  auth: Awaited<ReturnType<typeof requireAuth>>,
  playerId: string,
  type: string,
  args: Record<string, unknown>
): Promise<ActionResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await executeGameAction(auth, playerId, type, args);
    } catch (error) {
      if (!isTransientSqliteError(error) || attempt === 2) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

const actionSchema = z.object({
  playerId: z.string().min(1),
  type: z.string().min(1),
  // identificador único da tentativa (proteção contra replay/retry duplo)
  requestId: z.string().min(8).max(64).optional(),
  // argumentos opcionais (validados dentro do executor por ação)
  stat: z.string().optional(),
  missionId: z.string().optional(),
  // v0.6: id da profissão ao iniciar um turno (alias de missionId)
  professionId: z.string().optional(),
  enemyId: z.string().optional(),
  targetId: z.string().optional(),
  itemId: z.string().optional(),
  slot: z.string().optional(),
  // v0.9.10 (Mudança 2): quantidade para compra/venda na loja — inteiro
  // 1..99 (a ação valida de novo no executor; o servidor nunca confia no
  // preço calculado pelo cliente, só na quantidade pedida).
  quantity: z
    .number({ message: 'Quantidade inválida.' })
    .int('Quantidade deve ser um número inteiro.')
    .min(1, 'Quantidade mínima é 1.')
    .max(99, 'Máximo de 99 unidades por transação.')
    .optional(),
  wishType: z.string().optional(),
  techniqueId: z.string().nullable().optional(),
  guildName: z.string().max(40).optional(),
  strategy: z.string().optional(),
  transformationId: z.string().nullable().optional(),
  questId: z.string().optional(),
  achievementId: z.string().optional(),
  cosmeticId: z.string().optional(),
  // v0.9.15 — talento de Ímpeto (Cap. 7) comprado na loja
  talentId: z.string().optional(),
  amount: z.number().int().optional(),
});

export async function POST(request: Request) {
  // lock de dedup criado para ESTA requisição (limpo se a ação falhar)
  // v-auditoria F4: o lock do dedup vive num wrapper — atribuições dentro
  // da closure do withActionLock precisam ser visíveis ao catch (o fluxo do
  // TS não enxerga mutações de `let` feitas em closures para narrowing)
  const dedupRef: { current: { playerId: string; requestId: string } | null } = { current: null };
  try {
    const auth = await requireAuth();
    // persistência: beacon dirigido por tráfego (fire-and-forget)
    maybeBeacon(request);

    // rate limit por sessão + IP (proteção contra bots de ação)
    const ip = clientIp(request);
    const rl = rateLimit(`action:${auth.session.id}`, LIMITS.action.limit, LIMITS.action.windowMs);
    const rl2 = rateLimit(`action-ip:${ip}`, LIMITS.action.limit * 3, LIMITS.action.windowMs);
    if (!rl.allowed || !rl2.allowed) {
      throw new ApiError('RATE_LIMITED', 'Muitas ações rapidamente. Respire um pouco, guerreiro!');
    }

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Ação inválida.');
    }
    const { playerId, type, requestId, ...args } = parsed.data;

    // v0.9.11 — rate limit ESPECÍFICO do chefe global, DERIVADO da fonte
    // única do cooldown (worldboss.ts): cadência legítima máxima = 1 ataque
    // por ATTACK_COOLDOWN_SEC, com +1 de folga para corridas de borda.
    // Aplicado ANTES do lock de dedup — spam nem chega a criar registro.
    if (type === 'world_boss_attack') {
      const rlBoss = rateLimit(
        `worldboss:${auth.session.id}`,
        bossAttacksPerWindow(60_000),
        60_000
      );
      if (!rlBoss.allowed) {
        throw new ApiError('RATE_LIMITED', 'Muitos ataques seguidos à ameaça universal — respire um pouco, guerreiro!');
      }
    }

    let result: ActionResult | undefined;
    let deduplicated = false;

    if (requestId) {
      // v0.9.2 — limpeza de registros expirados PROBABILÍSTICA (~1 em 8
      // ações): era uma transação de escrita a CADA ação (fsync em disco
      // lento da hospedagem = parte do "delay" ao coletar recompensas).
      // Registros são minúsculos e o TTL continua valendo na leitura —
      // limpar de vez em quando basta.
      if (Math.random() < 0.125) {
        await db.requestDedup.deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - DEDUP_TTL_MS) } },
        }).catch(() => undefined);
      }

      // FAST PATH (leitura, sem lock): retry de rede com resultado já em
      // cache → devolve direto, sem entrar na fila de ações
      const cached = await db.requestDedup
        .findUnique({ where: { playerId_requestId: { playerId, requestId } } })
        .catch(() => null);
      if (cached) {
        if (cached.result && Date.now() - cached.createdAt.getTime() < DEDUP_TTL_MS) {
          // replay dentro do TTL → devolve o MESMO resultado (sem re-executar)
          result = JSON.parse(cached.result) as ActionResult;
          deduplicated = true;
        } else if (!cached.result) {
          // linha sem resultado: outra tentativa com o MESMO id ainda está
          // na fila global (ou sobra benigna) — o TTL de 5 min resolve
          throw new ApiError('CONFLICT', 'Requisição duplicada em processamento — aguarde um instante.');
        }
      }
    }

    if (!deduplicated) {
      // v-auditoria F4: TODO o fluxo roda dentro da MESMA fila global —
      // inclusive o LOCK do dedup (o INSERT concorrente de N rajadas não
      // disputa o escritor único do SQLite com transações de ação; era a
      // última fonte de P1008/500 pré-ação). Uma ação confirmada NUNCA
      // devolve 500 por contenção; uma rajada inteira entra em fila.
      result = await withActionLock(async () => {
        if (requestId && !result) {
          // LOCK: cria o registro antes de executar. Unique violation
          // (P2002) = outro request com o MESMO id já passou por aqui.
          try {
            await db.requestDedup.create({ data: { playerId, requestId } });
            dedupRef.current = { playerId, requestId };
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
              const existing = await db.requestDedup
                .findUnique({ where: { playerId_requestId: { playerId, requestId } } })
                .catch(() => null);
              if (existing?.result && Date.now() - existing.createdAt.getTime() < DEDUP_TTL_MS) {
                deduplicated = true;
                return JSON.parse(existing.result) as ActionResult;
              }
              throw new ApiError('CONFLICT', 'Requisição duplicada em processamento — aguarde um instante.');
            }
            throw e;
          }
        }
        const r = await executeActionWithRetry(auth, playerId, type, args);
        if (dedupRef.current) {
          // cacheia o resultado para retries futuros com o mesmo requestId
          const dedupKey = dedupRef.current;
          await db.requestDedup
            .update({
              where: { playerId_requestId: dedupKey },
              data: { result: JSON.stringify(r) },
            })
            .catch(() => undefined);
          dedupRef.current = null; // registrado (ou falhou benignamente) — não limpar no finally
        }
        return r;
      });
    }
    if (!result) throw new ApiError('INTERNAL', 'Resultado da ação indisponível.');

    // manutenção idempotente — NUNCA derruba uma ação que já passou
    await db
      .$transaction(async (tx) => ensureQuests(tx, playerId), { timeout: 15_000, maxWait: 5_000 })
      .catch(() => undefined);

    // idempotente e barato (1 consulta por processo) — política de reset
    await ensureBalanceVersion().catch(() => undefined);

    // estado fresco do personagem (pós-transação) — inclui atividade em
    // andamento + cosméticos da conta (posse) e do personagem (equipados).
    // Retry curto: sob qualquer contenção residual, tenta 3× antes de
    // desistir (o cliente re-sincroniza pelo polling de estado).
    let fresh: Awaited<ReturnType<typeof db.player.findUnique>> = null;
    for (let attempt = 0; attempt < 3 && !fresh; attempt++) {
      try {
        fresh = await db.player.findUnique({
          where: { id: playerId },
          include: {
            guild: true,
            activities: { where: { completedAt: null, endsAt: { gt: new Date() } }, take: 1 },
          },
        });
      } catch {
        await new Promise((res) => setTimeout(res, 150 * (attempt + 1)));
      }
    }
    if (!fresh) throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado (sincronize pelo painel).');

    return ok({
      player: playerToView(fresh),
      message: result.message,
      levelsGained: result.levelsGained,
      battle: result.battle ?? null,
      missionResult: result.missionResult ?? null,
      bossAttack: result.bossAttack ?? null,
      activity: result.activity ?? null,
      appliedResults: result.appliedResults ?? [],
      deduplicated,
      // v0.9.6 (Mudança 1): hora do servidor para o cliente ajustar os
      // contadores (mesma fonte da verdade dos timestamps de fim).
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    // ação falhou → libera o lock de dedup para permitir retry limpo
    const key = dedupRef.current;
    if (key) {
      await db.requestDedup
        .deleteMany({ where: { playerId: key.playerId, requestId: key.requestId, result: null } })
        .catch(() => undefined);
    }
    return toErrorResponse(error);
  }
}

/** GET: mantém compatibilidade de health-check da action (não usado pelo jogo). */
export async function GET() {
  const auth = await getAuth();
  return NextResponse.json({ success: true, authenticated: !!auth });
}
