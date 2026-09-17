import { db } from '@/lib/db';
import { touchPresence } from '@/lib/game/presence';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { applyRegen, playerToView } from '@/lib/game/engine';
import { resolveDueActivities } from '@/lib/game/activities';
import { maybeBeacon } from '@/lib/game/persistence';
import { LIMITS, rateLimit } from '@/lib/rate-limit';

// =====================================================================
// GET /api/game/state — estado PESSOAL do personagem
// ---------------------------------------------------------------------
// LEVE: não carrega ranking nem guildas (endpoints próprios).
// Polling de 15s segura apenas isto + mini-resumo de quests.
//
// v0.3:
//  * playerId do query string é OPCIONAL — sem ele, usa o personagem
//    ATIVO da conta (account.activePlayerId, definido pela action
//    select_player). O cliente não persiste mais playerId em storage.
//  * Rate limit: 60 req/min por sessão (429 acima disso).
//
// v0.4:
//  * Aplica ATIVIDADES VENCIDAS (treino/batalha) e devolve os
//    resultados como `pendingResults` — exibidos pelo cliente mesmo
//    depois de recarregar a página;
//  * Regeneração calculada em memória; ações persistem recursos na sua
//    própria transação. Consultas não disputam o escritor do SQLite.
// =====================================================================

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    // persistência: beacon dirigido por tráfego (fire-and-forget)
    maybeBeacon(request);

    // RATE LIMIT: 60 req/min por sessão (o polling do cliente é de 15s,
    // logo ~4/min — o teto só é atingido por uso anômalo/abuso).
    const rl = rateLimit(`state:${auth.session.id}`, LIMITS.state.limit, LIMITS.state.windowMs);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', `Muitas consultas rápidas. Tente novamente em ${rl.retryAfterSec}s.`);
    }

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');

    // AUTORIZAÇÃO: personagem precisa pertencer à conta da sessão.
    // Sem playerId no query → resolve o ATIVO da conta (fonte server-side).
    const targetId = playerId ?? auth.account.activePlayerId;
    if (!targetId) {
      // conta sem personagem ativo → cliente deve ir ao CharacterSelect
      return ok({ player: null, totalPlayers: 0, questsReady: 0, pendingResults: [] });
    }
    let player = await requirePlayer(auth, targetId);
    touchPresence(player.id);

    // ===== ATIVIDADES VENCIDAS: aplica e coleta resultados pendentes =====
    // (o primeiro toque após o término concede o resultado — exactly-once)
    let pendingResults: Awaited<ReturnType<typeof resolveDueActivities>> = [];
    let activityApplied = false;
    if (await db.activity.count({ where: { playerId: player.id, completedAt: null, endsAt: { lte: new Date() } } }) > 0) {
      await db
        .$transaction(
          async (tx) => {
            const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
            const applied = await resolveDueActivities(tx, fresh);
            if (applied.length > 0) {
              pendingResults = applied;
              activityApplied = true;
            }
          },
          { timeout: 60_000, maxWait: 30_000 }
        )
        .catch((err) => {
          console.error('[state] falha ao aplicar atividade vencida (não crítico):', err instanceof Error ? err.message : err);
        });
      if (activityApplied) {
        // relê o personagem pós-aplicação (recompensas/vida/atributos novos)
        player = await requirePlayer(auth, targetId);
      }
    }

    // posição no ranking (barata: COUNT condicional, sem carregar todos)
    const level = player.level;
    const battlesWon = player.battlesWon;
    const xp = player.xp;
    const ahead = await db.player.count({
      where: {
        isBot: false,
        OR: [
          { level: { gt: level } },
          { level, battlesWon: { gt: battlesWon } },
          { level, battlesWon, xp: { gt: xp } },
        ],
      },
    });
    const totalPlayers = await db.player.count({ where: { isBot: false } });
    const rankingPosition = ahead + 1;

    // mini-resumo de quests (só contagens — detalhes no endpoint próprio)
    const questRows = await db.questProgress.findMany({
      where: { playerId: player.id, claimed: false },
      select: { progress: true, target: true },
    });
    const questsReady = questRows.filter((q) => q.progress >= q.target).length;

    // view COM a atividade em andamento (se houver) + cosméticos da conta
    const withActivity = await db.player.findUnique({
      where: { id: player.id },
      include: {
        guild: true,
        activities: { where: { completedAt: null, endsAt: { gt: new Date() } }, take: 1 },
      },
    });

    // Usa a leitura mais recente, inclusive se uma batalha ocorreu durante
    // a consulta. O tempo acumulado permanece nos relógios salvos até a ação.
    const currentPlayer = withActivity ?? player;
    applyRegen(currentPlayer);

    return ok({
      player: playerToView(currentPlayer, rankingPosition),
      totalPlayers,
      questsReady,
      guildInvites: await db.guildInvitation.count({ where: { playerId: player.id, expiresAt: { gt: new Date() }, guild: { disbandedAt: null } } }),
      guildMotd: withActivity?.guild?.motd ?? '',
      pendingResults,
      // v0.9.6 (Mudança 1): hora do servidor na resposta — o cliente mede
      // a diferença de relógio e conta os timers por ELA, não pelo
      // relógio do navegador (fim de profissão/treino bate com o servidor).
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// NOTA (v0.3): o antigo POST público que executava topUpBots() foi REMOVIDO.
// Reposição de bots drenados agora acontece DENTRO da ação de PvP
// (transacional, server-side). Manutenção em massa só via rotina
// interna autenticada — nunca exposta em endpoint público.
