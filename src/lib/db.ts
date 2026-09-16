import { PrismaClient } from '@prisma/client'
import { resolveDbUrl } from '@/lib/db-path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// v0.9.14 — PORTABILIDADE DE DEPLOY: a url do datasource é resolvida em
// runtime (src/lib/db-path.ts) a partir de candidatos que existem no
// disco, em vez de confiar cegamente no DATABASE_URL absoluto do .env
// local (que não existe fora deste sandbox). Em dev o resultado é o
// MESMO arquivo de sempre; em deploy, o primeiro caminho válido vence.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolveDbUrl() } },
    log: ['error', 'warn'],
  })

// SQLite em modo WAL: leitores não bloqueiam o escritor — essencial para o
// polling de estado conviver com ações transacionais sem SQLITE_BUSY.
// (PRAGMAs RETORNAM valores no SQLite → sempre $queryRaw, nunca execute)
db.$queryRaw`PRAGMA journal_mode=WAL;`.catch(() => undefined);
db.$queryRaw`PRAGMA busy_timeout=5000;`.catch(() => undefined);
// v0.9.2 — VELOCIDADE DAS AÇÕES (coletar recompensas etc.):
// synchronous=NORMAL é a configuração recomendada para o modo WAL — os
// commits deixam de fazer fsync a cada transação (só nos checkpoints).
// Em discos de rede/lentos da hospedagem, cada fsync custava centenas de
// ms; uma ação com 3-4 transações de escrita somava VÁRIOS SEGUNDOS.
// Segurança: com WAL + NORMAL nada é perdido em queda do processo; apenas
// uma queda de energia/SO pode perder os últimos segundos — aceitável
// para um jogo de navegador (o padrão do SQLite moderno em WAL).
db.$queryRaw`PRAGMA synchronous=NORMAL;`.catch(() => undefined);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
