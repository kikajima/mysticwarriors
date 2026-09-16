// Registra a migração v0.9.24 (freeHealDay) como aplicada no banco de dev
// (a coluna já existe via db:push; sem isto o migrador de boot tentaria
// recriá-la). Uso único: bun run scripts/register-v0924-migration.ts
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { db } from '../src/lib/db';

const name = '20260912140000_v0924_free_heal_day';
const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');

const exists = (await db.$queryRawUnsafe(
  `SELECT migration_name FROM _prisma_migrations WHERE migration_name = '${name}'`
)) as Array<{ migration_name: string }>;
if (exists.length === 0) {
  await db.$executeRawUnsafe(
    `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
     VALUES ('${randomUUID()}', '${checksum}', datetime('now'), '${name}', 1);`
  );
  console.log('registrada:', name);
} else {
  console.log('já registrada:', name);
}
await db.$disconnect();
