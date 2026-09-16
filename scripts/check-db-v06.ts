import { db } from '../src/lib/db';
async function main() {
  console.log('accounts:', await db.account.count());
  console.log('players:', await db.player.count());
  console.log('humans:', await db.player.count({ where: { isBot: false } }));
  console.log('gameMeta:', await db.gameMeta.findMany());
  await db.$disconnect();
}
main();
