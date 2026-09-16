// Testa se PRAGMA per-connection (synchronous) alcança TODAS as conexões
// do pool do Prisma SQLite — decide se a otimização é efetiva.
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  await db.$queryRaw`PRAGMA journal_mode=WAL;`;
  await db.$queryRaw`PRAGMA synchronous=NORMAL;`;

  // dispara muitas leituras concorrentes para o pool criar/rotar conexões
  const results = await Promise.all(
    Array.from({ length: 40 }, () => db.$queryRawUnsafe('PRAGMA synchronous;') as Promise<Array<{ synchronous: number }>>)
  );
  const values = results.map((r) => r[0]?.synchronous);
  const unique = [...new Set(values)];
  console.log('valores de synchronous vistos:', unique.join(','));
  console.log('journal_mode:', JSON.stringify(await db.$queryRawUnsafe('PRAGMA journal_mode;')));
  if (unique.length === 1 && unique[0] === 1) {
    console.log('OK: pragma NORMAL visível em todas as consultas (pool única conexão ou pragma pegou)');
  } else if (unique.includes(2)) {
    console.log('PROBLEMA: existem conexões com synchronous=FULL (2) — pragma não cobre o pool todo');
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});