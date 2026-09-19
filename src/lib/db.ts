import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    transactionOptions: {
      maxWait: 15_000,
      timeout: 30_000,
    },
  });

// A suíte/CI usa o schema SQLite alternativo; produção usa PostgreSQL.
// PRAGMAs existem apenas para a execução SQLite e nunca são enviados ao
// Supabase PostgreSQL.
if ((process.env.DATABASE_URL ?? '').startsWith('file:')) {
  void (async () => {
    try {
      await db.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
      await db.$queryRawUnsafe('PRAGMA busy_timeout=15000;');
      await db.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
    } catch {
      // O banco pode ainda estar sendo inicializado pela fixture de teste.
    }
  })();
}

globalForPrisma.prisma = db;
