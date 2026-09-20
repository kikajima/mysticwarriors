import { cpSync, existsSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  throw new Error('[prepare-standalone] .next/standalone não existe — o build falhou antes da preparação.');
}

const copyTargets = [
  ['.next/static', path.join(standalone, '.next', 'static')],
  ['public', path.join(standalone, 'public')],
  ['prisma', path.join(standalone, 'prisma')],
];

for (const [source, destination] of copyTargets) {
  cpSync(path.join(root, source), destination, { recursive: true });
}

const removeDirectories = [
  'skills',
  'upload',
  'backups',
  'scripts',
  'tool-results',
  'download',
  'examples',
  'tests',
  'src',
  'mini-services',
  '.zscripts',
  '.git',
];

for (const directory of removeDirectories) {
  rmSync(path.join(standalone, directory), { recursive: true, force: true });
}

for (const file of ['worklog.md', 'dev.log', 'server.log', 'tsconfig.tsbuildinfo']) {
  rmSync(path.join(standalone, file), { force: true });
}

for (const entry of readdirSync(standalone)) {
  if (entry.startsWith('supabase-') && entry.endsWith('.sql')) {
    unlinkSync(path.join(standalone, entry));
  }
}

for (const directory of ['typescript', '@types']) {
  rmSync(path.join(standalone, 'node_modules', directory), { recursive: true, force: true });
}

rmSync(path.join(standalone, 'db'), { recursive: true, force: true });
for (const entry of readdirSync(standalone)) {
  if (entry === '.env' || entry.startsWith('.env.')) {
    unlinkSync(path.join(standalone, entry));
  }
}

console.log('[prepare-standalone] standalone saneado.');