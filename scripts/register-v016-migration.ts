import { createHash, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const client = new PrismaClient();
const sql = readFileSync('prisma/migrations/20260916110000_v016_remove_gender/migration.sql', 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
const name = '20260916110000_v016_remove_gender';

const existing = await client.$queryRawUnsafe(
  `SELECT migration_name FROM _prisma_migrations WHERE migration_name = '${name}'`
) as Array<{ migration_name: string }>;

if (existing.length === 0) {
  // v016: a coluna JÁ foi dropada pelo db:push — registra como aplicada
  await client.$executeRawUnsafe(
    `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
     VALUES ('${randomUUID()}', '${checksum}', datetime('now'), '${name}', 1);`
  );
  console.log('registrada como aplicada:', name);
} else {
  console.log('já registrada:', name);
}

const rows = await client.$queryRawUnsafe(
  `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
) as Array<{ migration_name: string }>;
console.log('total aplicadas:', rows.length);
await client.$disconnect();
