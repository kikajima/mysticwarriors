// Leitura direta do HP do chefe ativo (antes/depois do restart do servidor)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const boss = await db.worldBoss.findFirst({ where: { status: 'active' } });
if (!boss) { console.log('sem chefe ativo'); process.exit(0); }
const dmg = await db.worldBossDamage.aggregate({ where: { bossId: boss.id }, _sum: { damage: true }, _count: true });
console.log(JSON.stringify({
  boss: boss.name, hp: boss.currentHp, maxHp: boss.maxHp,
  totalDano: dmg._sum.damage ?? 0, atacantes: dmg._count,
}));
await db.$disconnect();
