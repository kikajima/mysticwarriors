import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  await db.player.update({ where: { id: 'cmtvqcmj90002mht8kse8lk4c' }, data: { zeni: 100000 } });
  const p = await db.player.findUnique({ where: { id: 'cmtvqcmj90002mht8kse8lk4c' } });
  console.log('zeni agora:', p?.zeni);
}
main().finally(() => db.$disconnect());
