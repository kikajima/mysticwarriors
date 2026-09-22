// =====================================================================
// MATRIZ ANTI-ÓRFÃ (compartilhada) — v0.14
// ---------------------------------------------------------------------
// A MESMA matriz das FKs VIVAS do schema é consumida por:
//  * tests/anti-orphan.test.ts (suíte permanente — camada hermética +
//    banco vivo);
//  * src/lib/game/adminErasure.ts (verificação anti-órfã AUTOMÁTICA
//    pós-exclusão do painel admin — "se sobrou órfão, a operação
//    REPORTA falha, não silencia").
//
// Uma fonte única garante que a verificação da OPERAÇÃO é EXATAMENTE a
// mesma query da suíte — nunca divergem (lição v0.13.1: verificação
// declarada ≠ verificação executada).
//
// FONTE DA VERDADE: o DDL vivo (sqlite_master) — extraído em
// 2026-09-15 com a query de FKs (a mesma família do scripts/fk-matrix
// da v0.13.1). A matriz acompanha também inventário/crafting adicionados depois.
//
//  ⚠ GuildDonation.guildId NÃO tem FK nesta base (tabela da era
//    v0.9.20): o POSTGRES/SQLite não a protege — apagar a guilda sem
//    limpeza manual deixa DOAÇÕES ÓRFÃS (o exato bug de classe que a
//    regra de erasure v0.12 extirpou com FK Cascade; nesta base a
//    limpeza é MANUAL no adminErasure e AQUI é vigilância). O check
//    lógico usa a MESMA query LEFT JOIN — constraint ou não, referência
//    quebrada é órfã.
//
// EXCEÇÃO DOCUMENTADA: AnalyticsEvent.playerId/accountId NÃO são FKs
// (colunas texto, histórico anônimo — apêndice-only por design); fora
// do escopo da matriz, sem leitura no jogo.
// =====================================================================

import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * As FKs vivas do schema + o check lógico de GuildDonation.guildId.
 * (tabela, coluna, alvo, coluna-alvo, nullable, logical?)
 */
export const FK_MATRIX: Array<{
  table: string;
  column: string;
  target: string;
  targetColumn: string;
  nullable: boolean;
  /** true = SEM constraint no DDL — vigilância de integridade lógica. */
  logical: boolean;
}> = [
  { table: 'Session', column: 'accountId', target: 'Account', targetColumn: 'id', nullable: false, logical: false },
  { table: 'WalletTransaction', column: 'accountId', target: 'Account', targetColumn: 'id', nullable: true, logical: false },
  { table: 'WalletTransaction', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'QuestProgress', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'AchievementState', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'WorldBossDamage', column: 'bossId', target: 'WorldBoss', targetColumn: 'id', nullable: false, logical: false },
  { table: 'WorldBossDamage', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'SeasonRankEntry', column: 'seasonId', target: 'Season', targetColumn: 'id', nullable: false, logical: false },
  { table: 'SeasonRankEntry', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'GuildDonation', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'Purchase', column: 'accountId', target: 'Account', targetColumn: 'id', nullable: false, logical: false },
  { table: 'CosmeticOwned', column: 'accountId', target: 'Account', targetColumn: 'id', nullable: false, logical: false },
  { table: 'RequestDedup', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'Account', column: 'activePlayerId', target: 'Player', targetColumn: 'id', nullable: true, logical: false },
  { table: 'Activity', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'InventoryStack', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'MarketListing', column: 'sellerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'MarketTrade', column: 'listingId', target: 'MarketListing', targetColumn: 'id', nullable: false, logical: false },
  { table: 'MarketTrade', column: 'buyerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'MarketTrade', column: 'sellerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'MarketBuyOrder', column: 'buyerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'MarketBuyOrderTrade', column: 'orderId', target: 'MarketBuyOrder', targetColumn: 'id', nullable: false, logical: false },
  { table: 'MarketBuyOrderTrade', column: 'buyerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'MarketBuyOrderTrade', column: 'sellerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'CraftJob', column: 'playerId', target: 'Player', targetColumn: 'id', nullable: false, logical: false },
  { table: 'Player', column: 'accountId', target: 'Account', targetColumn: 'id', nullable: true, logical: false },
  { table: 'Player', column: 'guildId', target: 'Guild', targetColumn: 'id', nullable: true, logical: false },
  // ⚠ check LÓGICO (sem FK no DDL — era v0.9.20): doação apontando para
  // guilda morta. A exclusão de guilda do admin limpa NA MÃO; a suíte
  // vigia para nunca voltar.
  { table: 'GuildDonation', column: 'guildId', target: 'Guild', targetColumn: 'id', nullable: false, logical: true },
];

export interface OrphanCell {
  fk: string;
  orphans: number;
  logical: boolean;
}

type Queryable = Pick<PrismaClient, '$queryRawUnsafe'> | Prisma.TransactionClient;

/**
 * Conta órfãos em CADA célula da matriz: linhas cuja referência aponta
 * para um alvo que NÃO existe (LEFT JOIN … IS NULL, NULL-safe para
 * colunas nullable). Vale igualmente para constraints reais e checks
 * lógicos — a query é a mesma.
 */
export async function countOrphans(client: Queryable): Promise<OrphanCell[]> {
  const out: OrphanCell[] = [];
  for (const fk of FK_MATRIX) {
    const nullClause = fk.nullable ? `AND c."${fk.column}" IS NOT NULL` : '';
    const rows = (await client.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM "${fk.table}" c LEFT JOIN "${fk.target}" p ON c."${fk.column}" = p."${fk.targetColumn}" WHERE p."${fk.targetColumn}" IS NULL ${nullClause}`
    )) as Array<{ n: bigint | number }>;
    out.push({
      fk: `${fk.table}.${fk.column} → ${fk.target}${fk.logical ? ' (lógico)' : ''}`,
      orphans: Number(rows[0]?.n ?? 0),
      logical: fk.logical,
    });
  }
  return out;
}

/** Resumo da matriz: limpa? + detalhe das células sujas (para relatórios). */
export function summarizeOrphans(matrix: OrphanCell[]): { clean: boolean; totalOrphans: number; detail: string } {
  const dirty = matrix.filter((c) => c.orphans > 0);
  const totalOrphans = dirty.reduce((acc, c) => acc + c.orphans, 0);
  return {
    clean: dirty.length === 0,
    totalOrphans,
    detail:
      dirty.length === 0
        ? `matriz ${matrix.length}/${matrix.length} limpa`
        : dirty.map((c) => `${c.fk}: ${c.orphans}`).join('; '),
  };
}
