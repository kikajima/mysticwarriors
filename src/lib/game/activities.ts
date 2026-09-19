import type { Prisma, Player, Activity } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import { ACTIVITY_BLOCKED_ACTIONS, addStat, type StatKey } from './rules';
import { grantRewards, transferZeniPvp } from '@/lib/economy';
import { bumpQuests } from '@/lib/progression';
import { scoreSeasonVictory } from '@/lib/seasons';
import { trackEvent } from '@/lib/analytics';
import { xpToNextLevel } from './content/world';
import { advanceTournament, parseTournament, roundDef, serializeTournament } from './content/tournament';
import type { ActivityView, BattleResult } from './types';

// =====================================================================
// ATIVIDADES COM DURAÇÃO SERVER-SIDE (v0.4)
// ---------------------------------------------------------------------
// Treino e batalha têm duração REAL definida em fonte central
// (ACTIVITY_DURATION). O fluxo é dividido em duas transações curtas
// (nenhuma transação fica aberta durante a animação):
//
//   START (transação 1): valida regras, debita custos, roda a simulação,
//     computa o resultado (sem aplicar) e persiste a atividade com
//     início/término/identidade → o cliente anima pelo tempo restante.
//
//   COMPLETE (transação 2): ao tocar qualquer endpoint (state/action)
//     APÓS o término, a atividade é reivindicada com updateMany condicional
//     (exactly-once) e o resultado é aplicado de verdade.
//
// Garantias:
//  * recompensa NUNCA utilizável antes do término;
//  * sem cobrança duplicada (custos no START, guards atômicos);
//  * falha de rede não reinicia a duração (endsAt fixo no START);
//  * recarregar a página retoma o trecho restante (endsAt persistido);
//  * personagem nunca fica travado: atividade vencida não bloqueia
//    novas ações — só é aplicada no próximo toque;
//  * aplicação idempotente: o claim (completedAt) decide exatamente uma.
// =====================================================================

type Tx = Prisma.TransactionClient;

export interface TrainActivityResult {
  kind: 'train';
  display: { message: string; levelsGained: number };
  apply: { stat: StatKey; gain: number };
}

export interface BattleActivityResult {
  kind: 'battle';
  mode: 'pve' | 'pvp' | 'tournament';
  display: { message: string; levelsGained: number; battle: BattleResult };
  apply: {
    pve?: {
      enemyId: string;
      enemyLevel: number;
      won: boolean;
      xp: number;
      zeni: number;
      zenkai: boolean;
      techniquesUsed: number;
      firstBattle: boolean;
      /** HP final previsto pela simulação (nível não subiu) */
      playerEndHp: number;
      playerMaxHp: number;
      /** v0.9.17 — vitória com Quebra de Limite ativada (Milagre no Limite). */
      miracleWin: boolean;
      /** v0.9.17 — Reposicionamento exitoso vs 2+ escalas (David vs Golias). */
      davidReposition: boolean;
    };
    pvp?: {
      targetId: string;
      targetIsBot: boolean;
      won: boolean;
      xp: number;
      firstBattle: boolean;
      techniquesUsed: number;
      playerEndHp: number;
      playerMaxHp: number;
      zenkai: boolean;
      /** v0.9.17 — vitória com Quebra de Limite ativada (Milagre no Limite). */
      miracleWin: boolean;
      /** v0.9.17 — Reposicionamento exitoso vs 2+ escalas (David vs Golias). */
      davidReposition: boolean;
    };
    /** v0.9.18 — luta do Torneio de Artes Marciais (chave de 8). */
    tournament?: {
      round: number;
      won: boolean;
      xp: number;
      zeni: number;
      crystals: number;
      /** vitória na GRANDE FINAL — soma título de campeão */
      title: boolean;
      techniquesUsed: number;
      firstBattle: boolean;
      playerEndHp: number;
      playerMaxHp: number;
      /** v0.9.17 — narrativas (Milagre/David) também valem no ringue */
      miracleWin: boolean;
      davidReposition: boolean;
    };
  };
}

export type ActivityResultPayload = TrainActivityResult | BattleActivityResult;

export function activityToView(a: Activity): ActivityView {
  const result = JSON.parse(a.result ?? '{}') as ActivityResultPayload;
  return {
    id: a.id,
    kind: a.kind as 'train' | 'battle',
    startedAt: a.startedAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    remainingMs: Math.max(0, a.endsAt.getTime() - Date.now()),
    result: result.display ?? { message: '', levelsGained: 0 },
  };
}

/** Atividade em andamento = não concluída E término no futuro. */
export async function getRunningActivity(playerId: string): Promise<Activity | null> {
  return db.activity.findFirst({
    where: { playerId, completedAt: null, endsAt: { gt: new Date() } },
    orderBy: { endsAt: 'desc' },
  });
}

export async function getRunningActivityTx(tx: Tx, playerId: string): Promise<Activity | null> {
  return tx.activity.findFirst({
    where: { playerId, completedAt: null, endsAt: { gt: new Date() } },
    orderBy: { endsAt: 'desc' },
  });
}

/**
 * Bloqueia ações incompatíveis enquanto uma atividade está em andamento.
 * Decisão ATÔMICA do servidor — o cliente não decide nada.
 */
export async function assertNoRunningActivityTx(tx: Tx, playerId: string, action: string): Promise<void> {
  if (!ACTIVITY_BLOCKED_ACTIONS.has(action)) return;
  const running = await getRunningActivityTx(tx, playerId);
  if (running) {
    const remain = Math.max(1, Math.ceil((running.endsAt.getTime() - Date.now()) / 1000));
    throw new ApiError(
      'ACTIVITY_IN_PROGRESS',
      running.kind === 'train'
        ? `Seu guerreiro ainda está treinando (${remain}s). Aguarde o fim da sessão.`
        : `Seu guerreiro ainda está lutando (${remain}s). Aguarde o desfecho da batalha.`
    );
  }
}

export interface AppliedActivityResult {
  activityId: string;
  kind: 'train' | 'battle';
  message: string;
  levelsGained: number;
  battle?: BattleResult;
}

/**
 * Aplica TODAS as atividades vencidas do jogador (endsAt <= now,
 * completedAt null). Cada aplicação é reivindicada com updateMany
 * condicional em completedAt — exatamente UMA execução, mesmo com
 * requisições simultâneas.
 *
 * Retorna os resultados aplicados para exibição (pendingResults).
 */
export async function resolveDueActivities(tx: Tx, player: Player): Promise<AppliedActivityResult[]> {
  const due = await tx.activity.findMany({
    where: { playerId: player.id, completedAt: null, endsAt: { lte: new Date() } },
    orderBy: { endsAt: 'asc' },
    take: 5,
  });
  const applied: AppliedActivityResult[] = [];

  for (const activity of due) {
    // ===== CLAIM (exactly-once) =====
    const claim = await tx.activity.updateMany({
      where: { id: activity.id, completedAt: null },
      data: { completedAt: new Date() },
    });
    if (claim.count === 0) continue; // outro processo aplicou primeiro

    const payload = JSON.parse(activity.result ?? '{}') as ActivityResultPayload;
    if (activity.kind === 'train' && payload.kind === 'train') {
      const out = await applyTrainResult(tx, player, payload);
      applied.push({ activityId: activity.id, kind: 'train', ...out });
    } else if (activity.kind === 'battle' && payload.kind === 'battle') {
      const out = await applyBattleResult(tx, player, payload);
      applied.push({ activityId: activity.id, kind: 'battle', ...out });
    }
    // kinds desconhecidos (futuro): apenas marcam concluídos
  }

  // higiene: limpa atividades concluídas há mais de 7 dias (throttled pelo take)
  if (due.length > 0) {
    await tx.activity
      .deleteMany({ where: { playerId: player.id, completedAt: { lt: new Date(Date.now() - 7 * 86400_000) } } })
      .catch(() => undefined);
  }

  return applied;
}

// ===== APLICAÇÃO: TREINO =====

/**
 * Aplica o ganho de um treino (atributo + STAT_CAP + contadores).
 * v0.9: além das atividades vencidas, é usada pelo TREINO INSTANTÂNEO —
 * o ganho é concedido na mesma transação do clique, sem espera.
 */
export async function applyTrainResult(
  tx: Tx,
  player: Player,
  payload: TrainActivityResult,
  options: { playerIsFresh?: boolean } = {}
): Promise<{ message: string; levelsGained: number }> {
  const { stat, gain } = payload.apply;
  // Treino instantâneo acabou de carregar o Player dentro da MESMA
  // transação e fila por personagem: reler a linha aqui só acrescentava um
  // round-trip ao PostgreSQL. Atividades legadas continuam usando refresh.
  const fresh = options.playerIsFresh
    ? player
    : await tx.player.findUniqueOrThrow({ where: { id: player.id } });
  addStat(fresh, stat, gain);
  await tx.player.update({
    where: { id: fresh.id },
    data: { [stat]: fresh[stat], trainingsDone: { increment: 1 } },
  });
  await bumpQuests(tx, fresh.id, 'training_done', 1);
  await trackEvent('training_done', { playerId: fresh.id }, tx);
  return {
    message: payload.display.message,
    levelsGained: 0,
  };
}

// ===== APLICAÇÃO: BATALHA (PvE e PvP) =====

async function applyBattleResult(
  tx: Tx,
  player: Player,
  payload: BattleActivityResult
): Promise<{ message: string; levelsGained: number; battle?: BattleResult }> {
  const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });

  if (payload.apply.pve) {
    return applyPveResult(tx, fresh, payload);
  }
  if (payload.apply.pvp) {
    return applyPvpResult(tx, fresh, payload);
  }
  if (payload.apply.tournament) {
    return applyTournamentResult(tx, fresh, payload);
  }
  return { message: payload.display.message, levelsGained: 0 };
}

async function applyPveResult(
  tx: Tx,
  player: Player,
  payload: BattleActivityResult
): Promise<{ message: string; levelsGained: number; battle?: BattleResult }> {
  const data = payload.apply.pve!;
  const reward = { xp: data.xp, zeni: data.won ? data.zeni : 0 };

  // XP + Zeni (autoritativo — levelsGained REAL calculado aqui)
  const grant = await grantRewards(tx, player, reward, {
    type: 'reward',
    source: 'pve',
    accountId: player.accountId,
    metadata: { enemyId: data.enemyId },
  });

  // ORDEM CORRETA (v0.4): level-up restaura a vida DEPOIS da simulação —
  // a recuperação anunciada é a que fica gravada, em vitórias E derrotas.
  // v0.9.21 (correção 1): hospital (1 de vida) SÓ no nocaute real
  // (playerEndHp === 0). Derrota por DECISÃO DOS JURADOS (limite de
  // rodadas) mantém a vida final exibida no log — barra e mensagem
  // deixam de se contradizer (o caso 199/280 "no hospital com 1").
  let hpAfter = data.playerEndHp;
  if (grant.levelsGained > 0) {
    hpAfter = 80 + player.level * 15 + player.defense * 5; // nível NOVO = vida cheia
  } else if (!data.won && data.playerEndHp <= 0) {
    hpAfter = 1; // nocaute → hospital com 1 de vida
  }
  hpAfter = Math.max(1, hpAfter);

  await tx.player.update({
    where: { id: player.id },
    data: {
      hp: hpAfter,
      battlesWon: data.won ? { increment: 1 } : undefined,
      battlesLost: data.won ? undefined : { increment: 1 },
      // v0.9.17 — conquistas narrativas: Milagre exige a VITÓRIA com a
      // Quebra ativada; David conta o MOMENTO (mesmo em derrota)
      miracleWins: data.won && data.miracleWin ? { increment: 1 } : undefined,
      davidWins: data.davidReposition ? { increment: 1 } : undefined,
    },
  });

  // Zenkai (já decidido no START pelos critérios de risco)
  if (data.zenkai) {
    const fresh2 = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
    addStat(fresh2, 'strength', 1);
    await tx.player.update({
      where: { id: player.id },
      data: {
        strength: fresh2.strength,
        lastZenkaiAt: new Date(),
        lastZenkaiOpponentId: `enemy:${data.enemyId}`,
      },
    });
    await trackEvent('zenkai_granted', { playerId: player.id, accountId: player.accountId, metadata: { context: 'pve' } }, tx);
  }

  if (data.won) {
    await scoreSeasonVictory(tx, player);
    await bumpQuests(tx, player.id, 'battle_win', 1);
  }
  if (data.techniquesUsed > 0) {
    await bumpQuests(tx, player.id, 'technique_used', data.techniquesUsed);
  }
  if (data.firstBattle) await trackEvent('first_battle', { playerId: player.id, accountId: player.accountId }, tx);

  const finalBattle: BattleResult = {
    ...payload.display.battle,
    xpGain: grant.xpGranted,
    zeniGain: data.won ? data.zeni : 0,
    zenkaiGranted: data.zenkai,
  };

  const message = data.won
    ? `Vitória contra ${payload.display.battle.enemyName}! +${data.zeni.toLocaleString('pt-BR')} Zeni, +${data.xp} XP.`
    : data.playerEndHp <= 0
      ? `Derrota para ${payload.display.battle.enemyName}... Você acordou no hospital com 1 de vida.${data.zenkai ? ' Zenkai ativado: +1 Força!' : ''}`
      : `Derrota para ${payload.display.battle.enemyName} por decisão dos jurados... Você deixou a arena com ${data.playerEndHp} de vida e leva +${data.xp} XP de aprendizado.`;

  return { message, levelsGained: grant.levelsGained, battle: finalBattle };
}

async function applyPvpResult(
  tx: Tx,
  player: Player,
  payload: BattleActivityResult
): Promise<{ message: string; levelsGained: number; battle?: BattleResult }> {
  const data = payload.apply.pvp!;
  const target = await tx.player.findUnique({ where: { id: data.targetId } });

  let zeniStolen = 0;
  let zeniLost = 0;
  let levelsGained = 0;

  // reabastece bot drenado (injeção de moeda REGISTRADA no ledger)
  if (target && data.targetIsBot) {
    const minZeni = 150 * target.level;
    if (target.zeni < minZeni) {
      const inject = minZeni - target.zeni;
      await tx.player.update({
        where: { id: target.id },
        data: { zeni: minZeni, hp: 80 + target.level * 15 + target.defense * 5 },
      });
      await tx.walletTransaction.create({
        data: {
          playerId: target.id,
          accountId: target.accountId,
          currency: 'zeni',
          amount: inject,
          type: 'grant',
          source: 'bot_topup',
          balanceBefore: target.zeni,
          balanceAfter: minZeni,
        },
      });
      target.zeni = minZeni;
    }
  }

  if (data.won) {
    // roubo atômico com ledger de DUAS pontas (transferência entre jogadores)
    if (target) {
      const stealAttempt = Math.min(target.zeni, Math.max(100, Math.floor(target.zeni * 0.08)));
      const transfer = await transferZeniPvp(tx, {
        fromPlayerId: target.id,
        fromAccountId: target.accountId,
        toPlayerId: player.id,
        toAccountId: player.accountId,
        amount: stealAttempt,
        context: 'pvp_steal',
        metadata: { targetId: target.id },
      });
      zeniStolen = transfer.amount;
    }
    const grant = await grantRewards(tx, player, { xp: data.xp }, { type: 'reward', source: 'pvp', accountId: player.accountId });
    levelsGained = grant.levelsGained;

    let hpAfter = data.playerEndHp;
    if (levelsGained > 0) {
      hpAfter = 80 + player.level * 15 + player.defense * 5;
    }
    await tx.player.update({
      where: { id: player.id },
      data: {
        hp: Math.max(1, hpAfter),
        battlesWon: { increment: 1 },
        pvpWins: { increment: 1 },
        // v0.9.17 — Milagre no Limite também conta em duelo PvP
        miracleWins: data.miracleWin ? { increment: 1 } : undefined,
        davidWins: data.davidReposition ? { increment: 1 } : undefined,
      },
    });
    if (target) {
      await tx.player.update({ where: { id: target.id }, data: { battlesLost: { increment: 1 } } });
    }
    await scoreSeasonVictory(tx, player);
    await bumpQuests(tx, player.id, 'battle_win', 1);
    await trackEvent('pvp_win', { playerId: player.id, accountId: player.accountId, metadata: { targetId: data.targetId } }, tx);
  } else {
    // derrota: 5% do próprio Zeni transferido ao vencedor
    const lossAttempt = Math.min(player.zeni, Math.floor(player.zeni * 0.05));
    if (target && lossAttempt > 0) {
      const transfer = await transferZeniPvp(tx, {
        fromPlayerId: player.id,
        fromAccountId: player.accountId,
        toPlayerId: target.id,
        toAccountId: target.accountId,
        amount: lossAttempt,
        context: 'pvp_loss',
        metadata: { targetId: target.id },
      });
      zeniLost = transfer.amount;
    }
    const xpGain = Math.max(5, Math.round(25 * (payload.display.battle.opponentLevel ?? 1) * 0.4));
    const grant = await grantRewards(tx, player, { xp: xpGain }, { type: 'reward', source: 'pvp', accountId: player.accountId });
    levelsGained = grant.levelsGained;

    let hpAfter = 1;
    if (levelsGained > 0) {
      hpAfter = 80 + player.level * 15 + player.defense * 5;
    } else if (data.playerEndHp > 0) {
      // v0.9.21: derrota por decisão (limite de rodadas) NÃO é hospital —
      // o duelista deixa o ringue com a vida exibida no log
      hpAfter = data.playerEndHp;
    }
    await tx.player.update({
      where: { id: player.id },
      data: {
        hp: Math.max(1, hpAfter),
        battlesLost: { increment: 1 },
        // v0.9.17 — David vs Golias: o momento vale mesmo na derrota
        davidWins: data.davidReposition ? { increment: 1 } : undefined,
      },
    });
    if (target) {
      await tx.player.update({ where: { id: target.id }, data: { battlesWon: { increment: 1 } } });
    }
  }

  await trackEvent('pvp_battle', { playerId: player.id, accountId: player.accountId, metadata: { targetId: data.targetId, won: data.won } }, tx);
  await bumpQuests(tx, player.id, 'pvp_battle', 1);
  if (data.techniquesUsed > 0) {
    await bumpQuests(tx, player.id, 'technique_used', data.techniquesUsed);
  }
  if (data.firstBattle) await trackEvent('first_battle', { playerId: player.id, accountId: player.accountId }, tx);

  // Zenkai PvP
  if (data.zenkai) {
    const fresh2 = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
    addStat(fresh2, 'strength', 1);
    await tx.player.update({
      where: { id: player.id },
      data: { strength: fresh2.strength, lastZenkaiAt: new Date(), lastZenkaiOpponentId: `player:${data.targetId}` },
    });
    await trackEvent('zenkai_granted', { playerId: player.id, accountId: player.accountId, metadata: { context: 'pvp' } }, tx);
  }

  const finalBattle: BattleResult = {
    ...payload.display.battle,
    xpGain: data.won ? data.xp : Math.max(5, Math.round(25 * (payload.display.battle.opponentLevel ?? 1) * 0.4)),
    zeniGain: 0,
    zeniStolen,
    zenkaiGranted: data.zenkai,
  };

  const message = data.won
    ? `Você derrotou ${payload.display.battle.enemyName} no PvP e roubou ${zeniStolen.toLocaleString('pt-BR')} Zeni!`
    : `${payload.display.battle.enemyName} te derrotou... ${zeniLost > 0 ? `Você perdeu ${zeniLost.toLocaleString('pt-BR')} Zeni ` : ''}mas ganhou experiência.${data.zenkai ? ' Zenkai ativado: +1 Força!' : ''}`;

  return { message, levelsGained, battle: finalBattle };
}

// ===== v0.9.18 — TORNEIO DE ARTES MARCIAIS: aplicação da luta da chave =====

/**
 * Aplica o desfecho da luta do torneio:
 *  * vitória → premiação da rodada + avanço na chave (ou TÍTULO na final);
 *  * derrota → campanha encerrada (cooldown começa a contar);
 *  * HP final segue a política PvE (level-up restaura; derrota = hospital 1 HP);
 *  * lutas contam como batalhas (battlesWon/Lost) e alimentam quests/métricas.
 * O estado da campanha (Player.tournament) avança AQUI — transição pura
 * de advanceTournament() serializada de volta à coluna.
 */
async function applyTournamentResult(
  tx: Tx,
  player: Player,
  payload: BattleActivityResult
): Promise<{ message: string; levelsGained: number; battle?: BattleResult }> {
  const data = payload.apply.tournament!;
  const now = new Date();

  // premiação: Zeni/cristais só do vencedor; o rejeitado leva METADE do
  // XP da rodada (a luta ensina — coerente com o diálogo de derrota)
  const reward = data.won
    ? { xp: data.xp, zeni: data.zeni, crystals: data.crystals }
    : { xp: data.xp, zeni: 0, crystals: 0 };
  const grant = await grantRewards(tx, player, reward, {
    type: 'reward',
    source: 'tournament',
    accountId: player.accountId,
    metadata: { round: data.round, title: data.title, won: data.won },
  });

  // HP final (mesma ordem do PvE: level-up restaura DEPOIS da simulação)
  // v0.9.21 (correção 1): hospital (1 de vida) SÓ no nocaute — derrota
  // por decisão dos jurados mantém a vida final do log
  let hpAfter = data.playerEndHp;
  if (grant.levelsGained > 0) {
    hpAfter = 80 + player.level * 15 + player.defense * 5;
  } else if (!data.won && data.playerEndHp <= 0) {
    hpAfter = 1;
  }
  hpAfter = Math.max(1, hpAfter);

  // avanço da chave (transição pura + colunas contáveis)
  const state = parseTournament(player.tournament);
  const next = advanceTournament(state, data.round, data.won, now);

  await tx.player.update({
    where: { id: player.id },
    data: {
      hp: hpAfter,
      battlesWon: data.won ? { increment: 1 } : undefined,
      battlesLost: data.won ? undefined : { increment: 1 },
      miracleWins: data.won && data.miracleWin ? { increment: 1 } : undefined,
      davidWins: data.davidReposition ? { increment: 1 } : undefined,
      tournament: serializeTournament(next),
      tournamentRoundWins: data.won ? { increment: 1 } : undefined,
      tournamentTitles: data.title ? { increment: 1 } : undefined,
    },
  });

  if (data.won) {
    await scoreSeasonVictory(tx, player);
    await bumpQuests(tx, player.id, 'battle_win', 1);
    await bumpQuests(tx, player.id, 'tournament_win', 1);
    await trackEvent(
      'tournament_match_won',
      { playerId: player.id, accountId: player.accountId, metadata: { round: data.round, title: data.title } },
      tx
    );
  }
  if (data.techniquesUsed > 0) {
    await bumpQuests(tx, player.id, 'technique_used', data.techniquesUsed);
  }
  if (data.firstBattle) await trackEvent('first_battle', { playerId: player.id, accountId: player.accountId }, tx);
  if (data.title) {
    await trackEvent('tournament_champion', { playerId: player.id, accountId: player.accountId, metadata: { round: 3 } }, tx);
  }

  const finalBattle: BattleResult = {
    ...payload.display.battle,
    xpGain: grant.xpGranted,
    zeniGain: data.won ? data.zeni : 0,
    crystalsGain: data.won ? data.crystals : 0,
  };

  const roundName = roundDef(data.round).name;
  const message = data.title
    ? `🏆 CAMPEÃO! Você venceu a GRANDE FINAL contra ${payload.display.battle.enemyName}! +${data.zeni.toLocaleString('pt-BR')} Zeni, +${data.xp} XP, +${data.crystals} cristais — o cinturão é SEU!`
    : data.won
      ? `Vitória na ${roundName} contra ${payload.display.battle.enemyName}! +${data.zeni.toLocaleString('pt-BR')} Zeni, +${data.xp} XP${data.crystals > 0 ? `, +${data.crystals} cristais` : ''}.`
      : data.playerEndHp <= 0
        ? `Eliminado na ${roundName} por ${payload.display.battle.enemyName}... Você acordou no hospital com 1 de vida (+${data.xp} XP de aprendizado) — o comitê reorganiza a chave para a próxima inscrição.`
        : `Eliminado na ${roundName} por decisão dos jurados contra ${payload.display.battle.enemyName}... Você deixou o ringue com ${data.playerEndHp} de vida (+${data.xp} XP de aprendizado) — o comitê reorganiza a chave para a próxima inscrição.`;

  return { message, levelsGained: grant.levelsGained, battle: finalBattle };
}

// ===== helpers exportados para o executor de ações =====

/** Estimativa exata de level-up para o display inicial (recalculada no apply). */
export function estimateLevelsGained(player: Pick<Player, 'level' | 'xp'>, xpGain: number): number {
  let xp = player.xp + xpGain;
  let level = player.level;
  let levels = 0;
  let need = xpToNextLevel(level);
  while (xp >= need) {
    xp -= need;
    level += 1;
    levels += 1;
    need = xpToNextLevel(level);
  }
  return levels;
}
