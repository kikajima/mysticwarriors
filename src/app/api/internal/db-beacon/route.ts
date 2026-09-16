import { mkdir, copyFile, readdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import {
  beaconSecretOk,
  extractTarGz,
  resolveSnapshotDir,
  snapshotDbCounts,
  type BackupManifest,
} from '@/lib/game/persistence';

// =====================================================================
// POST /api/internal/db-beacon — RECEPTOR (lado sandbox)
// ---------------------------------------------------------------------
// A instância de PRODUÇÃO empurra aqui um tar.gz { custom.db, avatars/*,
// manifest.json } com o header x-gm-beacon <segredo> (gerado a cada build
// e registrado em db/beacon-secrets.txt — append-only, versões antigas
// continuam aceitas durante a janela de deploy).
//
// O que esta rota NÃO faz:
//  * não toca no banco vivo do sandbox (db/custom.db) — grava SOMENTE em
//    db/production-snapshot/, que é commitado no git e usado como SEED
//    pelo próximo build (database-runtime-build.sh);
//  * não executa SQL do pacote — apenas valida e arquiva.
//
// Regra de riqueza: um snapshot só substitui o anterior se tiver MAIS
// contas (política anti-regressão — um beacon atrasado jamais apaga um
// mais novo).
// =====================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 60 * 1024 * 1024;

interface ReceivedSnapshot {
  manifest: BackupManifest;
  dbBytes: Buffer;
  avatars: Array<{ name: string; data: Buffer }>;
}

function parseSnapshot(body: Buffer): ReceivedSnapshot {
  const entries = extractTarGz(body);
  const dbEntry = entries.find((e) => e.name === 'custom.db');
  const manifestEntry = entries.find((e) => e.name === 'manifest.json');
  if (!dbEntry || !manifestEntry) throw new Error('tar sem custom.db/manifest.json');
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf8')) as BackupManifest;
  } catch {
    throw new Error('manifest.json inválido');
  }
  const avatars = entries
    .filter((e) => e.name.startsWith('avatars/') && !e.name.endsWith('/'))
    .map((e) => ({ name: path.basename(e.name), data: e.data }))
    .filter((a) => /^avatar_[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(a.name));
  return { manifest, dbBytes: dbEntry.data, avatars };
}

export async function POST(request: Request) {
  // autenticação por segredo compartilhado (comparação constante no tempo)
  if (!(await beaconSecretOk(request.headers.get('x-gm-beacon')))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    // leitura com teto rígido
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413 });
    }
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ ok: false, error: 'empty' }, { status: 400 });
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413 });
      }
      chunks.push(Buffer.from(value));
    }
    const body = Buffer.concat(chunks);
    if (body.length === 0) return NextResponse.json({ ok: false, error: 'empty' }, { status: 400 });

    const parsed = parseSnapshot(body);

    // valida o SQLite recebido ANTES de tocar no snapshot arquivado
    const snapDir = resolveSnapshotDir();
    const tmpDir = path.join(snapDir, '.incoming');
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });
    const tmpDb = path.join(tmpDir, 'custom.db');
    await writeFile(tmpDb, parsed.dbBytes);

    const counts = await snapshotDbCounts(tmpDb);
    if (!counts) {
      await rm(tmpDir, { recursive: true, force: true });
      return NextResponse.json({ ok: false, error: 'invalid_db' }, { status: 422 });
    }

    const snapDb = path.join(snapDir, 'custom.db');

    // anti-regressão: só substitui se for mais rico (ou primeiro snapshot).
    // v0.9.10 — EXCEÇÃO PÓS-RESET: um beacon com serverResetAt MAIS RECENTE
    // que o snapshot arquivado SEMPRE substitui (produção resetada manda o
    // estado verdadeiro; segurar o snapshot antigo "rico" empacotaria um
    // seed pré-reset no próximo build).
    if (existsSync(snapDb)) {
      const current = await snapshotDbCounts(snapDb);
      // limpa artefatos criados pela sondagem
      await rm(`${snapDb}-wal`, { force: true });
      await rm(`${snapDb}-shm`, { force: true });
      const incomingIsNewerReset =
        !!counts.serverResetAt &&
        (!current?.serverResetAt || counts.serverResetAt > current.serverResetAt);
      if (!incomingIsNewerReset && current && current.accounts > counts.accounts) {
        await rm(tmpDir, { recursive: true, force: true });
        return NextResponse.json({
          ok: true,
          stored: false,
          reason: 'snapshot atual é mais rico — mantido',
          current: current.accounts,
          received: counts.accounts,
        });
      }
      // arquiva o anterior (rotação)
      const baks = (await readdir(snapDir)).filter((f) => f.startsWith('custom.db.bak-')).sort();
      await copyFile(snapDb, path.join(snapDir, `custom.db.bak-${Date.now()}.db`));
      while (baks.length >= 3) {
        await rm(path.join(snapDir, baks.shift() as string), { force: true });
      }
    }

    // gravação: tmp → destino final
    await mkdir(snapDir, { recursive: true });
    await copyFile(tmpDb, snapDb);
    await rm(tmpDir, { recursive: true, force: true });
    // sondagens (Prisma) podem ter criado -wal/-shm ao lado do snapshot —
    // remove: o snapshot é um arquivo avulso e checkpointed
    await rm(`${snapDb}-wal`, { force: true });
    await rm(`${snapDb}-shm`, { force: true });

    // avatares por união (nomes únicos por playerId+timestamp)
    if (parsed.avatars.length > 0) {
      const avDir = path.join(snapDir, 'avatars');
      await mkdir(avDir, { recursive: true });
      for (const a of parsed.avatars) {
        const dest = path.join(avDir, a.name);
        if (!existsSync(dest)) await writeFile(dest, a.data);
      }
    }

    // origem pública da produção → habilita o pull no próximo build
    if (parsed.manifest.origin) {
      await writeFile(path.join(snapDir, 'origin.txt'), parsed.manifest.origin + '\n', 'utf8');
    }
    await writeFile(
      path.join(snapDir, 'manifest.json'),
      JSON.stringify(parsed.manifest, null, 2),
      'utf8'
    );

    console.log(
      `[beacon] snapshot arquivado: ${counts.accounts} contas, ${counts.humanPlayers} personagens, ` +
        `${parsed.avatars.length} avatares, origem=${parsed.manifest.origin || 'n/d'}`
    );
    return NextResponse.json({ ok: true, stored: true, counts });
  } catch (err) {
    console.error('[beacon] falha ao processar:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
}
