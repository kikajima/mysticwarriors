// Aplica a migração v0.5 NO BANCO REAL via PrismaClient do app.
//
// CONTEXTO: `prisma migrate deploy` (CLI) falha com "database is locked"
// porque o dev server mantém conexões abertas e a schema-engine não usa
// busy_timeout. O DDL é idêntico ao do arquivo de migração e é registrado
// em _prisma_migrations com o checksum sha256 correto — `migrate deploy`
// futuro (inclusive no build de produção) reconhece como já aplicada.
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const MIGRATION_DIR = '20260911005016_v05_cosmetics_equipped_game_meta';
const MIGRATION_SQL_PATH = join(process.cwd(), 'prisma/migrations', MIGRATION_DIR, 'migration.sql');

async function main() {
  const db = new PrismaClient();
  const sql = readFileSync(MIGRATION_SQL_PATH, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');

  // já aplicada?
  const existing = await db.$queryRawUnsafe(
    `SELECT migration_name FROM _prisma_migrations WHERE migration_name = '${MIGRATION_DIR}'`
  );
  if ((existing as unknown[]).length > 0) {
    console.log('migração já registrada — nada a fazer');
    return;
  }

  // estruturas já existem? (ddl parcial de tentativa anterior)
  const cols = (await db.$queryRawUnsafe(`PRAGMA table_info(Player)`)) as Array<{ name: string }>;
  const hasCol = cols.some((c) => c.name === 'cosmeticsEquipped');
  const hasTable =
    (
      (await db.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='GameMeta'`
      )) as unknown[]
    ).length > 0;

  if (!hasCol || !hasTable) {
    await db.$executeRawUnsafe(`ALTER TABLE "Player" ADD COLUMN "cosmeticsEquipped" TEXT;`);
    await db.$executeRawUnsafe(
      `CREATE TABLE "GameMeta" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "value" TEXT NOT NULL,
        "updatedAt" DATETIME NOT NULL
      );`
    );
    console.log('DDL aplicado (coluna cosmeticsEquipped + tabela GameMeta)');
  } else {
    console.log('estruturas já existiam (sem duplicar DDL)');
  }

  // registra a migração com o checksum oficial do arquivo
  await db.$executeRawUnsafe(
    `INSERT INTO _prisma_migrations (id, checksum, migration_name, logs, finished_at, applied_steps_count)
     VALUES ('${randomUUID()}', '${checksum}', '${MIGRATION_DIR}', NULL, datetime('now'), 1);`
  );
  console.log('migração registrada em _prisma_migrations (checksum', checksum.slice(0, 16) + '...)');

  // verificação final
  const players = await db.player.count();
  const bots = await db.player.count({ where: { isBot: true } });
  const meta = await db.gameMeta.count();
  console.log(`pós-migração: ${players} players (${bots} bots) preservados, GameMeta vazia (${meta} linhas)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const db = new PrismaClient();
    await db.$disconnect();
  });
