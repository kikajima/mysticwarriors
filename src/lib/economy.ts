import { guildBonuses } from './game/guildRules';
import { parseProfessions, academicXpMultiplier } from '@/lib/game/professionCareer';
import { MAX_ACTION_ENERGY } from '@/lib/game/rules';
import type { Prisma, Player } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { ApiError } from '@/lib/api';
import { assertValidAmount } from '@/lib/game/rules';
import { xpToNextLevel } from '@/lib/game/content/world';

// =====================================================================
// ECONOMIA CENTRALIZADA — todos os saldos passam por aqui
// ---------------------------------------------------------------------
// * Toda mutação de Zeni/cristais é atômica (updateMany condicional)
//   → saldos nunca ficam negativos, mesmo com requisições simultâneas;
// * Toda mutação grava uma linha no ledger (WalletTransaction) com
//   saldo antes/depois para auditoria futura;
// * XP também é concedido por aqui (com level-up).
// =====================================================================

type Tx = Prisma.TransactionClient;
type Currency = 'zeni' | 'crystal';

interface LedgerInfo {
  type: string;
  source: string;
  metadata?: Record<string, unknown>;
  accountId?: string | null;
}

async function writeLedger(
  tx: Tx,
  player: { id: string; accountId: string | null },
  currency: Currency,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  info: LedgerInfo
) {
  await tx.walletTransaction.create({
    data: {
      accountId: info.accountId ?? player.accountId,
      playerId: player.id,
      currency,
      amount,
      type: info.type,
      source: info.source,
      balanceBefore,
      balanceAfter,
      metadata: info.metadata ? JSON.stringify(info.metadata) : undefined,
    },
  });
}

/** Debita moeda da carteira de forma ATÔMICA. */
export async function spendCurrency(
  tx: Tx,
  playerId: string,
  currency: Currency,
  amount: number,
  info: LedgerInfo
): Promise<{ balanceBefore: number; balanceAfter: number }> {
  assertValidAmount(amount);

  // débito condicional atômico: só passa se o saldo atual for suficiente
  let result;
  if (currency === 'zeni') {
    result = await tx.player.updateMany({ where: { id: playerId, zeni: { gte: amount } }, data: { zeni: { decrement: amount } } });
  } else {
    result = await tx.player.updateMany({ where: { id: playerId, crystals: { gte: amount } }, data: { crystals: { decrement: amount } } });
  }
  if (result.count === 0) {
    const current = await tx.player.findUnique({ where: { id: playerId }, select: { zeni: true, crystals: true } });
    throw new ApiError(
      currency === 'zeni' ? 'INSUFFICIENT_ZENI' : 'INSUFFICIENT_CRYSTALS',
      currency === 'zeni'
        ? `Zeni insuficiente! Você tem ${(current?.zeni ?? 0).toLocaleString('pt-BR')} e precisa de ${amount.toLocaleString('pt-BR')}.`
        : `Cristais insuficientes! Você tem ${current?.crystals ?? 0} e precisa de ${amount}.`
    );
  }

  const after = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { zeni: true, crystals: true } });
  const balanceAfter = currency === 'zeni' ? after.zeni : after.crystals;
  const balanceBefore = balanceAfter + amount;
  await writeLedger(tx, { id: playerId, accountId: info.accountId ?? null }, currency, -amount, balanceBefore, balanceAfter, info);
  return { balanceBefore, balanceAfter };
}

/** Teto de Zeni/cristais — Int32 seguro com folga (nenhuma fonte ultrapassa). */
export const CURRENCY_CAP = 2_000_000_000;

/** Credita moeda na carteira de forma atômica (sempre registra no ledger). */
export async function addCurrency(
  tx: Tx,
  playerId: string,
  currency: Currency,
  amount: number,
  info: LedgerInfo
): Promise<{ balanceBefore: number; balanceAfter: number }> {
  assertValidAmount(amount);

  if (currency === 'zeni') {
    // clamp: o saldo nunca ultrapassa o teto Int32 (segurança de tipo)
    await tx.player.updateMany({
      where: { id: playerId },
      data: { zeni: { increment: amount } },
    });
    await tx.player.updateMany({
      where: { id: playerId, zeni: { gt: CURRENCY_CAP } },
      data: { zeni: CURRENCY_CAP },
    });
  } else {
    await tx.player.updateMany({
      where: { id: playerId },
      data: { crystals: { increment: amount } },
    });
    await tx.player.updateMany({
      where: { id: playerId, crystals: { gt: CURRENCY_CAP } },
      data: { crystals: CURRENCY_CAP },
    });
  }
  const after = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { zeni: true, crystals: true } });
  const balanceAfter = currency === 'zeni' ? after.zeni : after.crystals;
  const balanceBefore = balanceAfter - amount;
  await writeLedger(tx, { id: playerId, accountId: info.accountId ?? null }, currency, amount, balanceBefore, balanceAfter, info);
  return { balanceBefore, balanceAfter };
}

// ===== Transferências PvP (ledger de DUAS pontas) =====

export interface PvpTransferResult {
  transferId: string;
  amount: number;
}

/**
 * Transfere Zeni entre dois jogadores de forma atômica, gerando AS DUAS
 * pontas do ledger compartilhando o mesmo transferId:
 *
 *   perdedor: PVP_TRANSFER_DEBIT  -amount (saldo antes/depois)
 *   vencedor: PVP_TRANSFER_CREDIT +amount (saldo antes/depois)
 *
 * O débito é condicional (nunca deixa saldo negativo) e o valor é
 * limitado ao saldo REAL do pagador no momento da transação.
 */
export async function transferZeniPvp(
  tx: Tx,
  params: {
    fromPlayerId: string;
    fromAccountId: string | null;
    toPlayerId: string;
    toAccountId: string | null;
    amount: number;
    context: 'pvp_steal' | 'pvp_loss';
    metadata?: Record<string, unknown>;
  }
): Promise<PvpTransferResult> {
  assertValidAmount(params.amount);
  const transferId = randomUUID();

  // 1) débito atômico do pagador — limitado ao saldo atual
  const loser = await tx.player.findUnique({ where: { id: params.fromPlayerId }, select: { guild: { select: { level: true } } } });
  const protectedAmount = Math.floor(params.amount * guildBonuses(loser?.guild?.level).pvpLoss);
  let debit = protectedAmount;
  let res = await tx.player.updateMany({
    where: { id: params.fromPlayerId, zeni: { gte: debit } },
    data: { zeni: { decrement: debit } },
  });
  if (res.count === 0) {
    // saldo mudou entre a leitura e agora: tenta o saldo real atual
    const fresh = await tx.player.findUnique({ where: { id: params.fromPlayerId }, select: { zeni: true } });
    debit = Math.min(protectedAmount, fresh?.zeni ?? 0);
    if (debit <= 0) return { transferId, amount: 0 };
    res = await tx.player.updateMany({
      where: { id: params.fromPlayerId, zeni: { gte: debit } },
      data: { zeni: { decrement: debit } },
    });
    if (res.count === 0) return { transferId, amount: 0 };
  }

  // ponta DEBIT do ledger
  const fromAfter = await tx.player.findUniqueOrThrow({ where: { id: params.fromPlayerId }, select: { zeni: true } });
  await writeLedger(
    tx,
    { id: params.fromPlayerId, accountId: params.fromAccountId },
    'zeni',
    -debit,
    fromAfter.zeni + debit,
    fromAfter.zeni,
    {
      type: 'pvp_transfer_debit',
      source: 'pvp',
      accountId: params.fromAccountId,
      metadata: { ...params.metadata, transferId, counterpartPlayerId: params.toPlayerId },
    }
  );

  // 2) crédito atômico ao recebedor
  if (debit > 0) {
    await tx.player.updateMany({ where: { id: params.toPlayerId }, data: { zeni: { increment: debit } } });
    const toAfter = await tx.player.findUniqueOrThrow({ where: { id: params.toPlayerId }, select: { zeni: true } });
    await writeLedger(
      tx,
      { id: params.toPlayerId, accountId: params.toAccountId },
      'zeni',
      debit,
      toAfter.zeni - debit,
      toAfter.zeni,
      {
        type: 'pvp_transfer_credit',
        source: 'pvp',
        accountId: params.toAccountId,
        metadata: { ...params.metadata, transferId, counterpartPlayerId: params.fromPlayerId },
      }
    );
  }

  return { transferId, amount: debit };
}

/** Hash SHA-256 hex (usado para tokens de sessão/recuperação). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ===== XP e level-up =====

export interface XpResult {
  levelsGained: number;
  newLevel: number;
}

/**
 * Concede XP com curva centralizada e level-up atômico.
 * ATENÇÃO: usa updateMany condicional em xp/level para evitar level-up
 * duplicado em requisições simultâneas.
 */
export async function grantXp(tx: Tx, playerId: string, amount: number, info: LedgerInfo = { type: 'reward', source: 'progression' }): Promise<XpResult> {
  assertValidAmount(amount);
  let current = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { level: true, xp: true, defense: true, ki: true } });
  let xp = current.xp + amount;
  let level = current.level;
  let levelsGained = 0;
  let need = xpToNextLevel(level);
  while (xp >= need) {
    xp -= need;
    level += 1;
    levelsGained += 1;
    need = xpToNextLevel(level);
  }

  // grava de forma atômica e condicional (evita corrida de level-up duplo)
  const res = await tx.player.updateMany({
    where: { id: playerId, level: current.level, xp: current.xp },
    data: { xp: { increment: amount } },
  });
  if (res.count === 0) {
    // outro request mudou o xp no meio — relê e aplica incrementalmente
    current = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { level: true, xp: true, defense: true, ki: true } });
    xp = current.xp + amount;
    level = current.level;
    levelsGained = 0;
    let n = xpToNextLevel(level);
    while (xp >= n) {
      xp -= n;
      level += 1;
      levelsGained += 1;
      n = xpToNextLevel(level);
    }
    await tx.player.updateMany({ where: { id: playerId }, data: { xp, level } });
  } else if (levelsGained > 0) {
    await tx.player.updateMany({ where: { id: playerId }, data: { xp, level } });
  }

  if (levelsGained > 0) {
    // v0.9.10 (Mudança 1): level-up restaura APENAS A VIDA. Energia NUNCA
    // é recuperada ao subir de nível — ela vem SOMENTE de: (1) regeneração
    // por tempo (modelo 8h — applyRegen), (2) compra da Cápsula de Energia
    // na loja, (3) ação de admin (restore_energy). maxEnergy não depende
    // do nível ou do Ki (limite fixo), então não há o que normalizar aqui.
    const maxHp = 80 + level * 15 + current.defense * 5;
    await tx.player.updateMany({
      where: { id: playerId },
      data: { hp: maxHp },
    });
    await tx.analyticsEvent.create({
      data: { name: 'level_up', playerId, metadata: JSON.stringify({ level, source: info.source }) },
    });
  }

  return { levelsGained, newLevel: level };
}

/** Normaliza HP/energia para os máximos derivados (pós level-up). */
export async function clampVitals(tx: Tx, player: Player): Promise<void> {
  const maxHp = 80 + player.level * 15 + player.defense * 5;
  const maxEnergy = MAX_ACTION_ENERGY;
  const hp = Math.min(player.hp, maxHp);
  const energy = Math.min(player.energy, maxEnergy);
  if (hp !== player.hp || energy !== player.energy) {
    player.hp = hp;
    player.energy = energy;
    await tx.player.update({ where: { id: player.id }, data: { hp, energy } });
  }
}

/**
 * Concede um pacote de recompensa (Zeni + XP + cristais) numa única
 * transação — usado por missões, batalhas, quests, conquistas e boss.
 */
export async function grantRewards(
  tx: Tx,
  player: Player,
  rewards: { zeni?: number; xp?: number; crystals?: number },
  info: LedgerInfo
): Promise<{ levelsGained: number; xpGranted: number; zeniGranted: number }> {
  const current = await tx.player.findUniqueOrThrow({ where: { id: player.id }, select: { guild: { select: { level: true } } } });
  const bonus = guildBonuses(current.guild?.level);
  const combat = ['pve', 'pvp', 'tournament', 'world_boss'].includes(info.source);
  if (rewards.xp) {
    rewards.xp = Math.round(rewards.xp * (combat ? bonus.combatXp : info.source === 'mission' ? bonus.workXp : 1));
    // Acadêmico: +0,5% de XP GLOBAL por nível conquistado na carreira,
    // até +5% no nível 10. Sem hora acadêmica concluída, bônus = 0.
    rewards.xp = Math.max(1, Math.round(rewards.xp * academicXpMultiplier(parseProfessions(player.professions))));
  }
  if (rewards.zeni && info.source === 'mission') rewards.zeni = Math.round(rewards.zeni * bonus.workZeni);
  let levelsGained = 0;
  if (rewards.zeni && rewards.zeni > 0) {
    await addCurrency(tx, player.id, 'zeni', rewards.zeni, { ...info, type: info.type === 'spend' ? 'earn' : info.type });
  }
  if (rewards.crystals && rewards.crystals > 0) {
    await addCurrency(tx, player.id, 'crystal', rewards.crystals, { ...info });
  }
  if (rewards.xp && rewards.xp > 0) {
    const res = await grantXp(tx, player.id, rewards.xp, info);
    levelsGained = res.levelsGained;
    player.level = res.newLevel;
  }
  return { levelsGained, xpGranted: rewards.xp ?? 0, zeniGranted: rewards.zeni ?? 0 };
}
