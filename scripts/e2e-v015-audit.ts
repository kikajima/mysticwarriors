import { db } from '@/lib/db';
async function main() {
  const logs = await db.adminActionLog.findMany({ orderBy: { createdAt: 'desc' }, take: 3 });
  for (const l of logs) console.log(l.createdAt.toISOString(), '|', l.action, '|', l.targetName, '|', l.result, '|', (l.details ?? '').slice(0, 160));
  await db.$disconnect();
}
main();
