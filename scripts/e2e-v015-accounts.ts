import { db } from '@/lib/db';
async function main() {
  const accounts = await db.account.findMany({ select: { username: true, supabaseUserId: true, _count: { select: { players: true } } } });
  for (const a of accounts) console.log(a.username, '| players:', a._count.players, '| uuid:', a.supabaseUserId?.slice(0, 13));
  await db.$disconnect();
}
main();
