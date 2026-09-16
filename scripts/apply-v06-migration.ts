/**
 * v0.6 — aplica a migração "20260911031500_v06_professions" com segurança:
 *  1. valida o DDL numa CÓPIA do banco (contagens idênticas antes/depois);
 *  2. aplica no banco REAL (conta/contas jamais tocadas — coluna aditiva);
 *  3. registra a migração em _prisma_migrations (checksum sha256 oficial),
 *     mantendo `prisma migrate status` consistente.
 * Uso: bun scripts/apply-v06-migration.ts          (dry-run: mostra plano)
 *      bun scripts/apply-v06-migration.ts --confirm (aplica de verdade)
 */
import { db } from '../src/lib/db';
import { createHash } from 'node:crypto';
import { readFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';

const MIGRATION_NAME = '20260911031500_v06_professions';
const SQL_PATH = `prisma/migrations/${MIGRATION_NAME}/migration.sql`;
const DRY = !process.argv.includes('--confirm');

async function counts(urlDb: typeof db) {
  return {
    accounts: await urlDb.account.count(),
    players: await urlDb.player.count(),
    humans: await urlDb.player.count({ where: { isBot: false } }),
    bots: await urlDb.player.count({ where: { isBot: true } }),
  };
}

async function main() {
  const sql = readFileSync(SQL_PATH, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  console.log(`[v06] migração: ${MIGRATION_NAME}`);
  console.log(`[v06] checksum: ${checksum}`);
  console.log(`[v06] modo: ${DRY ? 'DRY-RUN (nada é aplicado)' : 'APLICAR'}`);

  const before = await counts(db);
  console.log('[v06] banco real ANTES:', before);

  // já aplicada?
  const existing = await db.$queryRawUnsafe(
    `SELECT id, checksum FROM _prisma_migrations WHERE migration_name = '${MIGRATION_NAME}'`
  ) as Array<{ id: string; checksum: string }>;
  if (existing.length > 0) {
    console.log('[v06] migração JÁ registrada no banco — nada a fazer.');
    return;
  }

  // coluna já existe no banco real?
  const cols = await db.$queryRawUnsafe(`PRAGMA table_info(Player)`) as Array<{ name: string }>;
  const hasCol = cols.some((c) => c.name === 'professions');
  console.log(`[v06] coluna professions no banco real: ${hasCol ? 'JÁ EXISTE' : 'ausente'}`);

  if (DRY) {
    console.log('[v06] dry-run concluído — rode com --confirm para aplicar.');
    return;
  }

  // ===== 1. valida em CÓPIA =====
  const copyPath = 'db/v06-validate-copy.db';
  if (existsSync(copyPath)) unlinkSync(copyPath);
  // checkpoint do WAL numa cópia consistente
  execSync(`sqlite3 db/custom.db "VACUUM INTO 'db/v06-validate-copy.db'" 2>/dev/null || cp db/custom.db ${copyPath}`, { stdio: 'ignore' });
  const { PrismaClient } = await import('@prisma/client');
  const copyDb = new PrismaClient({ datasources: { db: { url: `file:${process.cwd()}/db/v06-validate-copy.db` } } });
  const copyBefore = await counts(copyDb);
  await copyDb.$executeRawUnsafe(sql.trim());
  const copyCols = await copyDb.$queryRawUnsafe(`PRAGMA table_info(Player)`) as Array<{ name: string }>;
  const copyHas = copyCols.some((c) => c.name === 'professions');
  const copyAfter = await counts(copyDb);
  await copyDb.$disconnect();
  unlinkSync(copyPath);
  console.log('[v06] CÓPIA antes:', copyBefore, 'depois:', copyAfter, '| coluna:', copyHas);
  if (!copyHas || JSON.stringify(copyBefore) !== JSON.stringify(copyAfter)) {
    throw new Error('[v06] VALIDAÇÃO FALHOU na cópia — abortando sem tocar o banco real.');
  }

  // ===== 2. aplica no banco REAL =====
  if (!hasCol) {
    await db.$executeRawUnsafe(sql.trim());
    console.log('[v06] coluna professions ADICIONADA ao banco real.');
  } else {
    console.log('[v06] coluna já existia no banco real (DDL ignorado).');
  }

  // ===== 3. registra a migração (formato oficial do Prisma) =====
  await db.$executeRawUnsafe(
    `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, applied_steps_count)
     VALUES ('${MIGRATION_NAME}', '${checksum}', datetime('now'), '${MIGRATION_NAME}', NULL, 1)`
  );
  const after = await counts(db);
  console.log('[v06] banco real DEPOIS:', after);
  if (before.accounts !== after.accounts) throw new Error('[v06] CONTAS MUDARAM — ERRO CRÍTICO!');
  console.log('[v06] OK: contas intactas, migração registrada.');
  await db.$disconnect();
}

main().catch((e) => {
  console.error('[v06] FALHA:', e instanceof Error ? e.message : e);
  process.exit(1);
});
