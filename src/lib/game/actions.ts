import { fetchOfflineOpponent, restoreOfflineOpponent, type OfflineOpponent } from '@/lib/supabase/offline-pvp';
import type { Player, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import { requirePlayer, type AuthContext } from '@/lib/auth';
import {
  addStat,
  assertPlayerAvailableForAction,
  dayKey,
  raceEconomy,
  shouldGrantZenkai,
  statAtCap,
  STAT_CAP,
  statName,
  trainingCost,
  ZENKAI,
} from './rules';
import {
  BATTLE_ENERGY_COST,
  ENEMIES,
  HEAL_COST_PER_HP,
  PROFESSIONS,
  PROFESSION_RANKS,
  PROFESSION_MAX_RANK,
  SELL_PRICE_RATIO,
  SHOP_MAX_QUANTITY,
  SHOP_MAX_STACK,
  getProfession,
  professionRankTitle,
  PVP_LEVEL_RANGE,
  TRAIN_ENERGY_COST,
  getItem,
  trainingGain,
} from './content/world';
import { getTechnique, slotsForCategory, STRATEGIES } from './content/techniques';
import { getTransformation } from './content/transformations';
import {
  applyEquipmentBuy,
  applyEquipmentSell,
  applyRegen,
  battleDurationMs,
  battleRng,
  buildNpcCombatant,
  buildPlayerCombatant,
  canEquipInSlot,
  computeDerived,
  healCost,
  itemCount,
  npcRewards,
  parseItems,
  parseLoadout,
  parseProfessions,
  parseTechniques,
  parseTransformationsOwned,
  professionRewards,
  pvpRewards,
  serializeProfessions,
  simulateBattle,
  updateJsonState,
} from './engine';
import {
  applyTrainResult,
  assertNoRunningActivityTx,
  activityToView,
  estimateLevelsGained,
  resolveDueActivities,
  type ActivityResultPayload,
  type AppliedActivityResult,
  type BattleActivityResult,
  type TrainActivityResult,
} from './activities';
import { addCurrency, grantRewards, spendCurrency } from '@/lib/economy';
import { bumpQuests, claimAchievement, claimQuest } from '@/lib/progression';
import { attackWorldBoss } from '@/lib/worldboss';
import { scoreSeasonVictory } from '@/lib/seasons';
import { trackEvent } from '@/lib/analytics';
import type { ActivityView, BattleResult, Loadout, ShopItem } from './types';

// =====================================================================
// EXECUTOR DE AÇÕES DO JOGO (100% server-side)
// ---------------------------------------------------------------------
// * Toda ação roda dentro de UMA transação ($transaction);
// * Autorização: sessão → conta → player.accountId (requirePlayer);
// * Economia: apenas via lib/economy (atômica + ledger);
// * Atributos: apenas via addStat (respeita STAT_CAP);
// * O frontend envia apenas a INTENÇÃO — dano, preços, recompensas,
//   XP e resultados são SEMPRE calculados aqui.
// =====================================================================

export interface ActionResult {
  message: string;
  levelsGained: number;
  battle?: BattleResult;
  missionResult?: { zeniGain: number; xpGain: number; foundDragonBall: boolean };
  bossAttack?: { damage: number; xpGain: number; killed: boolean; cooldownSec: number };
  /** atividade iniciada (treino/batalha) — o resultado vem após a duração */
  activity?: ActivityView;
  /** resultados de atividades vencidas aplicadas nesta requisição */
  appliedResults?: AppliedActivityResult[];
}

export async function executeGameAction(
  auth: AuthContext,
  playerId: string,
  type: string,
  args: Record<string, unknown>,
  accessToken?: string | null
): Promise<ActionResult> {
  let offline: OfflineOpponent | undefined;
  let targetName = '';
  if (type === 'attack_player' && String(args.targetId ?? '').startsWith('cloud:')) {
    await requirePlayer(auth, playerId);
    try { targetName = decodeURIComponent(String(args.targetId).slice(6)); }
    catch { throw new ApiError('VALIDATION_ERROR', 'Adversário inválido.'); }
    const local = await db.player.findUnique({ where: { name: targetName } });
    if (!local) offline = await fetchOfflineOpponent(targetName, accessToken);
  }
  return db.$transaction(
    async (tx) => {
    // ===== AUTORIZAÇÃO CENTRAL =====
    const player = await requirePlayer(auth, playerId, tx);

    // ===== ATIVIDADES VENCIDAS: aplicar ANTES de qualquer coisa =====
    // (resultado pendente é concedido no primeiro toque após o término)
    const appliedResults = await resolveDueActivities(tx, player);

    // ===== BLOQUEIO CENTRAL: personagem em missão ativa =====
    // O frontend só DESABILITA botões — quem decide é o servidor.
    // v0.16 — MATRIZ DEFINITIVA (3ª ordem): durante trabalho ativo SÓ
    // treino, batalha PvE e torneio são negados (MISSION_BLOCKED_ACTIONS).
    // Tudo mais passa: loja, guilda, hospital, coletas, PvP, chefe
    // mundial, equipamento, perfil, Shenron, cosméticos, talentos…
    assertPlayerAvailableForAction(player, type);

    // ===== BLOQUEIO CENTRAL: atividade em andamento (luta com duração) =====
    // Uma atividade POR VEZ — MAS nenhuma ação claim_* é bloqueada aqui:
    // coleta de recompensa NUNCA espera ocupação (regra da 3ª ordem).
    await assertNoRunningActivityTx(tx, player.id, type);

    applyRegen(player); // regen em memória; persistido no update final
    await tx.player.update({
      where: { id: player.id },
      data: { hp: player.hp, energy: player.energy, lastRegen: player.lastRegen, lastRegenHp: player.lastRegenHp },
    });

    let result: ActionResult;
    switch (type) {
      case 'train':
        result = await actionStartTrain(tx, player, String(args.stat ?? ''));
        break;
      case 'mission':
        result = await actionStartProfession(tx, player, String(args.missionId ?? args.professionId ?? ''));
        break;
      case 'claim_mission':
        result = await actionClaimProfession(tx, player);
        break;
      case 'cancel_mission':
        result = await actionCancelProfession(tx, player);
        break;
      case 'battle':
        result = await actionStartBattle(tx, player, String(args.enemyId ?? ''));
        break;
      // v0.9.18 — Torneio de Artes Marciais (chave de 8)
      case 'tournament_fight':
        result = await actionStartTournamentFight(tx, player);
        break;
      case 'attack_player':
        if (targetName) {
          const target = await tx.player.findUnique({ where: { name: targetName } })
            ?? (offline ? await restoreOfflineOpponent(tx, offline, targetName) : null);
          if (!target) throw new ApiError('NOT_FOUND', 'Alvo não encontrado.');
          result = await actionStartPvp(tx, player, target.id);
        } else {
          result = await actionStartPvp(tx, player, String(args.targetId ?? ''));
        }
        break;
      case 'buy':
        result = await actionBuy(tx, player, String(args.itemId ?? ''), quantityArg(args));
        break;
      case 'sell':
        result = await actionSell(tx, player, String(args.itemId ?? ''), quantityArg(args));
        break;
      case 'use_item':
        result = await actionUseItem(tx, player, String(args.itemId ?? ''));
        break;
      case 'equip':
        result = await actionEquip(tx, player, String(args.itemId ?? ''));
        break;
      case 'unequip':
        result = await actionUnequip(tx, player, String(args.slot ?? ''));
        break;
      case 'heal':
        result = await actionHeal(tx, player);
        break;
      case 'wish':
        result = await actionWish(tx, player, String(args.wishType ?? 'riqueza'));
        break;
      case 'learn_technique':
        result = await actionLearnTechnique(tx, player, String(args.techniqueId ?? ''));
        break;
      case 'equip_technique':
        result = await actionEquipTechnique(tx, player, args.slot as string, args.techniqueId as string | null);
        break;
      case 'set_strategy':
        result = await actionSetStrategy(tx, player, String(args.strategy ?? 'balanced'));
        break;
      case 'unlock_transformation':
        result = await actionUnlockTransformation(tx, player, String(args.transformationId ?? ''));
        break;
      case 'activate_transformation':
        result = await actionActivateTransformation(tx, player, (args.transformationId as string | null) ?? null);
        break;
      case 'create_guild':
        result = await actionCreateGuild(tx, player, args.guildName as string);
        break;
      case 'join_guild':
        result = await actionJoinGuild(tx, player, String(args.targetId ?? ''));
        break;
      case 'leave_guild':
        result = await actionLeaveGuild(tx, player);
        break;
      case 'donate_guild':
        result = await actionDonateGuild(tx, player, Number(args.amount ?? 0));
        break;
      case 'claim_quest':
        result = await actionClaimQuest(tx, player, String(args.questId ?? ''));
        break;
      case 'claim_achievement':
        result = await actionClaimAchievement(tx, player, String(args.achievementId ?? ''));
        break;
      case 'buy_cosmetic':
        result = await actionBuyCosmetic(auth, tx, player, String(args.cosmeticId ?? ''));
        break;
      case 'buy_talent':
        result = await actionBuyTalent(auth, tx, player, String(args.talentId ?? ''));
        break;
      case 'equip_cosmetic':
        result = await actionEquipCosmetic(auth, tx, player, String(args.cosmeticId ?? ''));
        break;
      case 'unequip_cosmetic':
        result = await actionUnequipCosmetic(tx, player, String(args.cosmeticId ?? ''));
        break;
      case 'world_boss_attack':
        result = await actionWorldBoss(tx, player);
        break;
      case 'select_player':
        result = await actionSelectPlayer(tx, auth, player);
        break;
      default:
        throw new ApiError('VALIDATION_ERROR', 'Ação desconhecida.');
    }
    if (appliedResults.length > 0) result.appliedResults = appliedResults;
    return result;
    },
    // transações de jogo podem envolver combate + recompensas + quests:
    // timeout generoso (padrão do Prisma é 5s, curto para dev com compile)
    { timeout: 20_000, maxWait: 5_000 }
  );
}

type Tx = Prisma.TransactionClient;

// ===== TREINO (v0.9 — aplicado IMEDIATAMENTE ao clicar) =====

/**
 * TREINO INSTANTÂNEO (v0.9): valida, DEBITA custos (atômico) e aplica o
 * ganho de atributo NA HORA — sem atividade temporizada e sem animação
 * longa. O cliente apenas faz uma micro-animação (~300ms) no botão "+".
 * Energia e Zeni continuam custando normalmente.
 */
async function actionStartTrain(tx: Tx, player: Player, stat: string): Promise<ActionResult> {
  if (!['strength', 'defense', 'speed', 'ki'].includes(stat)) {
    throw new ApiError('VALIDATION_ERROR', 'Atributo inválido.');
  }
  const statKey = stat as 'strength' | 'defense' | 'speed' | 'ki';

  if (statAtCap(player, statKey)) {
    throw new ApiError('STAT_CAP_REACHED', `${statName(statKey)} já está no máximo (${STAT_CAP}).`);
  }

  const cost = trainingCost(player[statKey], player.race);
  if (player.energy < TRAIN_ENERGY_COST) {
    throw new ApiError('INSUFFICIENT_ENERGY', 'Energia insuficiente! Descanse um pouco (a energia regenera com o tempo).');
  }

  // gasto atômico de Zeni (limite garantido) + energia condicional
  await spendCurrency(tx, player.id, 'zeni', cost, { type: 'spend', source: 'training', accountId: player.accountId, metadata: { stat } });
  const energyRes = await tx.player.updateMany({
    where: { id: player.id, energy: { gte: TRAIN_ENERGY_COST } },
    data: { energy: { decrement: TRAIN_ENERGY_COST } },
  });
  if (energyRes.count === 0) throw new ApiError('INSUFFICIENT_ENERGY', 'Energia insuficiente!');

  // ganho com bônus de equipamento de treino + limite central
  const items = parseItems(player.items);
  const gain = trainingGain(items.owned, statKey);
  const target = Math.min(STAT_CAP, player[statKey] + gain);

  const payload: TrainActivityResult = {
    kind: 'train',
    display: {
      message:
        gain > 1
          ? `Treino pesado concluído! ${statName(statKey)} +${gain} (bônus de equipamento) → ${target}.`
          : `Treino concluído! ${statName(statKey)} aumentou para ${target}.`,
      levelsGained: 0,
    },
    apply: { stat: statKey, gain },
  };

  // v0.9: aplica AGORA (mesma rotina usada pelas atividades vencidas —
  // addStat com STAT_CAP, trainingsDone, quests e analytics)
  const applied = await applyTrainResult(tx, player, payload);

  await bumpQuests(tx, player.id, 'energy_spent', TRAIN_ENERGY_COST);
  if (player.trainingsDone === 0) await trackEvent('first_training', { playerId: player.id, accountId: player.accountId }, tx);

  return {
    message: `${applied.message} (-${cost.toLocaleString('pt-BR')} Zeni, -${TRAIN_ENERGY_COST} energia)`,
    levelsGained: 0,
  };
}

// ===== PROFISSÕES (antigas missões temporizadas — v0.6) =====

const PROFESSION_FLAVOR = [
  'Turno encerrado sem sustos!',
  'Trabalho duro, pagamento merecido.',
  'Seu chefe elogia a dedicação!',
  'Você volta cansado, porém mais rico.',
  'Mais um dia honesto de trabalho.',
];

async function actionStartProfession(tx: Tx, player: Player, professionId: string): Promise<ActionResult> {
  const def = getProfession(professionId);
  if (!def) throw new ApiError('VALIDATION_ERROR', 'Profissão inválida.');

  if (player.missionId) {
    throw new ApiError('MISSION_IN_PROGRESS', 'Você já está em um trabalho! Conclua-o antes de começar outro.');
  }

  // v0.9 — PROFISSÕES NÃO CONSOMEM MAIS ENERGIA: apenas o tempo de
  // duração do turno permanece (treino continua custando energia).
  const startedRes = await tx.player.updateMany({
    where: { id: player.id, missionId: null },
    data: { missionId: def.id, missionEndsAt: new Date(Date.now() + def.durationMin * 60 * 1000) },
  });
  if (startedRes.count === 0) {
    throw new ApiError('MISSION_IN_PROGRESS', 'Você já está em um trabalho! Conclua-o antes de começar outro.');
  }
  player.missionId = def.id;

  const rank = parseProfessions(player.professions)[def.id]?.rank ?? 1;
  const rankTitle = professionRankTitle(def, rank);
  return {
    message: `Trabalho iniciado: ${def.name} (${rankTitle}). Volte em ${def.durationMin / 60}h para receber o pagamento!`,
    levelsGained: 0,
  };
}

async function actionClaimProfession(tx: Tx, player: Player): Promise<ActionResult> {
  if (!player.missionId || !player.missionEndsAt) {
    throw new ApiError('MISSION_NONE', 'Você não tem trabalho em andamento.');
  }
  const def = getProfession(player.missionId);
  if (!def) {
    await tx.player.update({ where: { id: player.id }, data: { missionId: null, missionEndsAt: null } });
    throw new ApiError('VALIDATION_ERROR', 'Profissão inválida — trabalho cancelado.');
  }
  const now = Date.now();
  if (now < player.missionEndsAt.getTime()) {
    const restante = Math.ceil((player.missionEndsAt.getTime() - now) / 60000);
    throw new ApiError('MISSION_NOT_READY', `O trabalho ainda não terminou! Faltam cerca de ${restante} ${restante === 1 ? 'minuto' : 'minutos'}.`);
  }

  // claim atômico: apenas uma requisição consegue limpar o trabalho
  const claimRes = await tx.player.updateMany({
    where: { id: player.id, missionId: player.missionId, missionEndsAt: player.missionEndsAt },
    data: { missionId: null, missionEndsAt: null, missionsDone: { increment: 1 } },
  });
  if (claimRes.count === 0) {
    throw new ApiError('MISSION_NOT_READY', 'O pagamento deste trabalho já foi coletado.');
  }

  // ===== progresso e recompensas da PROFISSÃO (rank atual) =====
  const progress = parseProfessions(player.professions);
  const cur = progress[def.id] ?? { rank: 1, completions: 0 };
  const rewards = professionRewards(cur.rank, player.level, player.race);

  const { levelsGained } = await grantRewards(tx, player, { zeni: rewards.zeni, xp: rewards.xp }, {
    type: 'reward',
    source: 'mission',
    accountId: player.accountId,
    metadata: { professionId: def.id, rank: cur.rank },
  });

  // esfera do dragão (incremento condicional — nunca passa de 7)
  let foundBall = false;
  if (rewards.foundDragonBall) {
    const ballRes = await tx.player.updateMany({
      where: { id: player.id, dragonBalls: { lt: 7 } },
      data: { dragonBalls: { increment: 1 } },
    });
    foundBall = ballRes.count > 0;
  }

  // histórico de trabalhos concluídos (requisito de transformações)
  const completed = parseMissionsCompleted(player.missionsCompleted);
  if (!completed.includes(def.id)) {
    completed.push(def.id);
    await tx.player.update({ where: { id: player.id }, data: { missionsCompleted: JSON.stringify(completed) } });
  }

  // ===== PROMOÇÃO: conclusões suficientes no rank atual =====
  let promoted = false;
  let promotionBonusZeni = 0;
  let newRankTitle = professionRankTitle(def, cur.rank);
  const tier = PROFESSION_RANKS[Math.min(PROFESSION_MAX_RANK, cur.rank) - 1];
  const completionsAfter = cur.completions + 1;
  if (cur.rank < PROFESSION_MAX_RANK && completionsAfter >= tier.completionsToPromote) {
    promoted = true;
    cur.rank += 1;
    cur.completions = 0;
    newRankTitle = professionRankTitle(def, cur.rank);
    promotionBonusZeni = PROFESSION_RANKS[cur.rank - 1].promotionBonus;
    // bônus único de promoção (1k / 3k / 9k / 30k) — com ledger próprio
    await grantRewards(tx, player, { zeni: promotionBonusZeni }, {
      type: 'reward',
      source: 'mission',
      accountId: player.accountId,
      metadata: { professionId: def.id, promotionTo: cur.rank, bonus: promotionBonusZeni },
    });
  } else {
    cur.completions = completionsAfter;
  }
  progress[def.id] = cur;
  await tx.player.update({ where: { id: player.id }, data: { professions: serializeProfessions(progress) } });
  player.professions = serializeProfessions(progress);

  await bumpQuests(tx, player.id, 'mission_completed', 1);
  if (player.missionsDone === 0) await trackEvent('first_mission', { playerId: player.id, accountId: player.accountId }, tx);

  player.missionId = null;
  player.missionEndsAt = null;
  player.missionsDone += 1;

  const flavorRng = battleRng();
  const flavor = PROFESSION_FLAVOR[Math.floor(flavorRng() * PROFESSION_FLAVOR.length)];
  let message = `${flavor} +${rewards.zeni.toLocaleString('pt-BR')} Zeni, +${rewards.xp} XP.`;
  if (promoted) {
    message += ` ⏫ PROMOVIDO a ${newRankTitle}! Bônus de promoção: +${promotionBonusZeni.toLocaleString('pt-BR')} Zeni.`;
  }
  if (foundBall) {
    player.dragonBalls = Math.min(7, player.dragonBalls + 1);
    message += ` Você encontrou uma Esfera do Dragão! (${player.dragonBalls}/7)`;
  }

  return {
    message,
    levelsGained,
    missionResult: { zeniGain: rewards.zeni + promotionBonusZeni, xpGain: rewards.xp, foundDragonBall: foundBall },
  };
}

function parseMissionsCompleted(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m === 'string') : [];
  } catch {
    return [];
  }
}

// ===== CANCELAR PROFISSÃO (v0.9.6 — Mudança 2) =====

/**
 * Interrompe o trabalho EM ANDAMENTO (timer ainda correndo):
 *  * nenhuma recompensa é concedida — nem parcial (sem Zeni, sem XP,
 *    sem Esfera, sem progresso de rank/conclusões, sem missionsDone);
 *  * a profissão fica IMEDIATAMENTE disponível para começar de novo;
 *  * energia não é afetada (profissões nunca gastaram energia);
 *  * cancelamento atômico (updateMany condicional) — duas requisições
 *    concorrentes não geram efeito duplo; e o claim simultâneo de um
 *    turno já vencido continua sendo a única forma de receber pagamento.
 */
async function actionCancelProfession(tx: Tx, player: Player): Promise<ActionResult> {
  if (!player.missionId || !player.missionEndsAt) {
    throw new ApiError('MISSION_NONE', 'Você não tem trabalho em andamento.');
  }
  const def = getProfession(player.missionId);
  if (!def) {
    // estado órfão (profissão removida do catálogo) — limpa e segue
    await tx.player.update({ where: { id: player.id }, data: { missionId: null, missionEndsAt: null } });
    player.missionId = null;
    player.missionEndsAt = null;
    return { message: 'Trabalho inválido removido do personagem.', levelsGained: 0 };
  }
  const now = Date.now();
  if (now >= player.missionEndsAt.getTime()) {
    throw new ApiError(
      'MISSION_NOT_READY',
      'Este turno já terminou — colete o pagamento em vez de cancelar!'
    );
  }

  // cancelamento atômico: só passa se o turno ainda for EXATAMENTE este
  const cancelRes = await tx.player.updateMany({
    where: { id: player.id, missionId: player.missionId, missionEndsAt: player.missionEndsAt },
    data: { missionId: null, missionEndsAt: null },
  });
  if (cancelRes.count === 0) {
    // corrida com claim/cancel concorrente — nada mais a fazer
    throw new ApiError('MISSION_NOT_READY', 'O trabalho já foi encerrado.');
  }

  player.missionId = null;
  player.missionEndsAt = null;

  await trackEvent('mission_canceled', { playerId: player.id, accountId: player.accountId, metadata: { professionId: def.id } }, tx);

  return {
    message: `Turno de ${def.name} cancelado — nenhuma recompensa (nem parcial). Você pode começar de novo quando quiser.`,
    levelsGained: 0,
  };
}

// ===== BATALHA PvE (atividade com duração server-side) =====

/**
 * START da batalha PvE: valida, roda a simulação (para a UI animar),
 * computa recompensas SEM aplicar e cria a atividade com duração
 * proporcional às rodadas. Tudo é concedido no término
 * (resolveDueActivities) — nunca antes.
 */
async function actionStartBattle(tx: Tx, player: Player, enemyId: string): Promise<ActionResult> {
  const idx = ENEMIES.findIndex((e) => e.id === enemyId);
  if (idx < 0) throw new ApiError('VALIDATION_ERROR', 'Inimigo inválido.');
  const enemy = ENEMIES[idx];

  // "primeira batalha" = nenhuma batalha ANTES desta (vitória OU derrota)
  const totalBattlesBefore = player.battlesWon + player.battlesLost;

  const derived = computeDerived(player);
  const minHp = Math.max(20, Math.floor(derived.maxHp * 0.2));
  if (player.hp < minHp) {
    throw new ApiError('INSUFFICIENT_HP', 'Você está ferido demais para lutar! Use um Senzu ou descanse no hospital.');
  }

  // v0.6 — BATALHAS GASTAM ENERGIA: cobrança ATÔMICA no início
  // (updateMany condicional — sem condição de corrida entre cliques)
  const energyRes = await tx.player.updateMany({
    where: { id: player.id, energy: { gte: BATTLE_ENERGY_COST } },
    data: { energy: { decrement: BATTLE_ENERGY_COST } },
  });
  if (energyRes.count === 0) {
    throw new ApiError('INSUFFICIENT_ENERGY', `Energia insuficiente! Cada batalha exige ${BATTLE_ENERGY_COST} de energia.`);
  }
  player.energy -= BATTLE_ENERGY_COST;
  await bumpQuests(tx, player.id, 'energy_spent', BATTLE_ENERGY_COST);

  // contadores diários: APENAS ESTATÍSTICA (v0.4 — nunca reduzem recompensa)
  const day = dayKey();
  const battlesToday = player.pveBattleDay === day ? player.pveBattleCount : 0;
  await tx.player.update({
    where: { id: player.id },
    data: { pveBattleDay: day, pveBattleCount: battlesToday + 1 },
  });
  player.pveBattleDay = day;
  player.pveBattleCount = battlesToday + 1;

  const playerCombatant = buildPlayerCombatant(player);
  const enemyCombatant = buildNpcCombatant(idx);
  const sim = simulateBattle(playerCombatant, enemyCombatant, { playerStartHp: player.hp });

  const rewards = npcRewards(idx, player.race, sim.won);

  // Zenkai decidido AQUI pelos critérios de risco (sem cota diária):
  // derrota + adversário relevante + entrada com vida >= 50%
  let zenkai = false;
  if (!sim.won && player.hp >= derived.maxHp * ZENKAI.zenkaiRequiresHpPct) {
    zenkai = shouldGrantZenkai(
      {
        race: player.race,
        level: player.level,
        lastZenkaiAt: player.lastZenkaiAt,
        lastZenkaiOpponentId: player.lastZenkaiOpponentId,
      },
      enemy.level,
      `enemy:${enemy.id}`
    ).granted;
  }

  // Majin: absorção de vida ao vencer já embutida no HP final previsto
  let playerEndHp = sim.playerEndHp;
  if (sim.won && playerCombatant.raceCombat.absorbOnWinPct > 0) {
    playerEndHp = Math.min(sim.playerMaxHp, playerEndHp + Math.floor(sim.playerMaxHp * playerCombatant.raceCombat.absorbOnWinPct));
  }

  const levelsEstimate = estimateLevelsGained(player, rewards.xp);

  const payload: BattleActivityResult = {
    kind: 'battle',
    mode: 'pve',
    display: {
      message: sim.won
        ? `Vitória contra ${enemy.name}! +${rewards.zeni.toLocaleString('pt-BR')} Zeni, +${rewards.xp} XP.`
        : `Derrota para ${enemy.name}... Você acordou no hospital com 1 de vida.`,
      levelsGained: levelsEstimate,
      battle: {
        ...sim,
        xpGain: rewards.xp,
        zeniGain: sim.won ? rewards.zeni : 0,
        enemyName: enemy.name,
        enemyEmoji: enemy.emoji,
        opponentLevel: enemy.level,
        zenkaiGranted: zenkai,
      },
    },
    apply: {
      pve: {
        enemyId: enemy.id,
        enemyLevel: enemy.level,
        won: sim.won,
        xp: rewards.xp,
        zeni: rewards.zeni,
        zenkai,
        techniquesUsed: sim.playerTechniquesUsed.length,
        firstBattle: totalBattlesBefore === 0,
        playerEndHp,
        playerMaxHp: sim.playerMaxHp,
        // v0.9.17 — conquistas narrativas (flags puras da engine)
        miracleWin: sim.miracleWin ?? false,
        davidReposition: sim.davidReposition ?? false,
      },
    },
  };

  const endsAt = new Date(Date.now() + battleDurationMs(sim.rounds.length));
  const activity = await tx.activity.create({
    data: {
      playerId: player.id,
      kind: 'battle',
      payload: JSON.stringify({ enemyId, mode: 'pve' }),
      result: JSON.stringify(payload),
      endsAt,
    },
  });

  return {
    message: `Batalha contra ${enemy.name} começou!`,
    levelsGained: 0,
    activity: activityToView(activity),
  };
}

// ===== v0.9.18 — TORNEIO DE ARTES MARCIAIS (chave de 8) =====

/**
 * Luta a rodada ATUAL do torneio (ou ABRE uma nova campanha se o jogador
 * estiver fora de uma e o cooldown tiver vencido — um único botão na UI).
 *
 * Diferenças do PvE comum:
 *  * o adversário é ELÁSTICO — construído a partir do combatente REAL do
 *    jogador (equipamentos/transformação contam) × multiplicador da rodada;
 *  * a vida de entrada é a ATUAL (carrega entre as rodadas da campanha);
 *  * o resultado avança a chave no apply (activities.ts) — título na final;
 *  * derrota = eliminação (a próxima luta só após o cooldown do comitê).
 */
async function actionStartTournamentFight(tx: Tx, player: Player): Promise<ActionResult> {
  const {
    parseTournament,
    serializeTournament,
    validateTournamentFight,
    fighterForRound,
    buildTournamentOpponent,
    tournamentRewards,
    roundDef,
    TOURNAMENT_ENTRY_FEE,
  } = await import('./content/tournament');

  const now = new Date();
  const state = parseTournament(player.tournament);
  const check = validateTournamentFight(state, now);
  if (!check.ok || !check.stateToFight) {
    // v0.9.24 (varredura de mensagens genéricas): validateTournamentFight
    // SEMPRE devolve motivo específico (cooldown com minutos restantes);
    // o fallback anterior "Torneio indisponível agora" morria sem explicar
    throw new ApiError('TOURNAMENT_COOLDOWN', check.reason ?? 'O comitê do torneio ainda está reorganizando a chave — aguarde o cooldown para se inscrever de novo.');
  }
  const round = check.round ?? 1;

  // escreve o estado ABERTO já no START (garante que um segundo clique veja
  // round > 0 em vez de abrir outra campanha)
  const opened = check.stateToFight;
  await tx.player.update({
    where: { id: player.id },
    data: { tournament: serializeTournament(opened) },
  });
  player.tournament = serializeTournament(opened);

  // validações comuns de batalha (HP/energia) — mesma política do PvE
  const derived = computeDerived(player);
  const minHp = Math.max(20, Math.floor(derived.maxHp * 0.2));
  if (player.hp < minHp) {
    throw new ApiError('INSUFFICIENT_HP', 'Você está ferido demais para o ringue! Use um Senzu ou descanse no hospital.');
  }
  const energyRes = await tx.player.updateMany({
    where: { id: player.id, energy: { gte: BATTLE_ENERGY_COST } },
    data: { energy: { decrement: BATTLE_ENERGY_COST } },
  });
  if (energyRes.count === 0) {
    throw new ApiError('INSUFFICIENT_ENERGY', `Energia insuficiente! Cada luta do torneio exige ${BATTLE_ENERGY_COST} de energia.`);
  }
  player.energy -= BATTLE_ENERGY_COST;
  await bumpQuests(tx, player.id, 'energy_spent', BATTLE_ENERGY_COST);

  // v0.9.24 (C1) — TAXA DE INSCRIÇÃO: cobrada UMA vez por campanha, na
  // luta de ABERTURA (estado pré-validação round === 0 identifica a
  // estreia; luta 2/3 de uma campanha em andamento não paga nada).
  // spendCurrency é condicional atômico — sem Zeni suficiente lança
  // INSUFFICIENT_ZENI e a transação inteira (estado + energia) volta.
  if (state.round === 0) {
    await spendCurrency(tx, player.id, 'zeni', TOURNAMENT_ENTRY_FEE, {
      type: 'spend',
      source: 'tournament_entry',
      accountId: player.accountId,
      metadata: { runCount: opened.runCount },
    });
    player.zeni -= TOURNAMENT_ENTRY_FEE;
  }

  const playerCombatant = buildPlayerCombatant(player);
  const fighter = fighterForRound(round, opened.runCount);
  const enemyCombatant = buildTournamentOpponent(fighter, playerCombatant, round);
  const sim = simulateBattle(playerCombatant, enemyCombatant, { playerStartHp: player.hp });

  const rewards = tournamentRewards(round, player.level);
  const totalBattlesBefore = player.battlesWon + player.battlesLost;

  const levelsEstimate = estimateLevelsGained(player, rewards.xp);

  // consolação do rejeitado: METADE do XP da rodada (a luta ensina; o
  // Zeni/cristais/cinturão são só do vencedor) — coerente com o texto
  // "Ainda ganhou X XP" do diálogo de derrota
  const xpGain = sim.won ? rewards.xp : Math.max(1, Math.floor(rewards.xp / 2));

  const payload: BattleActivityResult = {
    kind: 'battle',
    mode: 'tournament',
    display: {
      message: sim.won
        ? `Vitória na ${roundDef(round).name} contra ${fighter.name}!`
        : `Eliminado na ${roundDef(round).name} por ${fighter.name}...`,
      levelsGained: levelsEstimate,
      battle: {
        ...sim,
        xpGain,
        zeniGain: sim.won ? rewards.zeni : 0,
        crystalsGain: sim.won ? rewards.crystals : 0,
        enemyName: fighter.name,
        enemyEmoji: fighter.emoji,
        opponentLevel: enemyCombatant.level,
        zenkaiGranted: false,
      },
    },
    apply: {
      tournament: {
        round,
        won: sim.won,
        xp: xpGain,
        zeni: rewards.zeni,
        crystals: rewards.crystals,
        title: sim.won && round === 3,
        techniquesUsed: sim.playerTechniquesUsed.length,
        firstBattle: totalBattlesBefore === 0,
        playerEndHp: sim.playerEndHp,
        playerMaxHp: sim.playerMaxHp,
        miracleWin: sim.miracleWin ?? false,
        davidReposition: sim.davidReposition ?? false,
      },
    },
  };

  const endsAt = new Date(Date.now() + battleDurationMs(sim.rounds.length));
  const activity = await tx.activity.create({
    data: {
      playerId: player.id,
      kind: 'battle',
      payload: JSON.stringify({ mode: 'tournament', round }),
      result: JSON.stringify(payload),
      endsAt,
    },
  });

  await trackEvent('tournament_match_started', {
    playerId: player.id,
    accountId: player.accountId,
    metadata: { round, fighter: fighter.id, runCount: opened.runCount },
  }, tx);

  const roundLabel = roundDef(round).short;
  return {
    message:
      round === 1
        ? `🏟️ Torneio aberto! ${roundLabel} contra ${fighter.emoji} ${fighter.name} começou!`
        : `🏟️ ${roundLabel} contra ${fighter.emoji} ${fighter.name} começou!`,
    levelsGained: 0,
    activity: activityToView(activity),
  };
}

// ===== PVP (atividade com duração server-side) =====

/**
 * POLÍTICA DE VIDA NO PVP (v0.4, explícita e coerente):
 *  * o DESAFIANTE entra com a vida ATUAL dele (atacar ferido é arriscado);
 *  * o DESAFIADO luta sempre com vida CHEIA (duelo preparado — evita
 *    execuções de alvos baleados e mantém o confronto justo);
 *  * a iniciativa vem SOMENTE da velocidade (decideFirst simétrico,
 *    empate = 50/50); o empate no limite de rodadas é decidido por
 *    condição relativa com desempate 50/50 — nenhum lado tem vantagem
 *    por ocupar determinado lado da função.
 */
export async function actionStartPvp(tx: Tx, player: Player, targetId: string): Promise<ActionResult> {
  const target = await tx.player.findUnique({ where: { id: targetId } });
  if (!target) throw new ApiError('NOT_FOUND', 'Alvo não encontrado.');
  if (target.id === player.id) {
    throw new ApiError('VALIDATION_ERROR', 'Você não pode lutar contra si mesmo!');
  }
  if (Math.abs(target.level - player.level) > PVP_LEVEL_RANGE) {
    throw new ApiError('PVP_OUT_OF_RANGE', `Só é possível atacar guerreiros com até ${PVP_LEVEL_RANGE} níveis de diferença.`);
  }
  // v0.9.20 — REGRA DE NEGÓCIO: o estado do ALVO NUNCA protege a vítima.
  // Quem SOFRE a ação pode estar trabalhando, treinando ou lutando — e é
  // atacável normalmente (o combate processa por completo: dano, defesa,
  // roubo de recursos). Quem REALIZA a ação (atacante) continua sujeito
  // às checagens centrais de ocupação (assertPlayerAvailableForAction +
  // assertNoRunningActivityTx, aplicadas no executor).

  // "primeira batalha" = nenhuma batalha ANTES desta (vitória OU derrota)
  const totalBattlesBefore = player.battlesWon + player.battlesLost;

  const derived = computeDerived(player);
  const minHp = Math.max(20, Math.floor(derived.maxHp * 0.2));
  if (player.hp < minHp) {
    throw new ApiError('INSUFFICIENT_HP', 'Você está ferido demais para lutar! Cure-se antes de provocar outros guerreiros.');
  }

  // v0.6 — BATALHAS GASTAM ENERGIA (também no PvP): cobrança ATÔMICA
  const energyRes = await tx.player.updateMany({
    where: { id: player.id, energy: { gte: BATTLE_ENERGY_COST } },
    data: { energy: { decrement: BATTLE_ENERGY_COST } },
  });
  if (energyRes.count === 0) {
    throw new ApiError('INSUFFICIENT_ENERGY', `Energia insuficiente! Cada duelo exige ${BATTLE_ENERGY_COST} de energia.`);
  }
  player.energy -= BATTLE_ENERGY_COST;
  await bumpQuests(tx, player.id, 'energy_spent', BATTLE_ENERGY_COST);

  await trackEvent('pvp_started', { playerId: player.id, accountId: player.accountId, metadata: { targetId } }, tx);

  const playerCombatant = buildPlayerCombatant(player);
  // O DEFENSOR (humano ou bot) luta com TODOS os seus recursos reais:
  // loadout, estratégia escolhida, transformação ativa e bônus raciais —
  // e com vida CHEIA (política de duelo preparado).
  const targetCombatant = buildPlayerCombatant(target);
  const sim = simulateBattle(playerCombatant, targetCombatant, { playerStartHp: player.hp });

  const xpGain = pvpRewards(target.level, player.level, player.race);

  // Zenkai decidido AQUI (derrota + adversário relevante + vida de entrada)
  let zenkai = false;
  if (!sim.won && player.hp >= derived.maxHp * ZENKAI.zenkaiRequiresHpPct) {
    zenkai = shouldGrantZenkai(
      {
        race: player.race,
        level: player.level,
        lastZenkaiAt: player.lastZenkaiAt,
        lastZenkaiOpponentId: player.lastZenkaiOpponentId,
      },
      target.level,
      `player:${target.id}`
    ).granted;
  }

  // Majin: absorção de vida ao vencer
  let playerEndHp = sim.playerEndHp;
  if (sim.won && playerCombatant.raceCombat.absorbOnWinPct > 0) {
    playerEndHp = Math.min(sim.playerMaxHp, playerEndHp + Math.floor(sim.playerMaxHp * playerCombatant.raceCombat.absorbOnWinPct));
  }

  const levelsEstimate = estimateLevelsGained(player, sim.won ? xpGain : Math.max(5, Math.round(25 * target.level * 0.4)));

  const payload: BattleActivityResult = {
    kind: 'battle',
    mode: 'pvp',
    display: {
      message: sim.won
        ? `Você derrotou ${target.name} no PvP!`
        : `${target.name} te derrotou... Você perdeu 5% do seu Zeni mas ganhou experiência.`,
      levelsGained: levelsEstimate,
      battle: {
        ...sim,
        xpGain: sim.won ? xpGain : Math.max(5, Math.round(25 * target.level * 0.4)),
        zeniGain: 0,
        enemyName: target.name,
        enemyEmoji: '👤',
        opponentLevel: target.level,
        zenkaiGranted: zenkai,
      },
    },
    apply: {
      pvp: {
        targetId: target.id,
        targetIsBot: target.isBot,
        won: sim.won,
        xp: xpGain,
        firstBattle: totalBattlesBefore === 0,
        techniquesUsed: sim.playerTechniquesUsed.length,
        playerEndHp,
        playerMaxHp: sim.playerMaxHp,
        zenkai,
        // v0.9.17 — conquistas narrativas (flags puras da engine)
        miracleWin: sim.miracleWin ?? false,
        davidReposition: sim.davidReposition ?? false,
      },
    },
  };

  const endsAt = new Date(Date.now() + battleDurationMs(sim.rounds.length));
  const activity = await tx.activity.create({
    data: {
      playerId: player.id,
      kind: 'battle',
      payload: JSON.stringify({ targetId, mode: 'pvp' }),
      result: JSON.stringify(payload),
      endsAt,
    },
  });

  return {
    message: `Duelo contra ${target.name} começou!`,
    levelsGained: 0,
    activity: activityToView(activity),
  };
}

// ===== LOJA: COMPRAR / VENDER (v0.9.10) =====

/** Quantidade de uma compra/venda: inteiro 1..SHOP_MAX_QUANTITY (padrão 1). */
function quantityArg(args: Record<string, unknown>): number {
  const raw = args.quantity ?? args.amount;
  const n = typeof raw === 'number' ? Math.floor(raw) : 1;
  if (!Number.isFinite(n) || n < 1) {
    throw new ApiError('VALIDATION_ERROR', 'Quantidade inválida — envie um número inteiro de 1 a 99.');
  }
  if (n > SHOP_MAX_QUANTITY) {
    throw new ApiError('VALIDATION_ERROR', `Máximo de ${SHOP_MAX_QUANTITY} unidades por transação.`);
  }
  return n;
}

/** Preço unitário de VENDA (mesma moeda da compra, fração SELL_PRICE_RATIO). */
export function sellUnitPrice(item: ShopItem): number {
  return Math.max(0, Math.floor(item.price * SELL_PRICE_RATIO));
}

function currencyLabel(currency: 'zeni' | 'crystal', value: number): string {
  return currency === 'crystal' ? `${value} 💎 ${value === 1 ? 'diamante' : 'diamantes'}` : `${value.toLocaleString('pt-BR')} Zeni`;
}

/**
 * COMPRA (v0.9.10 — Mudança 2A/2C): o cliente envia apenas itemId +
 * quantidade. O preço real vem do CATÁLOGO do servidor (content/world —
 * código server-side, inacessível ao navegador); o total é calculado AQUI
 * e o débito da carteira + crédito do inventário acontecem numa ÚNICA
 * transação Prisma (spendCurrency atômico + ledger). Equipamentos e itens
 * de treino agora são EMPILHÁVEIS (mapa stacks) — o bônus de treino
 * continua contando UMA vez (owned mantém ids únicos).
 */
async function actionBuy(tx: Tx, player: Player, itemId: string, quantity: number): Promise<ActionResult> {
  const item = getItem(itemId);
  if (!item) throw new ApiError('VALIDATION_ERROR', 'Item inválido.');
  if (player.level < item.minLevel) {
    throw new ApiError('VALIDATION_ERROR', `Nível ${item.minLevel} necessário para comprar ${item.name}.`);
  }

  // v0.9.2 — MOEDA DO ITEM: equipamentos de treino e consumíveis custam
  // DIAMANTES (currency: 'crystal'); o restante continua em Zeni.
  const currency = item.currency === 'crystal' ? ('crystal' as const) : ('zeni' as const);
  const unitPrice = item.price;
  const totalPrice = unitPrice * quantity; // SEMPRE calculado no servidor

  const items = parseItems(player.items);

  if (item.category === 'consumable') {
    const current = items.consumables[item.id] ?? 0;
    if (current + quantity > SHOP_MAX_STACK) {
      throw new ApiError('VALIDATION_ERROR', `Limite do inventário: no máximo ${SHOP_MAX_STACK} unidades de ${item.name} (você tem ${current}).`);
    }
    // UMA transação: débito total + crédito das N unidades
    await spendCurrency(tx, player.id, currency, totalPrice, {
      type: 'spend',
      source: 'shop',
      accountId: player.accountId,
      metadata: { itemId, currency, quantity, unitPrice, totalPrice },
    });
    items.consumables[item.id] = current + quantity;
    await updateJsonState(tx, player, { items: JSON.stringify(items) });
    const total =
      quantity === 1
        ? `${item.name} comprado por ${currencyLabel(currency, totalPrice)}! Use-o no inventário quando quiser.`
        : `${quantity}× ${item.name} comprados por ${currencyLabel(currency, totalPrice)} (${currencyLabel(currency, unitPrice)} cada). Use-os no inventário quando quiser.`;
    return { message: total, levelsGained: 0 };
  }

  // equipamento / treino — empilhável (reservas)
  const currentUnits = itemCount(items, item.id);
  if (currentUnits + quantity > SHOP_MAX_STACK) {
    throw new ApiError('VALIDATION_ERROR', `Limite do inventário: no máximo ${SHOP_MAX_STACK} unidades de ${item.name} (você tem ${currentUnits}).`);
  }
  await spendCurrency(tx, player.id, currency, totalPrice, {
    type: 'spend',
    source: 'shop',
    accountId: player.accountId,
    metadata: { itemId, currency, quantity, unitPrice, totalPrice },
  });
  applyEquipmentBuy(items, item.id, quantity);
  await updateJsonState(tx, player, { items: JSON.stringify(items) });

  const valor = currencyLabel(currency, totalPrice);
  const quantidade = quantity > 1 ? `${quantity}× ` : '';
  const message =
    item.category === 'training'
      ? `${quantidade}${item.name} instalado por ${valor}! Seus treinos agora rendem mais pontos de atributo (o bônus não acumula por unidade).`
      : currentUnits === 0
        ? `${quantidade}${item.name} adquirido por ${valor}! Vá em "Equipar" para usá-lo.`
        : `${quantidade}${item.name} adquirido por ${valor}! Agora você tem ${currentUnits + quantity} unidades de ${item.name} no inventário.`;
  return { message, levelsGained: 0 };
}

/**
 * VENDA (v0.9.10 — Mudança 2B/2C): devolve itens à loja por 50% do preço
 * de compra, NA MESMA MOEDA da compra. A unidade EM USO (equipada no slot
 * ou ativa como passivo de treino) NUNCA é vendida — só as reservas.
 * Débito do inventário + crédito da carteira numa ÚNICA transação, preço
 * validado no servidor pelo catálogo. Cosméticos não são vendáveis.
 */
async function actionSell(tx: Tx, player: Player, itemId: string, quantity: number): Promise<ActionResult> {
  const item = getItem(itemId);
  if (!item) throw new ApiError('VALIDATION_ERROR', 'Item inválido.');

  const items = parseItems(player.items);
  const currency = item.currency === 'crystal' ? ('crystal' as const) : ('zeni' as const);
  const unitSell = sellUnitPrice(item);
  const totalSell = unitSell * quantity;

  if (item.category === 'consumable') {
    const count = items.consumables[item.id] ?? 0;
    if (count <= 0) {
      throw new ApiError('ITEM_NOT_OWNED', `Você não tem ${item.name} no inventário.`);
    }
    if (quantity > count) {
      throw new ApiError('VALIDATION_ERROR', `Você só tem ${count} ${item.name} para vender.`);
    }
    if (count - quantity <= 0) delete items.consumables[item.id];
    else items.consumables[item.id] = count - quantity;
  } else {
    // equipamento / treino: a unidade em uso fica, reservas podem sair
    const total = itemCount(items, item.id);
    if (total <= 0) {
      throw new ApiError('ITEM_NOT_OWNED', `Você não possui ${item.name}.`);
    }
    const inUse =
      items.weapon === item.id || items.armor === item.id || items.accessory === item.id;
    const sellable = inUse ? total - 1 : total;
    if (sellable <= 0) {
      // aviso amigável exigido: nunca vender silenciosamente o item equipado
      throw new ApiError('ITEM_EQUIPPED', `${item.name} está em uso! Desequipe-o primeiro para poder vendê-lo.`);
    }
    if (quantity > sellable) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `Você só pode vender ${sellable} ${sellable === 1 ? 'unidade' : 'unidades'} de ${item.name} (a unidade em uso não pode ser vendida — deseque primeiro).`
      );
    }
    const ok = applyEquipmentSell(items, item.id, quantity);
    if (!ok) throw new ApiError('VALIDATION_ERROR', 'Inventário inconsistente — recarregue a página e tente de novo.');
  }

  // UMA transação: crédito total + estado do inventário já debitado acima
  if (totalSell > 0) {
    await addCurrency(tx, player.id, currency, totalSell, {
      type: 'earn',
      source: 'shop_sell',
      accountId: player.accountId,
      metadata: { itemId, currency, quantity, unitSell, totalSell },
    });
  }
  await updateJsonState(tx, player, { items: JSON.stringify(items) });
  await trackEvent('shop_sell', {
    playerId: player.id,
    accountId: player.accountId,
    metadata: { itemId, quantity, totalSell, currency },
  }, tx);

  const what = quantity === 1 ? `${item.name} vendido` : `${quantity}× ${item.name} vendidos`;
  return {
    message:
      totalSell > 0
        ? `${what} por ${currencyLabel(currency, totalSell)} (${currencyLabel(currency, unitSell)} cada — 50% do preço de compra).`
        : `${what} — este item não tem valor de venda.`,
    levelsGained: 0,
  };
}

// ===== USAR CONSUMÍVEL =====

async function actionUseItem(tx: Tx, player: Player, itemId: string): Promise<ActionResult> {
  const item = getItem(itemId);
  if (!item || item.category !== 'consumable') {
    throw new ApiError('ITEM_NOT_EQUIPPABLE', 'Este item não é um consumível.');
  }
  const items = parseItems(player.items);
  const count = items.consumables[item.id] ?? 0;
  if (count <= 0) {
    throw new ApiError('ITEM_NOT_OWNED', `Você não tem ${item.name} no inventário.`);
  }

  const derived = computeDerived(player);

  // valida antes de consumir (stat cap, vida cheia etc.)
  if (item.effect === 'full_hp' && player.hp >= derived.maxHp) {
    throw new ApiError('VALIDATION_ERROR', 'Sua vida já está cheia!');
  }
  if (item.effect === 'full_energy' && player.energy >= derived.maxEnergy) {
    throw new ApiError('VALIDATION_ERROR', 'Sua energia já está cheia!');
  }
  if (item.effect === 'stat_boost') {
    const capped = (['strength', 'defense', 'speed', 'ki'] as const).every((s) => statAtCap(player, s));
    if (capped) throw new ApiError('STAT_CAP_REACHED', 'Todos os atributos já estão no máximo!');
  }

  // consome o item (bloqueio otimista — nunca duplica)
  items.consumables[item.id] = count - 1;
  if (items.consumables[item.id] <= 0) delete items.consumables[item.id];
  await updateJsonState(tx, player, { items: JSON.stringify(items) });

  let message = '';
  if (item.effect === 'full_hp') {
    await tx.player.update({ where: { id: player.id }, data: { hp: derived.maxHp } });
    player.hp = derived.maxHp;
    message = `Você comeu um Feijão Senzu! Vida totalmente restaurada (${derived.maxHp} HP).`;
  } else if (item.effect === 'full_energy') {
    await tx.player.update({ where: { id: player.id }, data: { energy: derived.maxEnergy } });
    player.energy = derived.maxEnergy;
    message = 'Cápsula de Energia usada! Energia totalmente restaurada.';
  } else if (item.effect === 'stat_boost') {
    // Elixir: +2 em todos os atributos — SEMPRE respeitando o limite central
    const results = (['strength', 'defense', 'speed', 'ki'] as const).map((s) => addStat(player, s, 2));
    await tx.player.update({
      where: { id: player.id },
      data: { strength: player.strength, defense: player.defense, speed: player.speed, ki: player.ki },
    });
    const capped = results.some((r) => r.capped);
    message = capped
      ? 'O Elixir do Dragão despertou seu potencial: +2 em todos os atributos (alguns chegaram ao limite máximo)!'
      : 'O Elixir do Dragão despertou seu potencial oculto: +2 em todos os atributos!';
  }
  return { message, levelsGained: 0 };
}

// ===== EQUIPAR / DESEQUIPAR =====

async function actionEquip(tx: Tx, player: Player, itemId: string): Promise<ActionResult> {
  const item = getItem(itemId);
  if (!item || item.category === 'consumable' || item.category === 'training') {
    throw new ApiError('ITEM_NOT_EQUIPPABLE', 'Item não equipável.');
  }
  const items = parseItems(player.items);
  if (!items.owned.includes(item.id)) {
    throw new ApiError('ITEM_NOT_OWNED', 'Você não possui este item!');
  }
  items[item.category as 'weapon' | 'armor' | 'accessory'] = item.id;
  await updateJsonState(tx, player, { items: JSON.stringify(items) });
  return { message: `${item.name} equipado!`, levelsGained: 0 };
}

async function actionUnequip(tx: Tx, player: Player, slot: string): Promise<ActionResult> {
  if (!['weapon', 'armor', 'accessory'].includes(slot)) {
    throw new ApiError('VALIDATION_ERROR', 'Slot inválido.');
  }
  const items = parseItems(player.items);
  const slotKey = slot as 'weapon' | 'armor' | 'accessory';
  if (!items[slotKey]) {
    throw new ApiError('VALIDATION_ERROR', 'Nada equipado neste slot.');
  }
  items[slotKey] = null;
  await updateJsonState(tx, player, { items: JSON.stringify(items) });
  return { message: 'Item guardado no inventário.', levelsGained: 0 };
}

// ===== HOSPITAL =====

async function actionHeal(tx: Tx, player: Player): Promise<ActionResult> {
  const derived = computeDerived(player);
  const missing = derived.maxHp - player.hp;
  if (missing <= 0) throw new ApiError('VALIDATION_ERROR', 'Sua vida já está cheia!');

  const cost = healCost(player);
  await spendCurrency(tx, player.id, 'zeni', cost, { type: 'spend', source: 'hospital', accountId: player.accountId });
  await tx.player.update({ where: { id: player.id }, data: { hp: derived.maxHp } });
  player.hp = derived.maxHp;
  return { message: `Tratamento concluído! Vida restaurada. (-${cost.toLocaleString('pt-BR')} Zeni)`, levelsGained: 0 };
}

// ===== SHENRON (desejos) =====

async function actionWish(tx: Tx, player: Player, wishType: string): Promise<ActionResult> {
  if (!['riqueza', 'poder', 'vitalidade', 'sabedoria'].includes(wishType)) {
    throw new ApiError('VALIDATION_ERROR', 'Desejo inválido.');
  }
  if (player.dragonBalls < 7) {
    throw new ApiError('VALIDATION_ERROR', `Você tem apenas ${player.dragonBalls}/7 esferas. Continue procurando!`);
  }

  // consumo atômico das 7 esferas — apenas um desejo por coleta
  const consume = await tx.player.updateMany({
    where: { id: player.id, dragonBalls: { gte: 7 } },
    data: { dragonBalls: 0 },
  });
  if (consume.count === 0) {
    throw new ApiError('CONFLICT', 'As esferas já foram usadas.');
  }
  player.dragonBalls = 0;

  let message = '';
  let levelsGained = 0;

  if (wishType === 'riqueza') {
    await addCurrency(tx, player.id, 'zeni', 8000, { type: 'grant', source: 'wish', accountId: player.accountId });
    player.zeni += 8000;
    message = 'Shenlon concedeu seu desejo: +8.000 Zeni caíram do céu!';
  } else if (wishType === 'poder') {
    // +3 em todos os atributos — SEMPRE com limite central
    (['strength', 'defense', 'speed', 'ki'] as const).forEach((s) => addStat(player, s, 3));
    await tx.player.update({
      where: { id: player.id },
      data: { strength: player.strength, defense: player.defense, speed: player.speed, ki: player.ki },
    });
    message = 'Shenlon concedeu seu desejo: +3 em todos os atributos!';
  } else if (wishType === 'vitalidade') {
    const derived = computeDerived(player);
    await tx.player.update({ where: { id: player.id }, data: { hp: derived.maxHp, energy: derived.maxEnergy } });
    player.hp = derived.maxHp;
    player.energy = derived.maxEnergy;
    message = 'Shenlon restaurou completamente sua vida e energia!';
  } else {
    const grant = await grantRewards(tx, player, { xp: 1500 }, { type: 'reward', source: 'wish', accountId: player.accountId });
    levelsGained = grant.levelsGained;
    message = 'Shenlon concedeu seu desejo: +1.500 XP de sabedoria de batalha!';
  }
  return { message, levelsGained };
}

// ===== TÉCNICAS =====

async function actionLearnTechnique(tx: Tx, player: Player, techniqueId: string): Promise<ActionResult> {
  const tech = getTechnique(techniqueId);
  if (!tech) throw new ApiError('VALIDATION_ERROR', 'Técnica inválida.');
  const techniques = parseTechniques(player.techniques);
  if (techniques.includes(tech.id)) {
    throw new ApiError('TECHNIQUE_ALREADY_KNOWN', 'Você já domina esta técnica!');
  }
  if (player.level < tech.minLevel) {
    throw new ApiError('VALIDATION_ERROR', `Nível ${tech.minLevel} necessário para aprender ${tech.name}.`);
  }

  await spendCurrency(tx, player.id, 'zeni', tech.price, { type: 'spend', source: 'master', accountId: player.accountId, metadata: { techniqueId } });
  techniques.push(tech.id);
  await updateJsonState(tx, player, { techniques: JSON.stringify(techniques) });
  player.techniques = JSON.stringify(techniques);

  // auto-equipa em um slot válido livre do loadout
  const loadout = parseLoadout(player.loadout);
  const validSlots = slotsForCategory(tech.category);
  const freeSlot = validSlots.find((s) => !loadout[s]);
  if (freeSlot) {
    loadout[freeSlot] = tech.id;
    await updateJsonState(tx, player, { loadout: JSON.stringify(loadout) });
    player.loadout = JSON.stringify(loadout);
  }

  const equipped = freeSlot ? ` Já equipada no slot ${freeSlot === 'S' ? 'Supremo' : freeSlot}!` : ' Equipe-a no loadout de batalha!';
  return {
    message: `O mestre ficou orgulhoso! Você aprendeu ${tech.name} (${tech.type === 'energy' ? 'Ki' : 'Força'}).${equipped}`,
    levelsGained: 0,
  };
}

async function actionEquipTechnique(tx: Tx, player: Player, slot: string, techniqueId: string | null): Promise<ActionResult> {
  const loadout = parseLoadout(player.loadout);
  if (!['1', '2', '3', 'S'].includes(slot)) {
    throw new ApiError('LOADOUT_INVALID_SLOT', 'Slot inválido.');
  }
  const slotKey = slot as keyof Loadout;

  if (techniqueId === null || techniqueId === '') {
    // remover técnica do slot
    if (!loadout[slotKey]) {
      throw new ApiError('VALIDATION_ERROR', 'Nenhuma técnica neste slot.');
    }
    loadout[slotKey] = null;
    await updateJsonState(tx, player, { loadout: JSON.stringify(loadout) });
    return { message: 'Slot liberado.', levelsGained: 0 };
  }

  const tech = getTechnique(techniqueId);
  if (!tech) throw new ApiError('VALIDATION_ERROR', 'Técnica inválida.');

  const techniques = parseTechniques(player.techniques);
  if (!techniques.includes(tech.id)) {
    throw new ApiError('TECHNIQUE_NOT_LEARNED', 'Você precisa aprender esta técnica com um mestre primeiro!');
  }
  if (!canEquipInSlot(tech, slotKey)) {
    throw new ApiError('LOADOUT_INVALID_SLOT', `${tech.name} é uma técnica ${tech.category === 'supreme' ? 'SUPREMA — só pode ir ao slot S' : 'comum — não pode ocupar o slot Supremo'}.`);
  }

  // se a técnica já está em outro slot, remove de lá (sem duplicar)
  (['1', '2', '3', 'S'] as const).forEach((s) => {
    if (loadout[s] === tech.id) loadout[s] = null;
  });
  loadout[slotKey] = tech.id;
  await updateJsonState(tx, player, { loadout: JSON.stringify(loadout) });
  return {
    message: `${tech.name} equipada no slot ${slotKey === 'S' ? 'Supremo' : slotKey}!`,
    levelsGained: 0,
  };
}

async function actionSetStrategy(tx: Tx, player: Player, strategy: string): Promise<ActionResult> {
  if (!STRATEGIES[strategy as keyof typeof STRATEGIES]) {
    throw new ApiError('VALIDATION_ERROR', 'Estratégia inválida.');
  }
  await tx.player.update({ where: { id: player.id }, data: { strategy } });
  player.strategy = strategy;
  return { message: `Estratégia de combate definida: ${STRATEGIES[strategy as keyof typeof STRATEGIES].name}!`, levelsGained: 0 };
}

// ===== TRANSFORMAÇÕES =====

async function actionUnlockTransformation(tx: Tx, player: Player, transformationId: string): Promise<ActionResult> {
  const tr = getTransformation(transformationId);
  if (!tr) throw new ApiError('TRANSFORM_UNKNOWN', 'Transformação desconhecida.');
  if (tr.race !== 'any' && tr.race !== player.race) {
    throw new ApiError('TRANSFORMATION_LOCKED', 'Esta transformação não pertence à sua raça.');
  }
  const owned = parseTransformationsOwned(player.transformationsOwned);
  if (owned.includes(tr.id)) {
    throw new ApiError('VALIDATION_ERROR', 'Você já desbloqueou esta transformação.');
  }

  // ===== validação de requisitos (100% server-side) =====
  const missing: string[] = [];
  if (player.level < tr.minLevel) missing.push(`nível ${tr.minLevel}`);
  if (tr.requiredStats) {
    if (tr.requiredStats.strength && player.strength < tr.requiredStats.strength) missing.push(`Força ${tr.requiredStats.strength}`);
    if (tr.requiredStats.defense && player.defense < tr.requiredStats.defense) missing.push(`Defesa ${tr.requiredStats.defense}`);
    if (tr.requiredStats.speed && player.speed < tr.requiredStats.speed) missing.push(`Velocidade ${tr.requiredStats.speed}`);
    if (tr.requiredStats.ki && player.ki < tr.requiredStats.ki) missing.push(`Ki ${tr.requiredStats.ki}`);
  }
  if (tr.requiresTransformation && !owned.includes(tr.requiresTransformation)) {
    const prev = getTransformation(tr.requiresTransformation);
    missing.push(`transformação anterior (${prev?.name ?? tr.requiresTransformation})`);
  }
  if (tr.requiredMission) {
    const completed = parseMissionsCompleted(player.missionsCompleted);
    if (!completed.includes(tr.requiredMission)) {
      const profession = getProfession(tr.requiredMission);
      missing.push(`trabalho de ${profession?.name ?? tr.requiredMission} concluído`);
    }
  }
  if (tr.requiredTechnique) {
    const techniques = parseTechniques(player.techniques);
    if (!techniques.includes(tr.requiredTechnique)) {
      const tech = getTechnique(tr.requiredTechnique);
      missing.push(`técnica ${tech?.name ?? tr.requiredTechnique}`);
    }
  }
  if (tr.requiredItem) {
    const items = parseItems(player.items);
    if (!items.owned.includes(tr.requiredItem)) {
      const item = getItem(tr.requiredItem);
      missing.push(`item ${item?.name ?? tr.requiredItem}`);
    }
  }
  if (missing.length > 0) {
    throw new ApiError('TRANSFORMATION_LOCKED', `Requisitos faltando: ${missing.join(', ')}.`);
  }

  // desbloqueia + aplica bônus permanentes (com limite central)
  owned.push(tr.id);
  const data: Record<string, unknown> = {
    transformationsOwned: JSON.stringify(owned),
    transformationId: tr.id, // ativa automaticamente a primeira vez
  };
  if (tr.bonuses) {
    (['strength', 'defense', 'speed', 'ki'] as const).forEach((s) => addStat(player, s, tr.bonuses?.[s] ?? 0));
    Object.assign(data, { strength: player.strength, defense: player.defense, speed: player.speed, ki: player.ki });
  }
  await tx.player.update({ where: { id: player.id }, data });
  await updateJsonState(tx, player, { transformationsOwned: JSON.stringify(owned) });

  await trackEvent('transformation_unlocked', { playerId: player.id, accountId: player.accountId, metadata: { transformationId } }, tx);

  return {
    message: `⚡ ${tr.name} desbloqueada e ativada!${tr.bonuses ? ` Bônus permanente: ${Object.entries(tr.bonuses).map(([k, v]) => `+${v} ${statName(k)}`).join(', ')}.` : ''}`,
    levelsGained: 0,
  };
}

async function actionActivateTransformation(tx: Tx, player: Player, transformationId: string | null): Promise<ActionResult> {
  if (transformationId === null || transformationId === '') {
    await tx.player.update({ where: { id: player.id }, data: { transformationId: null } });
    return { message: 'Você voltou à forma base.', levelsGained: 0 };
  }
  const tr = getTransformation(transformationId);
  if (!tr) throw new ApiError('TRANSFORM_UNKNOWN', 'Transformação desconhecida.');
  // ORDEM DE VALIDAÇÃO (crítica): 1) posse no transformationsOwned
  // → 2) requisitos de nível → 3) equipar. Um requestId manipulado NUNCA
  // equipa algo que não foi desbloqueado de verdade.
  const owned = parseTransformationsOwned(player.transformationsOwned);
  if (!owned.includes(tr.id)) {
    throw new ApiError('NOT_ACQUIRED', 'Você não desbloqueou esta transformação ainda!');
  }
  if (player.level < tr.minLevel) {
    throw new ApiError('TRANSFORMATION_LOCKED', `Nível ${tr.minLevel} necessário para ativar ${tr.name}.`);
  }
  await tx.player.update({ where: { id: player.id }, data: { transformationId: tr.id } });
  return { message: `${tr.icon} ${tr.name} ativada!`, levelsGained: 0 };
}

// ===== GUILDAS =====

export function guildLevelFromXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 500));
}

export function guildXpToNext(level: number): number {
  return 500 * level * level; // xp total necessária para o próximo nível
}

async function actionCreateGuild(tx: Tx, player: Player, guildName: string | undefined): Promise<ActionResult> {
  const name = (guildName ?? '').trim();
  if (name.length < 3 || name.length > 24 || !/^[\p{L}\p{N} _-]+$/u.test(name)) {
    throw new ApiError('VALIDATION_ERROR', 'Nome da guilda inválido (3-24 caracteres, sem símbolos especiais).');
  }
  if (player.guildId) {
    throw new ApiError('GUILD_ALREADY_MEMBER', 'Você já pertence a uma guilda. Saia dela antes de criar outra.');
  }

  const existing = await tx.guild.findFirst({ where: { name } });
  if (existing) throw new ApiError('GUILD_NAME_TAKEN');

  await spendCurrency(tx, player.id, 'zeni', 5000, { type: 'spend', source: 'guild_create', accountId: player.accountId });

  let guild;
  try {
    guild = await tx.guild.create({ data: { name, leaderId: player.id, description: '' } });
  } catch {
    throw new ApiError('GUILD_NAME_TAKEN');
  }
  await tx.player.update({ where: { id: player.id }, data: { guildId: guild.id } });

  return { message: `Guilda "${guild.name}" fundada! Você é o líder. (-5.000 Zeni)`, levelsGained: 0 };
}

async function actionJoinGuild(tx: Tx, player: Player, guildId: string): Promise<ActionResult> {
  if (player.guildId) throw new ApiError('GUILD_ALREADY_MEMBER', 'Você já pertence a uma guilda!');
  const guild = await tx.guild.findUnique({ where: { id: guildId } });
  if (!guild) throw new ApiError('NOT_FOUND', 'Guilda não encontrada.');
  await tx.player.update({ where: { id: player.id }, data: { guildId: guild.id } });
  await trackEvent('guild_joined', { playerId: player.id, accountId: player.accountId, metadata: { guildId } }, tx);
  return { message: `Bem-vindo à guilda "${guild.name}"! Treinem juntos e dominem o ranking.`, levelsGained: 0 };
}

async function actionLeaveGuild(tx: Tx, player: Player): Promise<ActionResult> {
  if (!player.guildId) throw new ApiError('VALIDATION_ERROR', 'Você não pertence a nenhuma guilda.');
  const guild = await tx.guild.findUnique({
    where: { id: player.guildId },
    include: { members: { orderBy: { createdAt: 'asc' } } },
  });
  if (!guild) {
    await tx.player.update({ where: { id: player.id }, data: { guildId: null } });
    return { message: 'Guilda não existia mais.', levelsGained: 0 };
  }

  await tx.player.update({ where: { id: player.id }, data: { guildId: null } });
  const others = guild.members.filter((m) => m.id !== player.id);

  if (others.length === 0) {
    // v0.15 — ERASURE ao dissolver: GuildDonation.guildId NÃO tem FK
    // nesta base (era v0.9.20) — sem esta limpeza manual, doações de uma
    // guilda dissolvida pelo próprio jogo virariam ÓRFÃS LÓGICAS (a
    // exata classe de bug que a matriz anti-órfã vigia). A exclusão de
    // guilda do painel admin já fazia; o caminho do jogador agora também.
    await tx.guildDonation.deleteMany({ where: { guildId: guild.id } });
    await tx.guild.delete({ where: { id: guild.id } });
    return { message: `Você saiu da guilda "${guild.name}". Como estava vazia, ela foi dissolvida.`, levelsGained: 0 };
  }
  if (guild.leaderId === player.id) {
    const newLeader = others[0];
    await tx.guild.update({ where: { id: guild.id }, data: { leaderId: newLeader.id } });
    return { message: `Você deixou a liderança da guilda "${guild.name}" para ${newLeader.name} e saiu.`, levelsGained: 0 };
  }
  return { message: `Você saiu da guilda "${guild.name}".`, levelsGained: 0 };
}

async function actionDonateGuild(tx: Tx, player: Player, amount: number): Promise<ActionResult> {
  if (!player.guildId) throw new ApiError('VALIDATION_ERROR', 'Você não pertence a uma guilda.');
  if (!Number.isInteger(amount) || amount < 100 || amount > 1000000) {
    throw new ApiError('VALIDATION_ERROR', 'Doação inválida (mínimo 100 Zeni).');
  }

  await spendCurrency(tx, player.id, 'zeni', amount, { type: 'spend', source: 'guild_donation', accountId: player.accountId, metadata: { guildId: player.guildId } });

  const guildBefore = await tx.guild.findUniqueOrThrow({ where: { id: player.guildId } });
  const newXp = guildBefore.xp + amount;
  const newLevel = guildLevelFromXp(newXp);
  const leveledUp = newLevel > guildBefore.level;
  await tx.guild.update({
    where: { id: guildBefore.id },
    data: { xp: newXp, level: newLevel, totalDonated: { increment: amount } },
  });
  await tx.player.update({ where: { id: player.id }, data: { guildDonated: { increment: amount } } });
  await tx.guildDonation.create({ data: { playerId: player.id, guildId: guildBefore.id, amount } });

  return {
    message: `Doação de ${amount.toLocaleString('pt-BR')} Zeni para a guilda!${leveledUp ? ` 🎉 A guilda subiu para o nível ${newLevel}!` : ''}`,
    levelsGained: 0,
  };
}

// ===== QUESTS / CONQUISTAS / COSMÉTICOS / BOSS =====

async function actionClaimQuest(tx: Tx, player: Player, questId: string): Promise<ActionResult> {
  const { levelsGained, rewards } = await claimQuest(tx, player, questId);
  const parts = [
    rewards.zeni > 0 ? `+${rewards.zeni.toLocaleString('pt-BR')} Zeni` : '',
    rewards.xp > 0 ? `+${rewards.xp} XP` : '',
    rewards.crystals > 0 ? `+${rewards.crystals} 💎` : '',
  ].filter(Boolean);
  return { message: `Missão concluída! ${parts.join(', ')}.`, levelsGained };
}

async function actionClaimAchievement(tx: Tx, player: Player, achievementId: string): Promise<ActionResult> {
  const { levelsGained, rewards } = await claimAchievement(tx, player, achievementId);
  const parts = [
    rewards.zeni > 0 ? `+${rewards.zeni.toLocaleString('pt-BR')} Zeni` : '',
    rewards.xp > 0 ? `+${rewards.xp} XP` : '',
    rewards.crystals > 0 ? `+${rewards.crystals} 💎` : '',
  ].filter(Boolean);
  return { message: `Conquista desbloqueada! ${parts.join(', ')}.`, levelsGained };
}

async function actionBuyCosmetic(auth: AuthContext, tx: Tx, player: Player, cosmeticId: string): Promise<ActionResult> {
  const { getCosmetic } = await import('./content/cosmetics');
  const cosmetic = getCosmetic(cosmeticId);
  if (!cosmetic) throw new ApiError('VALIDATION_ERROR', 'Cosmético inválido.');

  // v0.9.6 (Mudança 3): a POSSE é DESTE personagem (Player.cosmeticsOwned).
  // Quem compra é o guerreiro em uso — os outros personagens da mesma
  // conta NÃO ganham o cosmético (cada um tem a própria coleção).
  const owned = parseCosmeticsOwnedList(player.cosmeticsOwned);
  if (owned.includes(cosmetic.id)) {
    throw new ApiError('ITEM_ALREADY_OWNED', 'Este personagem já possui este cosmético.');
  }

  await spendCurrency(tx, player.id, 'crystal', cosmetic.price, { type: 'spend', source: 'cosmetic', accountId: auth.account.id, metadata: { cosmeticId } });

  owned.push(cosmetic.id);
  await tx.player.update({
    where: { id: player.id },
    data: { cosmeticsOwned: JSON.stringify(owned) },
  });
  player.cosmeticsOwned = JSON.stringify(owned);

  // histórico de aquisições da conta (auditoria — não é valor de jogo)
  await tx.purchase.create({
    data: { accountId: auth.account.id, product: `cosmetic_${cosmetic.id}`, currency: 'crystal', amount: cosmetic.price, status: 'completed' },
  });

  return { message: `${cosmetic.icon} ${cosmetic.name} adquirido para ${player.name}!`, levelsGained: 0 };
}

/** Parse local (lista de ids de cosméticos do personagem). */
function parseCosmeticsOwnedList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string').slice(0, 100) : [];
  } catch {
    return [];
  }
}

// ===== v0.9.15: TALENTOS DE ÍMPETO (Cap. 7 do ASCENSÃO Z) =====
// Os dois gastos restantes de 1 Ímpeto ("Repetir um d10" e
// "Reposicionamento dramático") comprados na Loja com Zeni. A posse é
// do PERSONAGEM (como cosméticos v0.9.6); a validação pura vive em
// content/talents.ts (validateTalentPurchase) e é reaproveitada pelos
// testes — a action só orquestra transação + ledger + persistência.
async function actionBuyTalent(auth: AuthContext, tx: Tx, player: Player, talentId: string): Promise<ActionResult> {
  const { TALENTS, getTalent, parseTalents, validateTalentPurchase } = await import('./content/talents');
  void TALENTS; // (import agrupado; validação usa getTalent via helper)
  const owned = parseTalents(player.talents);
  const check = validateTalentPurchase(player.level, player.zeni, owned, talentId);
  if (!check.ok) {
    throw new ApiError('VALIDATION_ERROR', check.reason);
  }
  const talent = getTalent(talentId)!;

  await spendCurrency(tx, player.id, 'zeni', talent.price, {
    type: 'spend',
    source: 'talent',
    accountId: auth.account.id,
    metadata: { talentId },
  });

  await tx.player.update({
    where: { id: player.id },
    data: { talents: JSON.stringify(check.ownedAfter) },
  });
  player.talents = JSON.stringify(check.ownedAfter);

  await tx.purchase.create({
    data: { accountId: auth.account.id, product: `talent_${talent.id}`, currency: 'zeni', amount: talent.price, status: 'completed' },
  });

  return {
    message: `${talent.icon} ${talent.name} dominado! ${player.name} agora pode gastar ${talent.impetoCost} Ímpeto${talent.impetoCost > 1 ? "s" : ""} — ${talent.effect}`,
    levelsGained: 0,
  };
}

// ===== v0.5→v0.9.6: EQUIPAR/DESEQUIPAR cosméticos (efeitos VISÍVEIS) =====
// v0.9.6 (Mudança 3): posse e equipar são AMBOS do PERSONAGEM
// (Player.cosmeticsOwned + Player.cosmeticsEquipped JSON {slot: id}).
// Equipar em um slot substitui o cosmético anterior do MESMO slot.
// Bloqueado durante missão ativa (allowlist central), liberado durante
// atividades (igual a comprar/equipar itens).

async function actionEquipCosmetic(auth: AuthContext, tx: Tx, player: Player, cosmeticId: string): Promise<ActionResult> {
  const { getCosmetic, parseCosmeticsEquipped, serializeCosmeticsEquipped } = await import('./content/cosmetics');
  const cosmetic = getCosmetic(cosmeticId);
  if (!cosmetic) throw new ApiError('VALIDATION_ERROR', 'Cosmético inválido.');

  const owned = parseCosmeticsOwnedList(player.cosmeticsOwned);
  if (!owned.includes(cosmetic.id)) {
    throw new ApiError('ITEM_NOT_OWNED', 'ESTE personagem não possui este cosmético. Adquira-o na loja com ele primeiro.');
  }

  const equipped = parseCosmeticsEquipped(player.cosmeticsEquipped);
  const previous = equipped[cosmetic.slot];
  equipped[cosmetic.slot] = cosmetic.id;
  await tx.player.update({
    where: { id: player.id },
    data: { cosmeticsEquipped: serializeCosmeticsEquipped(equipped) },
  });

  const replaced = previous && previous !== cosmetic.id ? ` (substituiu ${getCosmetic(previous)?.name ?? previous})` : '';
  return {
    message: `${cosmetic.icon} ${cosmetic.name} equipado${replaced}! O efeito já está ativo no seu perfil.`,
    levelsGained: 0,
  };
}

async function actionUnequipCosmetic(tx: Tx, player: Player, cosmeticId: string): Promise<ActionResult> {
  const { getCosmetic, parseCosmeticsEquipped, serializeCosmeticsEquipped } = await import('./content/cosmetics');
  const cosmetic = getCosmetic(cosmeticId);
  if (!cosmetic) throw new ApiError('VALIDATION_ERROR', 'Cosmético inválido.');

  // posse não é necessária para REMOVER (limpeza de estado antigo), mas o
  // cosmético precisa estar equipado neste personagem
  const equipped = parseCosmeticsEquipped(player.cosmeticsEquipped);
  if (equipped[cosmetic.slot] !== cosmetic.id) {
    throw new ApiError('VALIDATION_ERROR', 'Este cosmético não está equipado neste personagem.');
  }
  delete equipped[cosmetic.slot];
  await tx.player.update({
    where: { id: player.id },
    data: { cosmeticsEquipped: serializeCosmeticsEquipped(equipped) },
  });

  return { message: `${cosmetic.icon} ${cosmetic.name} removido.`, levelsGained: 0 };
}

async function actionWorldBoss(tx: Tx, player: Player): Promise<ActionResult> {
  const result = await attackWorldBoss(tx, player);
  const base = result.killed
    ? `💥 GOLPE FINAL! Você causou ${result.damage.toLocaleString('pt-BR')} de dano e DERROTOU a ameaça universal!`
    : `Você causou ${result.damage.toLocaleString('pt-BR')} de dano na ameaça universal! (+${result.xpGain} XP)`;
  return {
    message: result.note ? `${base} ${result.note}` : base,
    levelsGained: 0,
    bossAttack: result,
  };
}

// ===== SELEÇÃO DE PERSONAGEM (anti-localStorage) =====

/**
 * Registra no SERVIDOR qual personagem da conta está em uso.
 * Com isso o cliente nunca precisa persistir playerId: no boot,
 * GET /api/auth/session devolve account.activePlayerId — fonte única.
 * A posse já foi validada pelo requirePlayer central (403 se de outra conta).
 */
async function actionSelectPlayer(tx: Tx, auth: AuthContext, player: Player): Promise<ActionResult> {
  if (auth.account.activePlayerId !== player.id) {
    await tx.account.update({
      where: { id: auth.account.id },
      data: { activePlayerId: player.id },
    });
  }
  return {
    message: `${player.name} pronto para a batalha!`,
    levelsGained: 0,
  };
}
