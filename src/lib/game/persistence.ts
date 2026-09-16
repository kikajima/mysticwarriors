import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { copyFile, mkdir, open, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';

// =====================================================================
// PERSISTÊNCIA ENTRE ATUALIZAÇÕES (v0.7) — "as contas nunca mais somem"
// ---------------------------------------------------------------------
// CAUSA RAIZ (diagnóstico 2026-09-11): cada publicação empacota o banco
// de PREVIEW do sandbox (0 contas) e o deployment substitui o banco de
// PRODUÇÃO onde os jogadores vivem → toda atualização apagava as contas.
//
// CAMADAS DE DEFESA (independentes; qualquer uma salva os dados):
//
//  1. DATA_HOME EXTERNO AO PACOTE (start.sh): o banco de produção vive
//     em /app-data (fora do diretório extraído no deploy). Re-publicações
//     sobrescrevem o pacote, não o volume de dados.
//  2. RECONCILIAÇÃO ANTI-WIPE (boot): ao iniciar, o app compara o banco
//     vivo com o seed do pacote e NUNCA deixa um banco com contas ser
//     substituído por um com menos (o cenário exato que apagava contas).
//  3. MIGRAÇÕES NO BOOT (este arquivo): replica o `prisma migrate deploy`
//     via PrismaClient (a CLI não existe no pacote standalone) — o banco
//     vivo é atualizado de schema sem reset, com checksums oficiais.
//  4. BEACON (loop de dados): a produção empurra, dirigido por requests,
//     um tar.gz (banco + avatares + manifesto) de volta ao sandbox
//     (IP interno assado no pacote pelo build). O sandbox guarda em
//     db/production-snapshot/ (commitado no git — sobrevive a resets do
//     sandbox) e o PRÓXIMO build usa esse snapshot como seed. Mesmo com
//     container de produção frio/substituído, os dados voltam.
//  5. PULL NO BUILD: se o snapshot registrou a origem pública da
//     produção, o build tenta baixar o banco ao vivo antes de semear.
//  6. BACKUP MANUAL: GET /api/game/backup (sessão) baixa o tar.gz —
//     rede de segurança última para o usuário.
//
// POLÍTICA (regra do usuário): contas NUNCA são deletadas por
// atualização; apenas a progressão de personagens é resetada quando o
// balanceamento muda (ver balance.ts).
// =====================================================================

const LOG_PREFIX = '[persistence]';

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

// ===== Limites =====
const MAX_TAR_BYTES = 60 * 1024 * 1024; // teto do pacote de backup/beacon
const BEACON_INTERVAL_MS = 3 * 60_000; // mínimo entre beacons (dirigido por requests)
const BEACON_TIMEOUT_MS = 15_000;
const SNAPSHOT_BACKUPS_KEEP = 3;

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

/** Diretório do snapshot de produção (lado SANDBOX; commitado no git). */
export function resolveSnapshotDir(): string {
  return process.env.GM_SNAPSHOT_DIR ?? path.join(process.cwd(), 'db', 'production-snapshot');
}

/** Arquivo de segredos do beacon (um por build; append-only). */
export function resolveBeaconSecretsFile(): string {
  return process.env.GM_BEACON_SECRETS_FILE ?? path.join(process.cwd(), 'db', 'beacon-secrets.txt');
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
  purpose: 'beacon' | 'export' | 'user-backup';
}

export async function makeBackupTarGz(
  purpose: BackupManifest['purpose'],
  origin = ''
): Promise<{ body: Buffer; manifest: BackupManifest }> {
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

// =====================================================================
// Beacon — produção → sandbox (fecha o loop de dados)
// =====================================================================

interface BeaconState {
  enabled: boolean;
  targets: string[];
  secret: string;
  lastAttemptMs: number;
  lastSignature: string;
  sending: boolean;
  origin: string;
}

// Estado GLOBAL (não module-level): o Turbopack pode carregar DUAS
// instâncias deste módulo (instrumentation.ts × rotas) — sem o global,
// o beacon inicializado pelo boot ficaria invisível para as rotas.
// Mesmo padrão do singleton Prisma em src/lib/db.ts.
const globalForPersistence = globalThis as unknown as {
  __gmBeacon?: BeaconState;
  __gmPersistenceBooted?: boolean;
};

const beacon: BeaconState = (globalForPersistence.__gmBeacon ??= {
  enabled: false,
  targets: [],
  secret: '',
  lastAttemptMs: 0,
  lastSignature: '',
  sending: false,
  origin: '',
});

function initBeacon(): void {
  const targetEnv = process.env.GM_BEACON_TARGET ?? '';
  const secret = process.env.GM_BEACON_SECRET ?? '';
  if (!targetEnv || !secret) return;
  beacon.targets = targetEnv
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.startsWith('http'));
  beacon.secret = secret;
  beacon.enabled = beacon.targets.length > 0;
  if (beacon.enabled) log(`beacon ativado → ${beacon.targets.join(', ')}`);
}

async function currentDataSignature(): Promise<string> {
  try {
    const dbPath = resolveDbFilePath();
    const st = await stat(dbPath);
    let av = '';
    const avatarsDir = resolveAvatarsDir();
    if (existsSync(avatarsDir)) {
      const files = await readdir(avatarsDir);
      av = `${files.length}:${files.slice().sort().join('|').length}`;
    }
    return `${st.size}:${Math.floor(st.mtimeMs / 1000)}:${av}`;
  } catch {
    return '';
  }
}

export async function sendBeaconNow(
  reason: string,
  timeoutMs = BEACON_TIMEOUT_MS
): Promise<boolean> {
  if (!beacon.enabled || beacon.sending) return false;
  beacon.sending = true;
  beacon.lastAttemptMs = Date.now();
  try {
    const sig = await currentDataSignature();
    if (reason === 'interval' && sig === beacon.lastSignature) return true; // nada mudou
    const { body, manifest } = await makeBackupTarGz('beacon', beacon.origin);
    for (const target of beacon.targets) {
      try {
        const res = await fetch(`${target.replace(/\/$/, '')}/api/internal/db-beacon`, {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream', 'x-gm-beacon': beacon.secret },
          body: new Uint8Array(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          beacon.lastSignature = sig;
          log(`beacon entregue (${reason}; ${manifest.accounts} contas, ${body.length}B) → ${target}`);
          return true;
        }
        log(`beacon recusado (${res.status}) em ${target}`);
      } catch {
        // alvo inalcançável — tenta o próximo
      }
    }
    return false;
  } catch (err) {
    log('beacon falhou:', err instanceof Error ? err.message : err);
    return false;
  } finally {
    beacon.sending = false;
  }
}

/**
 * Beacon dirigido por requests: chamado (fire-and-forget) pelas rotas
 * principais. Sem timers permanentes — a instância não é impedida de
 * escalar para zero, e o beacon só corre quando há tráfego (exatamente
 * quando os dados mudam).
 */
export function maybeBeacon(request?: Request): void {
  if (!beacon.enabled) return;
  if (request) {
    try {
      const h = request.headers;
      const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
      const proto = h.get('x-forwarded-proto') ?? 'https';
      if (host && !beacon.origin) {
        beacon.origin = `${proto}://${host}`;
      }
    } catch {
      // sem origem — beacon segue sem manifesto de origem
    }
  }
  if (Date.now() - beacon.lastAttemptMs < BEACON_INTERVAL_MS) return;
  if (beacon.sending) return;
  beacon.lastAttemptMs = Date.now(); // evita tempestade de tentativas
  void sendBeaconNow('interval').catch(() => undefined);
}

// =====================================================================
// Segredos do beacon (valores aceitos pelo receptor/export)
// =====================================================================

export async function loadBeaconSecrets(): Promise<string[]> {
  const secrets = new Set<string>();
  const env = process.env.GM_BEACON_SECRET ?? '';
  if (env) secrets.add(env.trim());
  const file = resolveBeaconSecretsFile();
  try {
    if (existsSync(file)) {
      const content = await readFile(file, 'utf8');
      for (const line of content.split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#')) secrets.add(t);
      }
    }
  } catch {
    // sem arquivo — só o env
  }
  return [...secrets];
}

export async function beaconSecretOk(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const candidates = await loadBeaconSecrets();
  const a = createHash('sha256').update(provided).digest();
  return candidates.some((c) => {
    const b = createHash('sha256').update(c).digest();
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

// =====================================================================
// Orquestração de boot (src/instrumentation.ts chama isto UMA vez)
// =====================================================================

export async function bootPersistence(): Promise<void> {
  if (globalForPersistence.__gmPersistenceBooted) return;
  globalForPersistence.__gmPersistenceBooted = true;
  try {
    initBeacon();
    await reconcileDataOnBoot();
    const applied = await applyPendingMigrations();
    if (applied > 0) log(`${applied} migração(ões) aplicada(s) no boot`);

    // balancemento/versionameto é idempotente e barato — roda na primeira
    // rota; aqui apenas garantimos que o boot não dependa de tráfego.
    try {
      const { ensureBalanceVersion } = await import('./balance');
      await ensureBalanceVersion();
    } catch {
      // a rota tentará de novo
    }

    if (beacon.enabled) {
      // beacon inicial (atrasado p/ não competir com o cold start)
      const t = setTimeout(() => {
        void sendBeaconNow('boot').catch(() => undefined);
      }, 10_000);
      t.unref?.();
      // beacon final em desligamento (redeploy): o servidor Next chama
      // process.exit no SIGTERM — interceptamos a PRIMEIRA saída para dar
      // ~4s ao beacon final (janela do start.sh antes do SIGKILL).
      process.once('SIGTERM', () => {
        const origExit = process.exit.bind(process);
        let released = false;
        const exitProxy = ((code?: number) => {
          if (released) return origExit(code) as never;
          log('SIGTERM — beacon final antes de sair...');
          void sendBeaconNow('sigterm', 4000)
            .catch(() => undefined)
            .finally(() => {
              released = true;
              origExit(code);
            });
          return undefined as never;
        }) as typeof process.exit;
        try {
          process.exit = exitProxy;
        } catch {
          // não conseguiu interceptar — best effort direto
          void sendBeaconNow('sigterm', 4000).catch(() => undefined);
        }
      });
    }
    log(`boot concluído (db=${resolveDbFilePath()})`);
  } catch (err) {
    console.error(LOG_PREFIX, 'falha no boot de persistência (app segue):', err);
  }
}
