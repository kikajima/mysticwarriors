// =====================================================================
// E2E v0.14 — CLEANUP (banco de dev volta a PRISTINO)
// ---------------------------------------------------------------------
// Apaga TODO o dado de QA criado pelo E2E (contas, personagens humanos,
// guildas de jogador). v0.15: a guilda de sistema NÃO EXISTE MAIS
// (mecanismo extinto) — guildas = 0 é o estado pristino PERMANENTE: nada
// é recriado por bootstrap em visita futura.
//
// SOBREVIVEM (estrutura/história, não dado de jogador):
//  * bots (conteúdo de sistema);
//  * Season/GameMeta (estrutura);
//  * analytics (histórico anônimo de dev);
//  * AdminActionLog (a ACCOUNTABILITY das exclusões é o registro
//    histórico — as entradas do E2E permanecem como prova viva do
//    funcionamento; a tabela não tem FK por projeto);
//  * ledger de bots.
//
// Prova final: matriz anti-órfã completa (a MESMA da suíte) + contagens.
// Uso: bun scripts/e2e-v014-cleanup.ts
// =====================================================================

import { db } from '@/lib/db';
import { countOrphans, summarizeOrphans } from '@/lib/game/orphanCheck';

async function main() {
  console.log('=== cleanup E2E v0.14 — banco de dev → pristino ===');

  const before = {
    humans: await db.player.count({ where: { isBot: false } }),
    accounts: await db.account.count(),
    guilds: await db.guild.count(),
    logs: await db.adminActionLog.count(),
  };
  console.log('antes:', JSON.stringify(before));

  await db.$transaction(async (tx) => {
    // 1) contas: activePlayerId solto + raiz Account (cascade: sessions,
    //    purchases, cosmetics; Player.accountId SET NULL)
    await tx.account.updateMany({ data: { activePlayerId: null } });
    await tx.account.deleteMany({});
    // 2) humanos (cascade: activities, quests, conquistas, ledger do
    //    player, dano a boss, dedups, doações DELE)
    await tx.player.deleteMany({ where: { isBot: false } });
    // 3) doações restantes (GuildDonation.guildId NÃO tem FK — limpeza
    //    manual; após (2) só sobrariam as de bots, que não doam)
    await tx.guildDonation.deleteMany({});
    // 4) TODAS as guildas (só existem as de jogadores — v0.15: guildas = 0
    //    é o estado pristino definitivo, nenhum bootstrap recria nada)
    await tx.guild.deleteMany({});
    // 5) bosses de QA (dano caiu com os players; instância limpa)
    await tx.worldBoss.deleteMany({});
  });

  const after = {
    humans: await db.player.count({ where: { isBot: false } }),
    bots: await db.player.count({ where: { isBot: true } }),
    accounts: await db.account.count(),
    guilds: await db.guild.count(),
    donations: await db.guildDonation.count(),
    sessions: await db.session.count(),
    wallet: await db.walletTransaction.count(),
    logs: await db.adminActionLog.count(),
  };
  console.log('depois:', JSON.stringify(after));

  const summary = summarizeOrphans(await countOrphans(db));
  console.log('matriz anti-órfã:', summary.clean ? `LIMPA — ${summary.detail}` : `SUJA — ${summary.detail}`);
  if (!summary.clean) process.exit(1);
  console.log('cleanup concluído — banco pristino.');
  await db.$disconnect();
}

main().catch((err) => {
  console.error('FALHA NO CLEANUP:', err);
  process.exit(1);
});
