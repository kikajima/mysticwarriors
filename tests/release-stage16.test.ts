import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const ROOT = path.join(import.meta.dir, '..');

describe('Release stage 16 — release candidate identity', () => {
  test('package and release constant identify the same RC', async () => {
    const pkg = JSON.parse(await Bun.file(path.join(ROOT, 'package.json')).text());
    const release = await Bun.file(path.join(ROOT, 'src/lib/release.ts')).text();

    expect(pkg.version).toBe('1.0.0-rc.1');
    expect(release).toContain("RELEASE_VERSION = '1.0.0-rc.1'");
    expect(release).toContain('RELEASE_STAGE = 16');
  });

  test('deployment identity uses Render native commit metadata', async () => {
    const release = await Bun.file(path.join(ROOT, 'src/lib/release.ts')).text();
    const health = await Bun.file(path.join(ROOT, 'src/app/api/health/route.ts')).text();

    expect(release).toContain('RENDER_GIT_COMMIT');
    expect(release).toContain('RENDER_GIT_BRANCH');
    expect(release).toContain('RENDER_SERVICE_NAME');
    expect(release).toContain('RENDER_EXTERNAL_URL');
    expect(health).toContain('deploymentIdentity()');
    expect(health).toContain('deployment,');
  });

  test('production smoke rejects a stale deploy', async () => {
    const smoke = await Bun.file(path.join(ROOT, 'scripts/smoke-production.mjs')).text();
    const workflow = await Bun.file(path.join(ROOT, '.github/workflows/production-smoke.yml')).text();

    expect(smoke).toContain('EXPECTED_COMMIT');
    expect(smoke).toContain('EXPECTED_RELEASE');
    expect(smoke).toContain('commit implantado');
    expect(smoke).toContain("branch implantada");
    expect(workflow).toContain('expected_commit');
    expect(workflow).toContain('inputs.expected_commit || github.sha');
  });
});
