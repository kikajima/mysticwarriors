import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: `file:${join(process.cwd(), 'db/custom.db')}` } },
});

async function main() {
  const accounts = await db.account.count();
  const players = await db.player.count();
  const humans = await db.player.count({ where: { isBot: false } });
  const cosmetics = await db.cosmeticOwned.count();
  const activities = await db.activity.count();
  const purchases = await db.purchase.count();
  console.log(
    JSON.stringify({ accounts, players, humans, cosmetics, activities, purchases }, null, 2)
  );
  const sample = await db.player.findMany({
    where: { isBot: false },
    select: { id: true, name: true, level: true, xp: true, zeni: true, crystals: true, strength: true, accountId: true },
    take: 5,
  });
  console.log('human players:', JSON.stringify(sample, null, 2));
  const owned = await db.cosmeticOwned.findMany({ take: 20, select: { cosmetic: true, equipped: true, accountId: true } });
  console.log('cosmetics owned:', JSON.stringify(owned, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
