import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

function configuredDbPath() {
  const raw = process.env.DATABASE_URL ?? '';
  const match = raw.match(/^file:(\/[^?]+)(?:\?.*)?$/i);
  return match?.[1] ?? null;
}

if (process.env.NODE_ENV === 'production') {
  const dbPath = configuredDbPath();
  if (!dbPath) {
    throw new Error('Produção exige DATABASE_URL=file:/caminho/absoluto/custom.db');
  }

  const dir = path.dirname(dbPath);
  if (!existsSync(dbPath)) {
    if (process.env.ALLOW_EMPTY_DB_INIT !== 'true') {
      throw new Error(
        `Banco de produção ausente em ${dbPath}. Monte/restaure o Persistent Disk. ` +
        'Para uma instalação realmente nova, use ALLOW_EMPTY_DB_INIT=true apenas no primeiro boot.'
      );
    }
    mkdirSync(dir, { recursive: true });
    closeSync(openSync(dbPath, 'a'));
    console.log(`[startup] SQLite vazio criado em ${dbPath}; migrations serão aplicadas no boot.`);
  }
}

process.env.HOSTNAME ||= '0.0.0.0';

const child = spawn('node', ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: process.env,
});

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!child.killed) child.kill(signal);
    const guard = setTimeout(() => process.exit(0), 10_000);
    guard.unref?.();
  });
}

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
