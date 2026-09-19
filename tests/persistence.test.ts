import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  splitSqlStatements,
  makeTar,
  extractTar,
  makeTarGz,
  extractTarGz,
  snapshotDbCounts,
  applyPendingMigrations,
  resolveDbFilePath,
} from '../src/lib/game/persistence';

const liveDbTest = process.env.CI === 'true' ? test.skip : test;

function cleanupTempDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // Bun/Windows pode manter o SQLite aberto até o encerramento do processo
    // mesmo após PrismaClient.$disconnect(). Isso é limpeza de fixture, não
    // falha funcional do migrador. Só toleramos os locks transitórios do SO.
    if (process.platform === 'win32' && (code === 'EBUSY' || code === 'EPERM')) return;
    throw err;
  }
}

// =====================================================================
// PERSISTÊNCIA v0.7 — testes unitários
// =====================================================================

describe('splitSqlStatements', () => {
  test('separa statements simples', () => {
    expect(splitSqlStatements('CREATE TABLE a (x INT);\nCREATE TABLE b (y INT);')).toEqual([
      'CREATE TABLE a (x INT)',
      'CREATE TABLE b (y INT)',
    ]);
  });

  test('ponto-e-vírgula dentro de string literal NÃO separa', () => {
    const sql = `INSERT INTO t VALUES ('a;b;c');\nUPDATE t SET v = 'x;;y';`;
    expect(splitSqlStatements(sql)).toEqual([
      `INSERT INTO t VALUES ('a;b;c')`,
      `UPDATE t SET v = 'x;;y'`,
    ]);
  });

  test('escape de aspas simples (\'\') preservado', () => {
    const sql = `INSERT INTO t VALUES ('it''s;fine');`;
    expect(splitSqlStatements(sql)).toEqual([`INSERT INTO t VALUES ('it''s;fine')`]);
  });

  test('comentários -- são preservados dentro do statement', () => {
    const sql = `-- cabeçalho\nCREATE TABLE a (x INT); -- trailing\nALTER TABLE a ADD COLUMN y INT;`;
    expect(splitSqlStatements(sql)).toHaveLength(2);
    expect(splitSqlStatements(sql)[0]).toContain('CREATE TABLE a');
  });

  test('PRAGMA de migrações reais é um statement válido', () => {
    const stmts = splitSqlStatements('PRAGMA defer_foreign_keys=ON;\nPRAGMA foreign_keys=OFF;');
    expect(stmts).toEqual(['PRAGMA defer_foreign_keys=ON', 'PRAGMA foreign_keys=OFF']);
  });

  test('statement final sem ponto-e-vírgula é incluído', () => {
    expect(splitSqlStatements('SELECT 1')).toEqual(['SELECT 1']);
  });
});

describe('tar (escrita/leitura sem dependências)', () => {
  test('round-trip com dados binários e texto', () => {
    const entries = [
      { name: 'custom.db', data: Buffer.from([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0, 1, 2, 255]) },
      { name: 'manifest.json', data: Buffer.from(JSON.stringify({ a: 1 })) },
    ];
    const tar = makeTar(entries);
    // tamanho é múltiplo de 512 e termina com bloco zero
    expect(tar.length % 512).toBe(0);
    const out = extractTar(tar);
    expect(out.map((e) => e.name)).toEqual(['custom.db', 'manifest.json']);
    expect(Buffer.compare(out[0].data, entries[0].data)).toBe(0);
    expect(JSON.parse(out[1].data.toString())).toEqual({ a: 1 });
  });

  test('tamanho exatamente múltiplo de 512 (padding de borda)', () => {
    const data = Buffer.alloc(512, 7);
    const out = extractTar(makeTar([{ name: 'f', data }]));
    expect(out[0].data.length).toBe(512);
    expect(out[0].data[511]).toBe(7);
  });

  test('gzip round-trip', () => {
    const body = Buffer.from('conteúdo repetido '.repeat(100));
    const gz = makeTarGz([{ name: 'arquivo.txt', data: body }]);
    expect(gz[0]).toBe(0x1f); // magic gzip
    expect(gz[1]).toBe(0x8b);
    const out = extractTarGz(gz);
    expect(out[0].name).toBe('arquivo.txt');
    expect(out[0].data.equals(body)).toBe(true);
  });

  test('nome > 99 caracteres rejeitado', () => {
    expect(() => makeTar([{ name: 'a'.repeat(100), data: Buffer.from('x') }])).toThrow();
  });

  test('diretórios no tar são ignorados na leitura', () => {
    // monta manualmente um tar com typeflag '5' (diretório)
    const h = Buffer.alloc(512, 0);
    h.write('umdir/', 0, 100, 'utf8');
    h.write('0000000\0', 124, 12, 'ascii'); // size 0
    h.write('        ', 148, 8, 'ascii');
    h.write('5', 156, 1, 'ascii');
    h.write('ustar\0', 257, 6, 'ascii');
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    const tar = Buffer.concat([h, Buffer.alloc(1024, 0)]);
    expect(extractTar(tar)).toEqual([]);
  });
});

describe('snapshotDbCounts', () => {
  liveDbTest('conta contas/personagens do banco de dev (somente leitura)', async () => {
    const counts = await snapshotDbCounts(resolveDbFilePath());
    expect(counts).not.toBeNull();
    // v0.9.24 (D2): 16 = 15 bots de ranking + "Mestre Kame" (líder bot da
    // guilda pública do sistema — criado pela primeira visita às guildas)
    expect(counts!.bots).toBeGreaterThanOrEqual(15);
    expect(counts!.bots).toBeLessThanOrEqual(16);
    // v0.16: o banco de dev pode conter a SESSÃO PRÓPRIA do dono (ex.: Rei
    // Taurion, restaurado da nuvem ao logar no preview) — contas humanas
    // reais NÃO são limpas por QA; só dados de QA são.
    expect(counts!.accounts).toBeGreaterThanOrEqual(0);
  });

  test('arquivo não-SQLite devolve null', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gm-persist-'));
    try {
      const fake = path.join(dir, 'custom.db');
      writeFileSync(fake, 'isto não é sqlite');
      expect(await snapshotDbCounts(fake)).toBeNull();
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('arquivo inexistente devolve null', async () => {
    expect(await snapshotDbCounts(path.join(tmpdir(), 'gm-nao-existe-xyz.db'))).toBeNull();
  });
});

describe('applyPendingMigrations (migrador de boot)', () => {
  test('cria schema completo em banco vazio e registra checksums oficiais', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gm-mig-'));
    const dbPath = path.join(dir, 'custom.db');
    try {
      const client = new PrismaClient({
        datasources: { db: { url: `file:${dbPath}` } },
        log: ['error'],
      });
      const migDir = path.join(process.cwd(), 'prisma', 'migrations');
      const { readdirSync, readFileSync } = await import('fs');
      const names = readdirSync(migDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(migDir, name, 'migration.sql')));
      const applied = await applyPendingMigrations(client);
      // O retorno informa quantas foram aplicadas nesta execução. A prova
      // autoritativa de completude vem abaixo, pela tabela de migrations.
      expect(applied).toBeGreaterThanOrEqual(1);

      // tabela da última migração existe (professions, v0.6)
      const cols = (await client.$queryRawUnsafe('PRAGMA table_info(Player)')) as Array<{
        name: string;
      }>;
      expect(cols.some((c) => c.name === 'professions')).toBe(true);
      expect(cols.some((c) => c.name === 'cosmeticsEquipped')).toBe(true);
      // a regra de cura gratuita foi removida sem alterar os demais dados
      expect(cols.some((c) => c.name === 'freeHealDay')).toBe(false);

      // coluna da v0.8 (contas na nuvem) presente na tabela Account
      const accCols = (await client.$queryRawUnsafe('PRAGMA table_info(Account)')) as Array<{
        name: string;
      }>;
      expect(accCols.some((c) => c.name === 'supabaseUserId')).toBe(true);

      // schema de guildas avançadas também existe num banco nascido do zero
      const guildTables = (await client.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('GuildRole','GuildRoleAssignment','GuildInvitation','GuildActionReceipt')"
      )) as Array<{ name: string }>;
      expect(guildTables.map((row) => row.name).sort()).toEqual(
        ['GuildActionReceipt', 'GuildInvitation', 'GuildRole', 'GuildRoleAssignment'].sort()
      );

      // _prisma_migrations registrado com checksums iguais aos arquivos
      const { createHash } = await import('crypto');
      const rows = (await client.$queryRawUnsafe(
        'SELECT migration_name, checksum FROM _prisma_migrations'
      )) as Array<{ migration_name: string; checksum: string }>;
      expect(rows.length).toBe(names.length);
      for (const n of names) {
        const row = rows.find((r) => r.migration_name === n);
        expect(row).toBeDefined();
        const sql = readFileSync(path.join(migDir, n, 'migration.sql'), 'utf8');
        expect(row!.checksum).toBe(createHash('sha256').update(sql).digest('hex'));
      }

      // idempotência: segunda execução não aplica nada
      const again = await applyPendingMigrations(client);
      expect(again).toBe(0);

      await client.$disconnect();
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('banco já migrado não é alterado (preserva dados)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gm-mig2-'));
    const dbPath = path.join(dir, 'custom.db');
    const client = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
      log: ['error'],
    });
    try {
      // Fixture hermética: nasce da cadeia oficial, recebe dados sentinela
      // e então prova que uma nova passagem do migrador é idempotente.
      expect(await applyPendingMigrations(client)).toBeGreaterThanOrEqual(1);
      const account = await client.account.create({
        data: { username: 'qa_persist', usernameLower: 'qa_persist' },
      });
      const player = await client.player.create({
        data: { name: 'QA Persistência', race: 'humano', accountId: account.id, zeni: 12345 },
      });

      expect(await applyPendingMigrations(client)).toBe(0);
      const preserved = await client.player.findUnique({ where: { id: player.id } });
      expect(preserved?.name).toBe('QA Persistência');
      expect(preserved?.zeni).toBe(12345);
      expect(await client.account.count({ where: { id: account.id } })).toBe(1);
    } finally {
      await client.$disconnect();
      cleanupTempDir(dir);
    }
  });
});

