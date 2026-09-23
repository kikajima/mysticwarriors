const DEFAULT_URL = 'https://mysticwarriors-ohio.onrender.com';
const base = new URL(process.argv[2] || process.env.PRODUCTION_URL || DEFAULT_URL).origin;
const failures = [];
const expectedCommit = (process.env.EXPECTED_COMMIT || '').trim();
const expectedRelease = (process.env.EXPECTED_RELEASE || '1.0.0-rc.1').trim();

async function get(path) {
  try {
    return await fetch(new URL(path, base), { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function expect(condition, message) {
  if (!condition) failures.push(message);
}

const root = await get('/');
if (root) {
  const body = await root.text();
  expect(root.status === 200, `/: HTTP ${root.status}`);
  expect(body.includes('Myst Ki Warriors'), '/: branding esperado não encontrado');
  expect(root.headers.get('x-content-type-options') === 'nosniff', '/: nosniff ausente');
  expect(root.headers.get('x-frame-options') === 'DENY', '/: X-Frame-Options DENY ausente');
  expect((root.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'"), '/: CSP frame-ancestors ausente');
  expect(Boolean(root.headers.get('strict-transport-security')), '/: HSTS ausente');
}

const health = await get('/api/health');
if (health) {
  let json = null;
  try { json = await health.json(); } catch {}
  expect(health.status === 200, `/api/health: HTTP ${health.status}`);
  expect(json?.ok === true, '/api/health: ok != true');
  expect(json?.database === 'ok', '/api/health: banco não está ok');
  expect(json?.cloudAuthority === 'server', '/api/health: cloudAuthority inesperado');
  expect(json?.release === expectedRelease, `/api/health: release ${json?.release ?? 'ausente'} != ${expectedRelease}`);
  expect(json?.releaseStage === 16, `/api/health: releaseStage ${json?.releaseStage ?? 'ausente'} != 16`);
  if (expectedCommit) {
    const deployedCommit = json?.deployment?.commit || '';
    expect(deployedCommit === expectedCommit, `/api/health: commit implantado ${deployedCommit || 'ausente'} != ${expectedCommit}`);
  }
  if (json?.deployment?.branch) {
    expect(json.deployment.branch === 'master', `/api/health: branch implantada ${json.deployment.branch} != master`);
  }
}

const robots = await get('/robots.txt');
if (robots) {
  const body = await robots.text();
  expect(robots.status === 200, `/robots.txt: HTTP ${robots.status}`);
  expect(body.includes(`${base}/sitemap.xml`), '/robots.txt: sitemap não aponta para a origem canônica');
  expect(!body.includes('exemplo.com'), '/robots.txt: domínio de exemplo vazou');
}

const sitemap = await get('/sitemap.xml');
if (sitemap) {
  const body = await sitemap.text();
  expect(sitemap.status === 200, `/sitemap.xml: HTTP ${sitemap.status}`);
  expect(body.includes(base), '/sitemap.xml: origem canônica ausente');
  expect(body.includes(`${base}/jogar`), '/sitemap.xml: /jogar ausente');
  expect(!body.includes('exemplo.com'), '/sitemap.xml: domínio de exemplo vazou');
}

if (failures.length) {
  console.error('Production smoke FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Production smoke OK: ${base} · release=${expectedRelease}${expectedCommit ? ` · commit=${expectedCommit}` : ''}`);
