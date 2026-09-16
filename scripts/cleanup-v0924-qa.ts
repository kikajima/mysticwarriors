// =====================================================================
// v0.9.24 — Limpeza da conta QA da FASE 0 (triagem) + dados de teste.
// ---------------------------------------------------------------------
// A triagem criou "Principe QAum" (Namekuseijin, Especialista em Ki)
// para reproduzir os 9 problemas do playtest. Critério de aceite:
// banco pristino (0 contas, 15 bots). Deleta conta, personagem, sessão
// e registros derivados — NUNCA toca nos bots nem em dados reais.
// Uso: bun run scripts/cleanup-v0924-qa.ts
// =====================================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.player.findMany({
    where: { name: { in: ['Principe QAum', 'Príncipe Aisurom'] } },
    select: { id: true, name: true, accountId: true, isBot: true },
  });
  if (targets.length === 0) {
    console.log('Nenhum personagem QA encontrado — banco já pristino.');
    return;
  }
  for (const p of targets) {
    if (p.isBot) continue;
    // registros derivados do personagem
    await prisma.activity.deleteMany({ where: { playerId: p.id } });
    await prisma.walletTransaction.deleteMany({ where: { playerId: p.id } });
    await prisma.questProgress.deleteMany({ where: { playerId: p.id } });
    await prisma.achievementState.deleteMany({ where: { playerId: p.id } });
    await prisma.worldBossDamage.deleteMany({ where: { playerId: p.id } });
    await prisma.requestDedup.deleteMany({ where: { playerId: p.id } });
    // a conta (se houver) e suas sessões
    const accountId = p.accountId;
    await prisma.player.delete({ where: { id: p.id } });
    if (accountId) {
      await prisma.session.deleteMany({ where: { accountId } });
      await prisma.purchase.deleteMany({ where: { accountId } });
      await prisma.account.deleteMany({ where: { id: accountId } });
    }
    console.log(`removido: ${p.name} (${p.id})`);
  }
  const accounts = await prisma.account.count();
  const humans = await prisma.player.count({ where: { isBot: false } });
  const bots = await prisma.player.count({ where: { isBot: true } });
  console.log(`final: ${accounts} contas · ${humus(humans)} humanos · ${bots} bots`);
}

const humus = (n: number) => n;

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
