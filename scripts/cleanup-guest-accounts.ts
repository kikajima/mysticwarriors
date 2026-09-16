// =====================================================================
// Limpeza de contas de CONVIDADO órfãs no banco de dev (v0.9.5)
// ---------------------------------------------------------------------
// O smoke test cria uma sessão de convidado; o logout invalida a
// sessão, mas a linha da conta (username null) fica no banco — e o
// teste de persistência espera 0 contas no sandbox.
// Aqui apagamos SOMENTE: contas de convidado (sem username), SEM
// personagem e SEM sessão ativa. Contas reais e convidados em jogo
// nunca são tocados.
// Uso: bun run scripts/cleanup-guest-accounts.ts
// =====================================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const orphans = await prisma.account.findMany({
    where: {
      username: null,
      players: { none: {} },
      // sem NENHUMA sessão ativa (revogadas e expiradas não contam)
      sessions: { none: { revokedAt: null, expiresAt: { gt: now } } },
    },
    select: { id: true },
  });
  if (orphans.length === 0) {
    console.log('Nenhuma conta de convidado órfã — banco já limpo.');
    return;
  }
  const result = await prisma.account.deleteMany({
    where: { id: { in: orphans.map((o) => o.id) } },
  });
  console.log(`Contas de convidado órfãs removidas: ${result.count}`);
}

main()
  .catch((err) => {
    console.error('FALHA na limpeza —', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
