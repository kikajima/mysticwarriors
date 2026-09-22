import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { applyPendingMigrations, resolveDbFilePath } from '../src/lib/game/persistence';
import { countOrphans, summarizeOrphans, FK_MATRIX } from '../src/lib/game/orphanCheck';

const liveDbTest = process.env.CI === 'true' ? test.skip : test;

// =====================================================================
// TESTE ANTI-ÓRFÃ PERMANENTE (v0.14 — reconstruído para o schema vigente)
// ---------------------------------------------------------------------
// ORIGEM (v0.13.1, lição de classe): um reset "passou" com verificação
// só de CONTAGENS e o dono viu fantasmas na tela. Este teste fecha a
// lacuna ESTRUTURAL: nenhuma tabela pode carregar linha cujo alvo de FK
// não existe. A matriz vive em src/lib/game/orphanCheck.ts — FONTE ÚNICA,
// consumida também pela verificação pós-exclusão do painel admin
// (adminErasure): a query da OPERAÇÃO é EXATAMENTE a da suíte.
//
// DUAS CAMADAS (ambas obrigatórias):
//  1. HERMÉTICA (banco temporário + cadeia REAL de migrations): cria o
//     mundo completo e apaga pela RAIZ (Player / Account / Guild /
//     WorldBoss). As CASCADES do schema têm que varrer TUDO: qualquer
//     célula com órfão = FALHA. Prova o SCHEMA, roda em qualquer CI.
//  2. BANCO VIVO (somente leitura): a mesma matriz contra o
//     db/custom.db do ambiente — um reset/exclusão futura que deixe
//     QUALQUER referência quebrada derruba a suíte. (Dados de QA
//     sujos mas CONSISTENTES não falham — só órfãos falham.)
//
// CHECK LÓGICO EXTRA (exclusivo desta base): GuildDonation.guildId NÃO
// tem FK no DDL (tabela da era v0.9.20) — a matriz vigia na mesma
// query LEFT JOIN. É o exato bug de classe que a exclusão de guilda do
// admin limpa NA MÃO (adminErasure, mesma transação).
//
// EXCEÇÃO DOCUMENTADA: AnalyticsEvent.playerId/accountId NÃO são FKs
// (colunas texto, histórico anônimo de dev — apêndice-only por design);
// fora do escopo da matriz, sem ghost reads no jogo (a UI nunca lista
// analytics).
// =====================================================================

async function expectMatrixClean(client: PrismaClient) {
  const matrix = await countOrphans(client);
  const summary = summarizeOrphans(matrix);
  if (!summary.clean) {
    throw new Error(`MATRIZ ANTI-ÓRFÃ SUJA — ${summary.detail}`);
  }
  return matrix;
}

// =====================================================================
// CAMADA 1 — HERMÉTICA: schema real + mundo completo + erasure por raiz
// =====================================================================

describe('anti-orfão · camada hermética (cascates do schema sob o reset)', () => {
  test('apagar Player/Account/Guild/WorldBoss pela raiz NÃO deixa NENHUM órfão', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gm-orphan-'));
    const client = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'custom.db')}` } } });
    try {
      const applied = await applyPendingMigrations(client);
      expect(applied).toBeGreaterThanOrEqual(1);

      // ===== mundo completo (toda tabela com FK ganha LINHA) =====
      const account = await client.account.create({ data: { username: 'qa_orphan', usernameLower: 'qa_orphan' } });
      const guild = await client.guild.create({ data: { name: 'QA Orphan Guild', leaderId: 'pending' } });
      const player = await client.player.create({
        data: { name: 'QA Orphan Guerreiro', race: 'humano', accountId: account.id, guildId: guild.id },
      });
      await client.account.update({ where: { id: account.id }, data: { activePlayerId: player.id } });
      await client.guild.update({ where: { id: guild.id }, data: { leaderId: player.id } });
      await client.session.create({ data: { token: 'tok-orphan', accountId: account.id, expiresAt: new Date(Date.now() + 3600_000) } });
      await client.walletTransaction.create({
        data: { playerId: player.id, accountId: account.id, currency: 'zeni', amount: 100, type: 'earn', source: 'battle', balanceBefore: 0, balanceAfter: 100 },
      });
      await client.questProgress.create({ data: { playerId: player.id, questId: 'daily_battle_1', kind: 'daily', period: '2026-09-15', target: 3 } });
      await client.achievementState.create({ data: { playerId: player.id, achievementId: 'first_blood', progress: 1 } });
      const season = await client.season.create({ data: { name: 'Temporada QA', number: 1, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86400_000) } });
      await client.seasonRankEntry.create({ data: { seasonId: season.id, playerId: player.id, points: 10, wins: 1 } });
      await client.purchase.create({ data: { accountId: account.id, product: 'cosmetic_aura_gold' } });
      await client.cosmeticOwned.create({ data: { accountId: account.id, cosmetic: 'aura_gold' } });
      await client.requestDedup.create({ data: { playerId: player.id, requestId: 'req-orphan-1' } });
      await client.activity.create({ data: { playerId: player.id, kind: 'train', endsAt: new Date(Date.now() + 60_000) } });
      await client.inventoryStack.create({ data: { playerId: player.id, itemId: 'erva_medicinal', quantity: 2 } });
      const marketBuyer = await client.player.create({
        data: { name: 'QA Market Buyer', race: 'humano' },
      });
      const marketListing = await client.marketListing.create({
        data: {
          sellerId: player.id,
          kind: 'material',
          itemId: 'erva_medicinal',
          itemName: 'Erva Medicinal',
          itemIcon: '🌿',
          currency: 'zeni',
          unitPrice: 10,
          quantity: 1,
          quantityRemaining: 0,
          status: 'sold',
          soldAt: new Date(),
        },
      });
      await client.marketTrade.create({
        data: {
          listingId: marketListing.id,
          buyerId: marketBuyer.id,
          sellerId: player.id,
          quantity: 1,
          unitPrice: 10,
          totalPrice: 10,
          currency: 'zeni',
        },
      });
      await client.craftJob.create({
        data: {
          playerId: player.id,
          recipeId: 'capsula_recuperacao_simples',
          outputItemId: 'capsula_recuperacao_simples',
          outputQuantity: 1,
          outputKind: 'player_item',
          endsAt: new Date(Date.now() + 60_000),
        },
      });
      // doação com player E guild vivos (a célula LÓGICA precisa de linha)
      await client.guildDonation.create({ data: { playerId: player.id, guildId: guild.id, amount: 500 } });
      const boss = await client.worldBoss.create({
        data: { name: 'QA Boss', emoji: '👹', maxHp: 1000, currentHp: 900, endsAt: new Date(Date.now() + 72 * 3600_000) },
      });
      await client.worldBossDamage.create({ data: { bossId: boss.id, playerId: player.id, damage: 100, attacks: 2 } });

      // sanity: matriz limpa com o mundo vivo + TODAS as células com linha
      const seeded = await expectMatrixClean(client);
      expect(seeded).toHaveLength(FK_MATRIX.length);
      const liveCounts = await Promise.all([
        client.session.count(), client.walletTransaction.count(), client.questProgress.count(),
        client.achievementState.count(), client.seasonRankEntry.count(), client.purchase.count(),
        client.cosmeticOwned.count(), client.requestDedup.count(), client.activity.count(),
        client.guildDonation.count(), client.worldBossDamage.count(),
        client.marketListing.count(), client.marketTrade.count(),
      ]);
      expect(liveCounts.every((c) => c > 0)).toBe(true);

      // ===== ERASURE PELA RAIZ (a MESMA sequência de um reset total) =====
      // ⚠ GuildDonation.guildId não tem FK — limpeza MANUAL antes da raiz
      // (é o que a exclusão de guilda do admin faz; aqui prova o reset)
      await client.$transaction(async (tx) => {
        await tx.account.updateMany({ data: { activePlayerId: null } });
        await tx.player.deleteMany({ where: { isBot: false } }); // (a) humanos (doações caem pelo FK playerId)
        await tx.guildDonation.deleteMany({});                   // (b) doações restantes (sem FK de guildId!)
        await tx.account.deleteMany({});                          // (c) contas
        await tx.guild.deleteMany({});                            // (d) guildas
        await tx.worldBoss.deleteMany({});                        // (e) bosses
      });

      // ===== PROVAS: matriz completa + PRAGMA =====
      const matrix = await expectMatrixClean(client);
      expect(matrix).toHaveLength(FK_MATRIX.length);
      const fkCheck = (await client.$queryRawUnsafe('PRAGMA foreign_key_check;')) as unknown[];
      expect(fkCheck).toHaveLength(0);

      // guilda e player SUMIRAM; nada sobrou nas tabelas escopadas
      expect(await client.guild.count()).toBe(0);
      expect(await client.player.count({ where: { isBot: false } })).toBe(0);
      expect(await client.account.count()).toBe(0);
      expect(await client.guildDonation.count()).toBe(0);
      expect(await client.worldBossDamage.count()).toBe(0);
      expect(await client.session.count()).toBe(0);
      expect(await client.walletTransaction.count()).toBe(0);
      expect(await client.questProgress.count()).toBe(0);
      expect(await client.achievementState.count()).toBe(0);
      expect(await client.requestDedup.count()).toBe(0);
      expect(await client.activity.count()).toBe(0);
      expect(await client.marketListing.count()).toBe(0);
      expect(await client.marketTrade.count()).toBe(0);
      // Season é estrutura do sistema: fica (a entrada de ranking dela caiu com o player)
      expect(await client.season.count()).toBe(1);
      expect(await client.seasonRankEntry.count()).toBe(0);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =====================================================================
// CAMADA 2 — BANCO VIVO (guardião: órfão = suíte vermelha)
// =====================================================================

describe('anti-orfão · banco vivo de dev (guardião permanente do reset)', () => {
  liveDbTest('NENHUMA célula da matriz do banco de dev tem linha órfã', async () => {
    const dbPath = resolveDbFilePath();
    const client = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    try {
      const matrix = await countOrphans(client);
      const summary = summarizeOrphans(matrix);
      if (!summary.clean) {
        throw new Error(`MATRIZ ANTI-ÓRFÃ SUJA (banco vivo) — ${summary.detail}`);
      }
      expect(matrix).toHaveLength(FK_MATRIX.length);
      const fkCheck = (await client.$queryRawUnsafe('PRAGMA foreign_key_check;')) as unknown[];
      expect(fkCheck).toHaveLength(0);
    } finally {
      await client.$disconnect();
    }
  });
});
