import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const p = await db.player.findUnique({ where: { id: 'cmtvqcmj90002mht8kse8lk4c' } });
  console.log('missão ativa:', p?.missionId, 'termina em:', p?.missionEndsAt?.toISOString());
  await db.player.update({
    where: { id: 'cmtvqcmj90002mht8kse8lk4c' },
    data: { missionEndsAt: new Date(Date.now() - 60000) },
  });
  console.log('missão adiantada para o passado');
}
main().finally(() => db.$disconnect());
