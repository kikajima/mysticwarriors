import { extractBearerToken } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { getAuth, requireAuth } from '@/lib/auth';
import { executeGameAction, type ActionResult } from '@/lib/game/actions';
import { playerToView } from '@/lib/game/engine';
import { ensureBalanceVersion } from '@/lib/game/balance';
import { bossAttacksPerWindow } from '@/lib/worldboss';
import { db } from '@/lib/db';
import { dailyPeriod, ensureQuests, weeklyPeriod } from '@/lib/progression';
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
// FILA DE AÇÕES — SQLite global, PostgreSQL por PERSONAGEM
// ---------------------------------------------------------------------
// A fila global nasceu para o SQLite, que é single-writer. Depois da
// migração para PostgreSQL/Supabase ela virou um gargalo: uma ação lenta de
// QUALQUER jogador fazia todos os outros esperarem na mesma fila.
//
// Produção PostgreSQL: serializamos somente ações do MESMO personagem.
// Jogadores diferentes podem executar em paralelo e o próprio PostgreSQL
// resolve a concorrência entre linhas/transações. SQLite de testes mantém a
// fila global original para preservar a proteção contra P1008.
// =====================================================================
const IS_SQLITE = (process.env.DATABASE_URL ?? '').startsWith('file:');
let sqliteActionChain: Promise<unknown> = Promise.resolve();
const playerActionChains = new Map<string, Promise<unknown>>();

async function withActionLock<T>(playerId: string, fn: () => Promise<T>): Promise<T> {
  if (IS_SQLITE) {
    const run = sqliteActionChain.then(fn, fn);
    sqliteActionChain = run.catch(() => undefined);
    return run;
  }

  const previous = playerActionChains.get(playerId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  playerActionChains.set(playerId, tail);
  try {
    return await run;
  } finally {
    if (playerActionChains.get(playerId) === tail) {
      playerActionChains.delete(playerId);
    }
  }
}

function isTransientDatabaseError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (
      error.code === 'P2034' ||
      error.code === 'P2028' ||
      (IS_SQLITE && error.code === 'P1008')
    )
  );
}

// ensureQuests era consultado em TODA ação. Em PostgreSQL remoto, uma
// consulta extra por clique custa uma viagem de rede mesmo quando as quests
// do período já existem. Cacheamos apenas a confirmação do período atual.
const questPeriodsReady = new Set<string>();

async function ensureQuestsForAction(playerId: string): Promise<void> {
  const key = `${playerId}:${dailyPeriod()}:${weeklyPeriod()}`;
  if (questPeriodsReady.has(key)) return;
  await db.$transaction(async (tx) => ensureQuests(tx, playerId), {
    timeout: 60_000,
    maxWait: 30_000,
  });
  questPeriodsReady.add(key);
}

async function executeActionWithRetry(
  auth: Awaited<ReturnType<typeof requireAuth>>,
  playerId: string,
  type: string,
  args: Record<string, unknown>,
  accessToken?: string | null
): Promise<ActionResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await executeGameAction(auth, playerId, type, args, accessToken);
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt === 2) throw error;
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
  // Carreira profissional: apenas turnos fechados de 1/2/4/8 horas.
  hours: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(12)]).optional(),
  enemyId: z.string().optional(),
  targetId: z.string().optional(),
  itemId: z.string().optional(),
  recipeId: z.string().max(100).optional(),
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
  targetName: z.string().max(60).optional(),
  inviteId: z.string().max(100).optional(),
  roleId: z.string().max(100).nullable().optional(),
  roleName: z.string().max(30).optional(),
  rank: z.number().int().optional(),
  permissions: z.array(z.enum(['convidar', 'expulsar', 'promover', 'alterar_descricao', 'mensagem_do_dia'])).max(5).optional(),
  text: z.string().max(500).optional(),
  confirm: z.boolean().optional(),
  leave: z.boolean().optional(),
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
  const requestStartedAt = Date.now();
  let queueWaitMs = 0;
  let actionExecMs = 0;
  // lock de dedup criado para ESTA requisição (limpo se a ação falhar)
  // v-auditoria F4: o lock do dedup vive num wrapper — atribuições dentro
  // da closure do withActionLock precisam ser visíveis ao catch (o fluxo do
  // TS não enxerga mutações de `let` feitas em closures para narrowing)
  const dedupRef: { current: { playerId: string; requestId: string } | null } = { current: null };
  try {
    const auth = await requireAuth();

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

    // v0.9.11 — rate limit ESPECÍFICO do Ameaça Universal, DERIVADO da fonte
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

    if (requestId && Math.random() < 0.125) {
      // Higiene fora do caminho crítico. A linha expirada nunca altera a
      // semântica do request atual; esperar por este DELETE adicionava uma
      // viagem ao PostgreSQL em ~1/8 dos cliques.
      void db.requestDedup.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - DEDUP_TTL_MS) } },
      }).catch(() => undefined);
    }

    {
      // O INSERT único do RequestDedup é também a PRIMEIRA consulta de
      // deduplicação. Antes fazíamos findUnique + create em todo request
      // novo; como UUID novo é o caso esmagadoramente comum, essa leitura
      // apenas acrescentava uma viagem de rede. Replay cai no P2002 e lê o
      // resultado já gravado, preservando a mesma idempotência.
      const waitingSince = Date.now();
      result = await withActionLock(playerId, async () => {
        queueWaitMs = Date.now() - waitingSince;
        const execStartedAt = Date.now();
        try {
          // Garante quests uma vez por período ANTES das ações reais.
          // sync_activity apenas conclui uma luta já iniciada; o início da
          // luta já garantiu as quests e não deve pagar esse round-trip.
          if (type !== 'sync_activity') {
            await ensureQuestsForAction(playerId).catch(() => undefined);
          }

        if (requestId) {
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
              throw new ApiError('CONFLICT', 'Requisição duplicada ainda em processamento — aguarde um instante.');
            }
            throw e;
          }
        }
        const r = await executeActionWithRetry(auth, playerId, type, { ...args, requestId }, extractBearerToken(request));
        return r;
        } finally {
          actionExecMs = Date.now() - execStartedAt;
        }
      });
    }
    if (!result) throw new ApiError('INTERNAL', 'Resultado da ação indisponível.');

    // O boot já garante a versão. Mantemos a defesa em profundidade fora do
    // caminho crítico: não há motivo para o clique esperar por ela.
    void ensureBalanceVersion().catch(() => undefined);

    // Cache do resultado de idempotência e leitura fresca são independentes
    // depois do COMMIT da ação: executá-los em paralelo economiza mais uma
    // ida/volta serial ao banco. A linha RequestDedup já existe, portanto um
    // retry que chegue neste intervalo recebe CONFLICT, nunca duplica a ação.
    const dedupKey = dedupRef.current;
    dedupRef.current = null; // ação já commitou: nunca apagar este lock no catch

    const cacheResultPromise = dedupKey
      ? db.requestDedup
          .update({
            where: { playerId_requestId: dedupKey },
            data: { result: JSON.stringify(result) },
          })
          .catch(() => undefined)
      : Promise.resolve(undefined);

    const loadFresh = async () => {
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
      return fresh;
    };

    const [fresh] = await Promise.all([loadFresh(), cacheResultPromise]);
    if (!fresh) throw new ApiError('NOT_FOUND', 'Guerreiro não encontrado (sincronize pelo painel).');

    const totalMs = Date.now() - requestStartedAt;
    if (totalMs >= 1000) {
      console.warn(
        `[perf][action] type=${type} player=${playerId} total=${totalMs}ms queue=${queueWaitMs}ms exec=${actionExecMs}ms db=${IS_SQLITE ? 'sqlite' : 'postgres'}`
      );
    }

    const response = ok({
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
    response.headers.set(
      'Server-Timing',
      `action;dur=${totalMs}, queue;dur=${queueWaitMs}, execute;dur=${actionExecMs}`
    );
    return response;
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
