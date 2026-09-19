import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('infra de produção não depende da Z.ai', () => {
  expect(existsSync(path.join(root, '.zscripts'))).toBe(false);
  expect(existsSync(path.join(root, 'Caddyfile'))).toBe(false);

  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  expect(pkg.dependencies?.['z-ai-web-dev-sdk']).toBeUndefined();

  const nextConfig = readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
  expect(nextConfig).not.toContain('space-z.ai');

  const auth = readFileSync(path.join(root, 'src/lib/auth.ts'), 'utf8');
  expect(auth).toContain("sameSite: 'lax'");
  expect(auth).not.toContain("sameSite: 'none'");
});

test('Render possui build, start, health check e disco persistente declarados', () => {
  const render = readFileSync(path.join(root, 'render.yaml'), 'utf8');
  expect(render).toContain('buildCommand: bun install --frozen-lockfile && bun run db:generate && bun run build');
  expect(render).toContain('startCommand: bun run start');
  expect(render).toContain('healthCheckPath: /api/health');
  expect(render).toContain('autoDeployTrigger: checksPass');
  expect(render).toContain('mountPath: /var/data');
  expect(render).toContain('file:/var/data/custom.db');

  const start = readFileSync(path.join(root, 'scripts/start-production.mjs'), 'utf8');
  expect(start).toContain('ALLOW_EMPTY_DB_INIT');
  expect(start).toContain(".next/standalone/server.js");
});
