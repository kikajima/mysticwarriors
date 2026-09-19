import { spawn } from 'node:child_process';

function assertProductionDatabaseUrl() {
  if (process.env.NODE_ENV !== 'production') return;
  const raw = process.env.DATABASE_URL ?? '';
  if (!/^postgres(?:ql)?:\/\//i.test(raw)) {
    throw new Error(
      'Produção exige DATABASE_URL PostgreSQL do Supabase. SQLite/file: não é aceito no Render Free.'
    );
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL PostgreSQL inválida.');
  }
  if (parsed.searchParams.get('schema') !== 'game') {
    throw new Error('DATABASE_URL deve incluir schema=game para isolar as tabelas autoritativas.');
  }
}

assertProductionDatabaseUrl();
// Render exige bind em todas as interfaces para o proxy público alcançar o serviço.
// O ambiente pode fornecer HOSTNAME com o nome interno do container; por isso
// sobrescrevemos deliberadamente em vez de usar ||=.
process.env.HOSTNAME = '0.0.0.0';

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

child.on('exit', (code) => process.exit(code ?? 0));
