// =====================================================================
// Auditoria de dados — contagens antes/depois de migrações (P0)
// Uso: bun scripts/check-data.ts [--json]
// =====================================================================
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const [
    accounts,
    players,
    bots,
    humanPlayers,
    guests,
    realAccounts,
    sessions,
    walletTx,
    questProgress,
    achievementStates,
    guilds,
    guildMembers,
    worldBosses,
    bossDamages,
    seasons,
    purchases,
    cosmeticsOwned,
    analyticsEvents,
    donations,
  ] = await Promise.all([
    db.account.count(),
    db.player.count(),
    db.player.count({ where: { isBot: true } }),
    db.player.count({ where: { isBot: false } }),
    db.account.count({ where: { isGuest: true } }),
    db.account.count({ where: { isGuest: false } }),
    db.session.count(),
    db.walletTransaction.count(),
    db.questProgress.count(),
    db.achievementState.count(),
    db.guild.count(),
    db.player.count({ where: { guildId: { not: null } } }),
    db.worldBoss.count(),
    db.worldBossDamage.count(),
    db.season.count(),
    db.purchase.count(),
    db.cosmeticOwned.count(),
    db.analyticsEvent.count(),
    db.guildDonation.count(),
  ]);

  const summary = {
    accounts,
    players,
    bots,
    humanPlayers,
    guestAccounts: guests,
    realAccounts,
    sessions,
    walletTx,
    questProgress,
    achievementStates,
    guilds,
    guildMembers,
    worldBosses,
    bossDamages,
    seasons,
    purchases,
    cosmeticsOwned,
    analyticsEvents,
    donations,
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary));
  } else {
    console.log('=== AUDITORIA DE DADOS ===');
    for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(20)} ${v}`);
  }

  // Detalhe: personagens com/sem accountId (inclui o caso Sonjin)
  const orphans = await db.player.findMany({
    where: { accountId: null, isBot: false },
    select: { id: true, name: true, level: true, race: true, createdAt: true, zeni: true, battlesWon: true },
  });
  if (orphans.length > 0) {
    console.log('\n--- Personagens SEM conta (órfãos) ---');
    for (const o of orphans) console.log(JSON.stringify(o));
  }

  // Procura qualquer personagem chamado Sonjin (case-insensitive)
  const allPlayers = await db.player.findMany({ select: { id: true, name: true, accountId: true, isBot: true, level: true } });
  const sonjin = allPlayers.filter((p) => p.name.toLowerCase().includes('sonjin'));
  console.log('\n--- Registros "Sonjin" ---');
  console.log(sonjin.length ? JSON.stringify(sonjin, null, 2) : '(nenhum)');

  // Colisões de nome (case-insensitive) entre personagens
  const byLower = new Map<string, number>();
  for (const p of allPlayers) {
    const k = p.name.toLowerCase();
    byLower.set(k, (byLower.get(k) ?? 0) + 1);
  }
  const collisions = [...byLower.entries()].filter(([, n]) => n > 1);
  console.log('\n--- Colisões de nome (case-insensitive) ---');
  console.log(collisions.length ? JSON.stringify(collisions) : '(nenhuma)');

  // Colisões de nome de guilda
  const allGuilds = await db.guild.findMany({ select: { name: true } });
  const gLower = new Map<string, number>();
  for (const g of allGuilds) {
    const k = g.name.toLowerCase();
    gLower.set(k, (gLower.get(k) ?? 0) + 1);
  }
  const gCollisions = [...gLower.entries()].filter(([, n]) => n > 1);
  console.log('\n--- Colisões de guilda (case-insensitive) ---');
  console.log(gCollisions.length ? JSON.stringify(gCollisions) : '(nenhuma)');

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
