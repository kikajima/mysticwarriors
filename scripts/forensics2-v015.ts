import { db } from '@/lib/db';
async function main() {
  const all = await db.adminActionLog.count();
  const hits = await db.adminActionLog.findMany({ where: { OR: [{ targetName: { contains: 'isurom' } }, { targetName: { contains: 'Principe' } }, { targetName: { contains: 'Taurion' } }] } });
  console.log('=== TOTAL LOG ENTRIES ===', all);
  console.log('=== ENTRIES MENCIONANDO FANTASMAS (Aisurom/Taurion) ===', hits.length);
  for (const h of hits) console.log(JSON.stringify({ at: h.createdAt.toISOString(), target: h.targetName, result: h.result, details: (h.details ?? '').slice(0, 500) }));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
