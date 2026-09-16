// Verificação de integridade do banco (contagens + amostras)
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const accounts = await db.account.count();
  const guests = await db.account.count({ where: { isGuest: true } });
  const players = await db.player.count();
  const bots = await db.player.count({ where: { isBot: true } });
  const humans = players - bots;
  const sessions = await db.session.count();
  const wallets = await db.walletTransaction.count();
  const guilds = await db.guild.count();
  const guildDonations = await db.guildDonation.count();
  const quests = await db.questProgress.count();
  const achievements = await db.achievementState.count();
  const bossDamage = await db.worldBossDamage.count();
  const cosmetics = await db.cosmeticOwned.count();
  const analyticsEvents = await db.analyticsEvent.count();

  console.log('=== CONTAGENS DO BANCO ===');
  console.log(`Accounts: ${accounts} (guests: ${guests})`);
  console.log(`Players: ${players} (humanos: ${humans}, bots: ${bots})`);
  console.log(`Sessions: ${sessions}`);
  console.log(`WalletTransactions: ${wallets}`);
  console.log(`Guilds: ${guilds} / Doações: ${guildDonations}`);
  console.log(`QuestProgress: ${quests} / AchievementState: ${achievements}`);
  console.log(`WorldBossDamage: ${bossDamage} / CosmeticOwned: ${cosmetics}`);
  console.log(`AnalyticsEvents: ${analyticsEvents}`);

  const sample = await db.player.findMany({
    where: { isBot: false },
    select: { name: true, level: true, zeni: true, battlesWon: true },
    take: 5,
  });
  console.log('=== AMOSTRA (humanos) ===');
  for (const p of sample) console.log(`- ${p.name} lvl ${p.level} | ${p.zeni} zeni | ${p.battlesWon}W`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
