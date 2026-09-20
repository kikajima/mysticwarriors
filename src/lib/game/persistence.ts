import { createHash, randomUUID } from 'crypto';
import { copyFile, mkdir, open, readdir, readFile, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';

// =====================================================================
// PERSISTÊNCIA ENTRE ATUALIZAÇÕES
// ---------------------------------------------------------------------
// Render: o SQLite autoritativo vive em Persistent Disk, fora do diretório
// efêmero da aplicação. Este módulo cuida de migrações idempotentes,
// backups e utilitários de integridade. Não há sincronização com sandbox.
// =====================================================================

const LOG_PREFIX = '[persistence]';

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

export function isPostgresDatabase(url = process.env.DATABASE_URL ?? ''): boolean {
  return /^postgres(?:ql)?:\/\//i.test(url);
}

// ===== Limites =====
const MAX_TAR_BYTES = 60 * 1024 * 1024; // teto do pacote de backup/beacon

// =====================================================================
// Resolução de caminhos
// =====================================================================

/** Caminho do arquivo SQLite (resolução portátil — ver src/lib/db-path.ts). */
import { resolveDbFilePath } from '@/lib/db-path';
export { resolveDbFilePath };

/** Diretório de migrações (no pacote standalone o build copia para prisma/). */
export function resolveMigrationsDir(): string {
  return process.env.GM_MIGRATIONS_DIR ?? path.join(process.cwd(), 'prisma', 'migrations');
}

/** Diretório de avatares — irmão do banco (mesmo volume). */
export function resolveAvatarsDir(): string {
  return path.join(path.dirname(resolveDbFilePath()), 'avatars');
}

// =====================================================================
// Splitter de SQL — respeita strings '...' e comentários --
// (os migration.sql deste projeto não usam "--> statement-breakpoint")
// =====================================================================

export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      cur += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          cur += "'"; // escape ''
          i++;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      cur += ch;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      // comentário até o fim da linha — o '\n' é PRESERVADO (sem ele o
      // comentário engoliria o statement seguinte na mesma linha lógica)
      while (i < sql.length && sql[i] !== '\n') cur += sql[i++];
      if (i < sql.length) cur += '\n';
      continue;
    }
    if (ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// =====================================================================
// Migrador de boot — réplica do `prisma migrate deploy` via PrismaClient
// (checksum = sha256 do migration.sql, igual à CLI; registros ficam em
// _prisma_migrations e são reconhecidos por builds futuros)
// =====================================================================

interface MigrationInfo {
  name: string;
  sql: string;
  checksum: string;
}

async function listMigrationFiles(): Promise<MigrationInfo[]> {
  const dir = resolveMigrationsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const migrations: MigrationInfo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sqlPath = path.join(dir, e.name, 'migration.sql');
    if (!existsSync(sqlPath)) continue;
    const sql = await readFile(sqlPath, 'utf8');
    migrations.push({
      name: e.name,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  migrations.sort((a, b) => a.name.localeCompare(b.name));
  return migrations;
}

async function ensureMigrationsTable(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  );`);
}

/**
 * Aplica migrações pendentes. Retorna o número aplicado (-1 em erro).
 * Aceita cliente injetado (testes/integração); padrão = singleton do app.
 * Nunca lança para o chamador de boot (erro é logado e o boot continua —
 * rotas reportarão problemas reais se houver).
 */
export async function applyPendingMigrations(client: PrismaClient = db): Promise<number> {
  try {
    const migrations = await listMigrationFiles();
    if (migrations.length === 0) return 0;

    await ensureMigrationsTable(client);
    const rows = (await client.$queryRawUnsafe(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    )) as Array<{ migration_name: string }>;
    const applied = new Set(rows.map((r) => r.migration_name));

    let count = 0;
    for (const mig of migrations) {
      if (applied.has(mig.name)) continue;
      const statements = splitSqlStatements(mig.sql);
      for (const stmt of statements) {
        await client.$executeRawUnsafe(stmt);
      }
      await client.$executeRawUnsafe(
        `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ('${randomUUID()}', '${mig.checksum}', datetime('now'), '${mig.name}', 1);`
      );
      log(`migração aplicada: ${mig.name} (${statements.length} statements)`);
      count++;
    }
    return count;
  } catch (err) {
    console.error(
      LOG_PREFIX,
      'falha ao aplicar migrações (boot continua; verificar):',
      err instanceof Error ? err.message : err
    );
    return -1;
  }
}

// =====================================================================
// Contagem leve em arquivo arbitrário (reconciliação/validação)
// =====================================================================

export interface DbCounts {
  accounts: number;
  humanPlayers: number;
  bots: number;
  /** v0.9.10: timestamp do último reset geral (GameMeta.serverResetAt).
   *  null = banco nunca foi resetado (ou tabela GameMeta ausente). */
  serverResetAt: string | null;
}

function looksLikeSqlite(buf: Buffer): boolean {
  return buf.length >= 16 && buf.subarray(0, 16).toString('latin1') === 'SQLite format 3\u0000';
}

/** Abre um arquivo SQLite SEPARADO (somente leitura conceitual) e conta. */
export async function snapshotDbCounts(dbPath: string): Promise<DbCounts | null> {
  try {
    const st = await stat(dbPath);
    if (!st.isFile() || st.size < 512) return null;
    const head = Buffer.alloc(16);
    const fh = await open(dbPath, 'r');
    try {
      // métodos do handle — compatíveis Node/Bun (as funções livres
      // fs.read/fs.close exigem fd numérico no Bun)
      await fh.read(head, 0, 16, 0);
    } finally {
      await fh.close();
    }
    if (!looksLikeSqlite(head)) return null;

    const probe = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
      log: ['error'],
    });
    try {
      const accounts = await probe.account.count().catch(() => 0);
      const humanPlayers = await probe.player.count({ where: { isBot: false } }).catch(() => 0);
      const bots = await probe.player.count({ where: { isBot: true } }).catch(() => 0);
      // v0.9.10: marcador de reset (bancos antigos podem não ter a tabela)
      const serverResetAt = await probe.gameMeta
        .findUnique({ where: { key: 'serverResetAt' } })
        .then((m) => m?.value ?? null)
        .catch(() => null);
      return { accounts, humanPlayers, bots, serverResetAt };
    } finally {
      await probe.$disconnect();
    }
  } catch {
    return null;
  }
}

// =====================================================================
// Reconciliação anti-wipe no boot
// ---------------------------------------------------------------------
// O seed do pacote (GM_SEED_DB) é a ÚNICA outra fonte. Regra:
//   * banco vivo inexistente/vazio → semeia a partir do pacote;
//   * seed com MAIS contas que o vivo → adota o seed (backup do vivo
//     antes — nada é destruído silenciosamente);
//   * caso contrário → mantém o vivo (é aqui que as contas deixavam de
//     ser apagadas: o pacote novo nunca mais sobrescreve dados vivos).
// =====================================================================

async function backupFile(file: string, backupsDir: string): Promise<void> {
  if (!existsSync(file)) return;
  await mkdir(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await copyFile(file, path.join(backupsDir, `${path.basename(file)}.pre-reconcile-${ts}.db`));
  // rotação: mantém os 5 mais recentes
  const files = (await readdir(backupsDir)).filter((f) => f.includes('.pre-reconcile-')).sort();
  while (files.length > 5) {
    await rm(path.join(backupsDir, files.shift() as string), { force: true });
  }
}

export async function reconcileDataOnBoot(): Promise<void> {
  // Produção nunca substitui o banco vivo por um seed/snapshot de build.
  // Restauração é uma operação explícita, anterior ao início do servidor.
  if (process.env.NODE_ENV === 'production') return;
  const livePath = resolveDbFilePath();
  const seedPath = process.env.GM_SEED_DB ?? '';
  await mkdir(path.dirname(livePath), { recursive: true });

  const liveExists = existsSync(livePath) && (await stat(livePath)).size > 512;
  const seedExists = seedPath !== '' && existsSync(seedPath) && (await stat(seedPath)).size > 512;

  if (!liveExists) {
    if (seedExists) {
      await copyFile(seedPath, livePath);
      // avatares do pacote entram por união (nomes são únicos por playerId+timestamp)
      const seedAvatars = path.join(path.dirname(seedPath), 'avatars');
      if (existsSync(seedAvatars)) {
        await mkdir(resolveAvatarsDir(), { recursive: true });
        for (const f of await readdir(seedAvatars)) {
          const dest = path.join(resolveAvatarsDir(), f);
          if (!existsSync(dest)) await copyFile(path.join(seedAvatars, f), dest);
        }
      }
      log(`banco vivo ausente — semeado a partir do pacote (${seedPath})`);
    } else {
      log('banco vivo ausente e sem seed — schema será criado pelas migrações');
    }
    return;
  }

  if (!seedExists) return;

  const liveCounts = await snapshotDbCounts(livePath);
  const seedCounts = await snapshotDbCounts(seedPath);
  if (!liveCounts || !seedCounts) {
    log('reconciliação: não foi possível ler contagens — mantendo banco vivo');
    return;
  }
  log(
    `reconciliação: vivo(${liveCounts.accounts} contas, ${liveCounts.humanPlayers} personagens) vs ` +
      `seed(${seedCounts.accounts} contas, ${seedCounts.humanPlayers} personagens)`
  );

  const seedRicher =
    seedCounts.accounts > liveCounts.accounts ||
    (seedCounts.accounts === liveCounts.accounts && seedCounts.humanPlayers > liveCounts.humanPlayers);

  // v0.9.10 — GUARDA ANTI-RESSURREIÇÃO PÓS-RESET: se o banco VIVO foi
  // resetado (tem serverResetAt) e o seed do pacote é de ANTES do reset
  // (sem marcador, ou marcador mais antigo), o seed NUNCA é adotado —
  // nem que seja "mais rico". Sem isto, um snapshot antigo re-popularia
  // a produção no deploy seguinte, desfazendo o reset silenciosamente.
  const seedIsPreReset =
    !!liveCounts.serverResetAt &&
    (!seedCounts.serverResetAt || seedCounts.serverResetAt < liveCounts.serverResetAt);
  if (seedIsPreReset) {
    log(
      `reconciliação: banco vivo foi RESETADO em ${liveCounts.serverResetAt} e o seed é anterior ` +
        `(${seedCounts.serverResetAt ?? 'sem marcador'}) — seed IGNORADO (política pós-reset)`
    );
    return;
  }

  if (seedRicher) {
    await backupFile(livePath, path.join(path.dirname(livePath), 'backups'));
    // WAL/SHM pertencem ao banco ANTIGO — remover junto com a troca
    await rm(`${livePath}-wal`, { force: true });
    await rm(`${livePath}-shm`, { force: true });
    await copyFile(seedPath, livePath);
    const seedAvatars = path.join(path.dirname(seedPath), 'avatars');
    if (existsSync(seedAvatars)) {
      await mkdir(resolveAvatarsDir(), { recursive: true });
      for (const f of await readdir(seedAvatars)) {
        const dest = path.join(resolveAvatarsDir(), f);
        if (!existsSync(dest)) await copyFile(path.join(seedAvatars, f), dest);
      }
    }
    log(`seed do pacote é MAIS RICO — adotado (vivo preservado em backups/pre-reconcile-*)`);
  } else {
    log('banco vivo mantido (política anti-wipe: pacote nunca sobrescreve dados vivos)');
  }
}

// =====================================================================
// tar.gz minimal (sem dependências) — escrita e leitura
// =====================================================================

export interface TarEntry {
  name: string;
  data: Buffer;
}

function tarHeader(name: string, size: number, mtimeSec: number): Buffer {
  const h = Buffer.alloc(512, 0);
  h.write(name.slice(0, 99), 0, 100, 'utf8');
  h.write('0000644\0', 100, 8, 'ascii'); // mode
  h.write('0000000\0', 108, 8, 'ascii'); // uid
  h.write('0000000\0', 116, 8, 'ascii'); // gid
  h.write(size.toString(8).padStart(11, '0') + ' ', 124, 12, 'ascii'); // size
  h.write(Math.floor(mtimeSec).toString(8).padStart(11, '0') + ' ', 136, 12, 'ascii'); // mtime
  h.write('        ', 148, 8, 'ascii'); // chksum placeholder (espaços)
  h.write('0', 156, 1, 'ascii'); // typeflag: arquivo regular
  h.write('ustar\0', 257, 6, 'ascii'); // magic
  h.write('00', 263, 2, 'ascii'); // version
  // checksum: soma dos bytes do header com o campo chksum em espaços
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

export function makeTar(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (const e of entries) {
    if (Buffer.byteLength(e.name) > 99) throw new Error(`nome tar longo demais: ${e.name}`);
    parts.push(tarHeader(e.name, e.data.length, now));
    parts.push(e.data);
    const pad = (512 - (e.data.length % 512)) % 512;
    if (pad > 0) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0)); // dois blocos de fim
  return Buffer.concat(parts);
}

export function extractTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break; // bloco de fim
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const sizeStr = header.toString('ascii', 124, 136).trim();
    const size = parseInt(sizeStr, 8) || 0;
    const typeflag = String.fromCharCode(header[156]);
    off += 512;
    if (typeflag === '0' || typeflag === '\0') {
      if (size < 0 || off + size > buf.length) throw new Error(`tar corrompido em ${name}`);
      entries.push({ name, data: Buffer.from(buf.subarray(off, off + size)) });
    }
    // diretórios e outros tipos: pula
    off += size + ((512 - (size % 512)) % 512);
  }
  return entries;
}

export function makeTarGz(entries: TarEntry[]): Buffer {
  return gzipSync(makeTar(entries), { level: 6 });
}

export function extractTarGz(buf: Buffer): TarEntry[] {
  return extractTar(gunzipSync(buf));
}

// =====================================================================
// Checkpoint + snapshot de backup (banco + avatares + manifesto)
// =====================================================================

export async function checkpointWal(): Promise<boolean> {
  if (isPostgresDatabase()) return true;
  try {
    const res = (await db.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);')) as Array<{
      busy: number;
    }>;
    return !res?.[0]?.busy;
  } catch {
    return false;
  }
}

export interface BackupManifest {
  origin: string;
  sentAt: string;
  accounts: number;
  humanPlayers: number;
  bots: number;
  purpose: 'export' | 'user-backup';
}

async function makePostgresLogicalBackup(
  purpose: BackupManifest['purpose'],
  origin: string
): Promise<{ body: Buffer; manifest: BackupManifest }> {
  const [
    accounts,
    players,
    sessions,
    guilds,
    guildRoles,
    guildRoleAssignments,
    guildInvitations,
    guildActionReceipts,
    walletTransactions,
    questProgress,
    achievementStates,
    worldBosses,
    worldBossDamage,
    seasons,
    seasonRankEntries,
    guildDonations,
    purchases,
    cosmeticsOwned,
    gameMeta,
    requestDedups,
    activities,
    adminActionLogs,
    analyticsEvents,
    chatMessages,
    chatMutes,
    inventoryStacks,
    craftJobs,
    dragonBallPossessions,
  ] = await Promise.all([
    db.account.findMany(),
    db.player.findMany(),
    db.session.findMany(),
    db.guild.findMany(),
    db.guildRole.findMany(),
    db.guildRoleAssignment.findMany(),
    db.guildInvitation.findMany(),
    db.guildActionReceipt.findMany(),
    db.walletTransaction.findMany(),
    db.questProgress.findMany(),
    db.achievementState.findMany(),
    db.worldBoss.findMany(),
    db.worldBossDamage.findMany(),
    db.season.findMany(),
    db.seasonRankEntry.findMany(),
    db.guildDonation.findMany(),
    db.purchase.findMany(),
    db.cosmeticOwned.findMany(),
    db.gameMeta.findMany(),
    db.requestDedup.findMany(),
    db.activity.findMany(),
    db.adminActionLog.findMany(),
    db.analyticsEvent.findMany(),
    db.chatMessage.findMany(),
    db.chatMute.findMany(),
    db.inventoryStack.findMany(),
    db.craftJob.findMany(),
    db.dragonBallPossession.findMany(),
  ]);

  const humans = players.filter((player) => !player.isBot).length;
  const bots = players.length - humans;
  const manifest: BackupManifest = {
    origin,
    sentAt: new Date().toISOString(),
    accounts: accounts.length,
    humanPlayers: humans,
    bots,
    purpose,
  };

  const logical = {
    format: 'mystic-warriors-postgres-v1',
    exportedAt: manifest.sentAt,
    tables: {
      Account: accounts,
      Player: players,
      Session: sessions,
      Guild: guilds,
      GuildRole: guildRoles,
      GuildRoleAssignment: guildRoleAssignments,
      GuildInvitation: guildInvitations,
      GuildActionReceipt: guildActionReceipts,
      WalletTransaction: walletTransactions,
      QuestProgress: questProgress,
      AchievementState: achievementStates,
      WorldBoss: worldBosses,
      WorldBossDamage: worldBossDamage,
      Season: seasons,
      SeasonRankEntry: seasonRankEntries,
      GuildDonation: guildDonations,
      Purchase: purchases,
      CosmeticOwned: cosmeticsOwned,
      GameMeta: gameMeta,
      RequestDedup: requestDedups,
      Activity: activities,
      AdminActionLog: adminActionLogs,
      AnalyticsEvent: analyticsEvents,
      ChatMessage: chatMessages,
      ChatMute: chatMutes,
      InventoryStack: inventoryStacks,
      CraftJob: craftJobs,
      DragonBallPossession: dragonBallPossessions,
    },
  };

  const entries: TarEntry[] = [
    { name: 'game.json', data: Buffer.from(JSON.stringify(logical, null, 2)) },
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
  ];
  const body = makeTarGz(entries);
  if (body.length > MAX_TAR_BYTES) throw new Error(`backup excede ${MAX_TAR_BYTES} bytes`);
  return { body, manifest };
}

export async function makeBackupTarGz(
  purpose: BackupManifest['purpose'],
  origin = ''
): Promise<{ body: Buffer; manifest: BackupManifest }> {
  if (isPostgresDatabase()) {
    return makePostgresLogicalBackup(purpose, origin);
  }

  await checkpointWal();
  const dbPath = resolveDbFilePath();
  const dbBytes = await readFile(dbPath);

  const entries: TarEntry[] = [{ name: 'custom.db', data: dbBytes }];
  const avatarsDir = resolveAvatarsDir();
  if (existsSync(avatarsDir)) {
    for (const f of await readdir(avatarsDir)) {
      const fp = path.join(avatarsDir, f);
      const st = await stat(fp);
      if (st.isFile() && st.size <= MAX_AVATAR_FILE_BYTES) {
        entries.push({ name: `avatars/${f}`, data: await readFile(fp) });
      }
    }
  }

  const counts = await snapshotDbCounts(dbPath);
  const manifest: BackupManifest = {
    origin,
    sentAt: new Date().toISOString(),
    accounts: counts?.accounts ?? -1,
    humanPlayers: counts?.humanPlayers ?? -1,
    bots: counts?.bots ?? -1,
    purpose,
  };
  entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) });

  const body = makeTarGz(entries);
  if (body.length > MAX_TAR_BYTES) throw new Error(`backup excede ${MAX_TAR_BYTES} bytes`);
  return { body, manifest };
}

const MAX_AVATAR_FILE_BYTES = 8 * 1024 * 1024;

const globalForPersistence = globalThis as unknown as {
  __gmPersistenceBooted?: boolean;
};

// =====================================================================
// Orquestração de boot (src/instrumentation.ts chama isto UMA vez)
// =====================================================================

export async function bootPersistence(): Promise<void> {
  if (globalForPersistence.__gmPersistenceBooted) return;
  globalForPersistence.__gmPersistenceBooted = true;

  if (process.env.MW_BUILD_PHASE === '1') {
    log('build phase — boot de persistência ignorado');
    return;
  }

  try {
    if (isPostgresDatabase()) {
      const { ensureBalanceVersion } = await import('./balance');
      const { ensureSeed } = await import('./engine');
      const { ensureActiveSeason } = await import('@/lib/seasons');

      await ensureBalanceVersion();
      await ensureSeed();
      await db.$transaction((tx) => ensureActiveSeason(tx));

      log('boot concluído (Supabase PostgreSQL, schema game; bots/temporada garantidos)');
      return;
    }

    // Caminho legado/teste SQLite.
    await reconcileDataOnBoot();
    const applied = await applyPendingMigrations();
    if (applied > 0) log(`${applied} migração(ões) aplicada(s) no boot`);

    try {
      const { ensureBalanceVersion } = await import('./balance');
      await ensureBalanceVersion();
    } catch {
      // a primeira rota tentará novamente
    }

    log(`boot concluído (SQLite=${resolveDbFilePath()})`);
  } catch (err) {
    console.error(LOG_PREFIX, 'falha no boot de persistência (app segue):', err);
  }
}
