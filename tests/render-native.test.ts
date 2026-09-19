import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('infra de produção não depende da Z.ai', () => {
  expect(existsSync(path.join(root, '.zscripts'))).toBe(false);
  expect(existsSync(path.join(root, 'Caddyfile'))).toBe(false);

  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  expect(pkg.name).toBe('mystic-warriors');
  expect(pkg.dependencies?.['z-ai-web-dev-sdk']).toBeUndefined();
  expect(pkg.scripts?.['db:reset']).toBeUndefined();
  expect(existsSync(path.join(root, 'ARQUIVOS-ALTERADOS.txt'))).toBe(false);

  const nextConfig = readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
  expect(nextConfig).not.toContain('space-z.ai');

  const auth = readFileSync(path.join(root, 'src/lib/auth.ts'), 'utf8');
  expect(auth).toContain("sameSite: 'lax'");
  expect(auth).not.toContain("sameSite: 'none'");
});

test('Render possui build, start, health check e disco persistente declarados', () => {
  const render = readFileSync(path.join(root, 'render.yaml'), 'utf8');
  expect(render).toContain('name: mysticwarriors');
  expect(render).toContain('buildCommand: mkdir -p /tmp/mystic-warriors-build');
  expect(render).toContain('export DATABASE_URL=file:/tmp/mystic-warriors-build/custom.db');
  expect(render).toContain('bun install --frozen-lockfile && bun run db:generate && bun run build');
  expect(render).toContain('startCommand: bun run start');
  expect(render).toContain('healthCheckPath: /api/health');
  expect(render).toContain('autoDeployTrigger: checksPass');
  expect(render).toContain('mountPath: /var/data');
  expect(render).toContain('file:/var/data/custom.db');

  const start = readFileSync(path.join(root, 'scripts/start-production.mjs'), 'utf8');
  expect(start).toContain('ALLOW_EMPTY_DB_INIT');
  expect(start).toContain(".next/standalone/server.js");
});

test('documentação operacional usa apenas o volume atual do Render', () => {
  const guide = readFileSync(path.join(root, 'CORRECOES-E-INSTALACAO.md'), 'utf8');
  expect(guide).toContain('file:/var/data/custom.db');
  expect(guide).toContain('file:/tmp/mystic-warriors/custom.db');
  expect(guide).toContain('plano Free');
  expect(guide).not.toContain('file:/data/mystic-warriors/custom.db');
  expect(guide).not.toContain('.zscripts');
  expect(guide).not.toContain('mystic-warriors-alterados.zip');
});
