// Testa a migração v0.5 em CÓPIA do banco real (política de preservação):
//  1. snapshot ANTES (todos os players + boss);
//  2. migrate deploy na cópia;
//  3. snapshot DEPOIS — players devem ser IDÊNTICOS;
//  4. novas estruturas (Player.cosmeticsEquipped, GameMeta) devem existir.
import { execSync } from 'child_process';
import { copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const SRC = join(ROOT, 'db/custom.db');
const TMP = join(ROOT, 'db/migration-test-v05.db');
const url = `file:${TMP}`;

function snapshot(db: PrismaClient) {
  return db.player.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true, name: true, race: true, level: true, xp: true, zeni: true,
      crystals: true, hp: true, strength: true, defense: true, speed: true,
      ki: true, isBot: true, accountId: true, guildId: true, avatarUrl: true,
      battlesWon: true, battlesLost: true,
    },
  });
}

async function main() {
  // copia db + WAL + SHM (sem o WAL a cópia ficaria num estado antigo —
  // o SQLite consolida transações no arquivo principal apenas no checkpoint)
  copyFileSync(SRC, TMP);
  try { copyFileSync(`${SRC}-wal`, `${TMP}-wal`); } catch { /* sem WAL = já consolidado */ }
  try { copyFileSync(`${SRC}-shm`, `${TMP}-shm`); } catch { /* idem */ }
  const before = new PrismaClient({ datasources: { db: { url } } });
  const snapBefore = await snapshot(before);
  await before.$disconnect();

  execSync(`bunx prisma migrate deploy`, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const after = new PrismaClient({ datasources: { db: { url } } });
  const snapAfter = await snapshot(after);

  // players preservados?
  const beforeJson = JSON.stringify(snapBefore);
  const afterJson = JSON.stringify(snapAfter);
  console.log(`players antes/depois: ${snapBefore.length}/${snapAfter.length}`);
  console.log(`players idênticos: ${beforeJson === afterJson ? 'SIM ✓' : 'NÃO ✗'}`);
  if (beforeJson !== afterJson) {
    for (let i = 0; i < Math.max(snapBefore.length, snapAfter.length); i++) {
      if (JSON.stringify(snapBefore[i]) !== JSON.stringify(snapAfter[i])) {
        console.log('diff em:', snapBefore[i]?.id ?? snapAfter[i]?.id);
        console.log('antes:', JSON.stringify(snapBefore[i]));
        console.log('depois:', JSON.stringify(snapAfter[i]));
      }
    }
  }

  // novas estruturas?
  const cols = await after.$queryRawUnsafe(`PRAGMA table_info(Player)`);
  const hasCol = (cols as Array<{ name: string }>).some((c) => c.name === 'cosmeticsEquipped');
  const tables = await after.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='GameMeta'`
  );
  console.log(`coluna Player.cosmeticsEquipped: ${hasCol ? 'OK ✓' : 'FALTA ✗'}`);
  console.log(`tabela GameMeta: ${(tables as unknown[]).length === 1 ? 'OK ✓' : 'FALTA ✗'}`);
  const accounts = await after.account.count();
  console.log(`contas preservadas: ${accounts}`);
  await after.$disconnect();

  rmSync(TMP);
  if (beforeJson !== afterJson || !hasCol || (tables as unknown[]).length !== 1) {
    console.error('MIGRAÇÃO REPROVADA NA CÓPIA — não aplicar no real');
    process.exit(1);
  }
  console.log('MIGRAÇÃO APROVADA NA CÓPIA ✓');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
