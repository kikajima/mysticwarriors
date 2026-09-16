import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// Limpa dados criados pelo e2e-p0-smoke.sh, preservando TUDO o mais
// (Sonjin, bots, e qualquer dado real). Idempotente e seguro.

async function main() {
  // contas de convidado criadas pelo smoke test
  const guestAccounts = await db.account.findMany({
    where: { username: { contains: 'Testador' } },
    select: { id: true, username: true },
  });
  const accountIds = guestAccounts.map((a) => a.id);

  // personagens criados pelo smoke test (por nome OU por conta)
  const players = await db.player.findMany({
    where: {
      OR: [
        { name: { startsWith: 'TP0' } },
        { name: { startsWith: 'Teste P0' } },
        { accountId: { in: accountIds } },
      ],
    },
    select: { id: true, name: true },
  });
  const playerIds = players.map((p) => p.id);
  console.log('contas a remover:', guestAccounts.length);
  console.log('personagens a remover:', players.map((p) => p.name));

  if (playerIds.length > 0) {
    await db.walletTransaction.deleteMany({ where: { playerId: { in: playerIds } } });
    await db.questProgress.deleteMany({ where: { playerId: { in: playerIds } } });
    await db.achievementState.deleteMany({ where: { playerId: { in: playerIds } } });
    await db.worldBossDamage.deleteMany({ where: { playerId: { in: playerIds } } });
    await db.seasonRankEntry.deleteMany({ where: { playerId: { in: playerIds } } });
    await db.guildDonation.deleteMany({ where: { playerId: { in: playerIds } } });
    await db.purchase.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.cosmeticOwned.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.analyticsEvent.deleteMany({ where: { playerId: { in: playerIds } } });
    await db.player.deleteMany({ where: { id: { in: playerIds } } });
  }

  // sessões + contas
  if (accountIds.length > 0) {
    await db.session.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.account.deleteMany({ where: { id: { in: accountIds } } });
  }

  // contagem final
  const accounts = await db.account.count();
  const playersTotal = await db.player.count();
  const bots = await db.player.count({ where: { isBot: true } });
  console.log('=== APÓS LIMPEZA ===');
  console.log(`accounts: ${accounts} | players: ${playersTotal} (bots: ${bots}, humanos: ${playersTotal - bots})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
