import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const script = path.resolve('scripts', 'e2e-audit.sh');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) return { ok: false, error: result.error };
  process.exitCode = result.status ?? 1;
  return { ok: true };
}

if (process.platform !== 'win32') {
  const out = run('bash', [script]);
  if (!out.ok) {
    console.error('\nNão foi possível executar bash. Instale bash ou rode scripts/e2e-audit.sh em um shell compatível.');
    process.exitCode = 1;
  }
} else {
  const candidates = [
    process.env.GIT_BASH,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe') : null,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe') : null,
  ].filter(Boolean);

  let bash = candidates.find((candidate) => existsSync(candidate));

  if (!bash) {
    const where = spawnSync('where.exe', ['bash.exe'], { encoding: 'utf8', shell: false });
    if (where.status === 0) bash = where.stdout.split(/\r?\n/).map((v) => v.trim()).find(Boolean);
  }

  if (bash) {
    run(bash, [script.replaceAll('\\', '/')]);
  } else {
    const wsl = spawnSync('where.exe', ['wsl.exe'], { encoding: 'utf8', shell: false });
    if (wsl.status === 0) {
      const cwd = process.cwd();
      const drive = cwd.slice(0, 1).toLowerCase();
      const rest = cwd.slice(2).replaceAll('\\', '/');
      const wslScript = `/mnt/${drive}${rest}/scripts/e2e-audit.sh`;
      run('wsl.exe', ['bash', wslScript]);
    } else {
      console.error([
        '',
        'E2E não iniciado: não encontrei Git Bash nem WSL.',
        'Instale Git for Windows (inclui Git Bash) ou defina GIT_BASH com o caminho do bash.exe.',
        'Exemplo no PowerShell:',
        '  $env:GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe"',
        '  npm run test:e2e',
      ].join('\n'));
      process.exitCode = 1;
    }
  }
}
