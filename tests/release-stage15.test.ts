import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const ROOT = path.join(import.meta.dir, '..');

describe('Release stage 15 — production validation', () => {
  test('canonical site URL has one production fallback', async () => {
    const site = await Bun.file(path.join(ROOT, 'src/lib/site.ts')).text();
    const robots = await Bun.file(path.join(ROOT, 'src/app/robots.ts')).text();
    const sitemap = await Bun.file(path.join(ROOT, 'src/app/sitemap.ts')).text();

    expect(site).toContain("https://mysticwarriors-ohio.onrender.com");
    expect(robots).toContain("siteUrl()");
    expect(sitemap).toContain("siteUrl()");
    expect(robots).not.toContain('exemplo.com');
    expect(sitemap).not.toContain('exemplo.com');
  });

  test('health endpoint checks the authoritative database', async () => {
    const health = await Bun.file(path.join(ROOT, 'src/app/api/health/route.ts')).text();

    expect(health).toContain("from '@/lib/db'");
    expect(health).toContain("SELECT 1");
    expect(health).toContain("database: 'ok'");
    expect(health).toContain("database: 'unavailable'");
    expect(health).toContain("status: 503");
    expect(health).toContain("'Cache-Control': 'no-store'");
  });

  test('production smoke validates health, SEO and security headers', async () => {
    const smoke = await Bun.file(path.join(ROOT, 'scripts/smoke-production.mjs')).text();
    const workflow = await Bun.file(path.join(ROOT, '.github/workflows/production-smoke.yml')).text();

    expect(smoke).toContain('/api/health');
    expect(smoke).toContain('/robots.txt');
    expect(smoke).toContain('/sitemap.xml');
    expect(smoke).toContain('strict-transport-security');
    expect(smoke).toContain('x-frame-options');
    expect(smoke).toContain('content-security-policy');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('scripts/smoke-production.mjs');
  });
});
