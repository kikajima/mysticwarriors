import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'scripts', '.github', 'mini-services', 'supabase'];
const ROOT_FILES = [
  'DESIGN-DECISIONS.md',
  'worklog.md',
  'supabase-admin.sql',
  'supabase-instalacao-nova-base.sql',
  'supabase-admin-delete.sql',
  'supabase-reset-rpc.sql',
];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.sql', '.sh']);

function walk(dir: string, out: string[] = []): string[] {
  const absolute = path.join(ROOT, dir);
  for (const name of readdirSync(absolute)) {
    const rel = path.join(dir, name);
    const full = path.join(ROOT, rel);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(name)) continue;
      walk(rel, out);
    } else if (TEXT_EXTENSIONS.has(path.extname(name))) {
      out.push(rel);
    }
  }
  return out;
}

describe('Release security hardening', () => {
  test('fonte não contém padrões comuns de segredos/chaves privadas', () => {
    const patterns: Array<[string, RegExp]> = [
      ['OpenAI/compat sk-*', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
      ['Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
      ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
      ['GitHub classic token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
      ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
      ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
      ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
      ['Private key PEM', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ];

    const findings: string[] = [];
    const files = [...SCAN_DIRS.flatMap((dir) => walk(dir)), ...ROOT_FILES];
    for (const file of files) {
      const content = readFileSync(path.join(ROOT, file), 'utf8');
      for (const [label, pattern] of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(content)) findings.push(`${label}: ${file}`);
      }
    }
    expect(findings).toEqual([]);
  });

  test('arquivos versionados não contêm e-mails pessoais ou projeto Supabase real', () => {
    const files = [...SCAN_DIRS.flatMap((dir) => walk(dir)), ...ROOT_FILES];
    const findings: string[] = [];
    const personalMail = /\b[A-Z0-9._%+-]+@(?:gmail|hotmail|outlook|icloud|yahoo)\.[A-Z]{2,}\b/gi;
    const realSupabaseUrl = /https:\/\/[a-z0-9]{15,}\.supabase\.co/gi;
    const publishableKey = /\bsb_publishable_[A-Za-z0-9_-]{20,}\b/g;

    for (const file of files) {
      const content = readFileSync(path.join(ROOT, file), 'utf8');
      personalMail.lastIndex = 0;
      realSupabaseUrl.lastIndex = 0;
      publishableKey.lastIndex = 0;
      if (personalMail.test(content)) findings.push(`e-mail pessoal: ${file}`);
      if (realSupabaseUrl.test(content)) findings.push(`projeto Supabase real: ${file}`);
      if (publishableKey.test(content)) findings.push(`chave publishable embutida: ${file}`);
    }

    expect(findings).toEqual([]);
  });

  test('tokens de sessão são persistidos apenas como hash', async () => {
    const auth = await Bun.file(`${ROOT}/src/lib/auth.ts`).text();
    expect(auth).toContain('export function hashSessionToken');
    expect(auth).toContain("createHash('sha256')");
    expect(auth).toContain('token: storedToken');
    expect(auth).toContain('const hashed = hashSessionToken(token)');
    expect(auth).toContain('data: { token: hashed }');
  });

  test('Supabase exige configuração explícita e usa referências públicas estáticas', async () => {
    const config = await Bun.file(`${ROOT}/src/lib/supabase/config.ts`).text();
    expect(config).toContain("'NEXT_PUBLIC_SUPABASE_URL'");
    expect(config).toContain("'NEXT_PUBLIC_SUPABASE_ANON_KEY'");
    expect(config).toContain('process.env.NEXT_PUBLIC_SUPABASE_URL');
    expect(config).toContain('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(config).not.toContain('const value = process.env[name]');
    expect(config).toContain("'https://example.supabase.co'");
    expect(config).not.toMatch(/https:\/\/(?!example\.)[a-z0-9]{15,}\.supabase\.co/);
    expect(config).not.toMatch(/sb_publishable_[A-Za-z0-9_-]{20,}/);
  });

  test('exportação completa do banco é não-descobrível, limitada e constant-time', async () => {
    const route = await Bun.file(`${ROOT}/src/app/api/admin/db-export/route.ts`).text();
    expect(route).toContain('timingSafeEqual');
    expect(route).toContain('rateLimit(');
    expect(route).toContain("status: 404");
    expect(route).toContain('GM_ADMIN_EXPORT_SECRET');
    expect(route).toContain("'cache-control': 'no-store, private'");
  });

  test('respostas HTTP possuem hardening mínimo global', async () => {
    const config = await Bun.file(`${ROOT}/next.config.mjs`).text();
    expect(config).toContain('X-Content-Type-Options');
    expect(config).toContain('Referrer-Policy');
    expect(config).toContain('Permissions-Policy');
    expect(config).toContain('Strict-Transport-Security');
    expect(config).toContain('Content-Security-Policy');
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain('X-Frame-Options');
    expect(config).toContain('DENY');
  });

  test('espelho de gameplay é escrito e restaurado somente pelo backend', async () => {
    const snapshot = await Bun.file(`${ROOT}/src/app/api/game/cloud-snapshot/route.ts`).text();
    const restore = await Bun.file(`${ROOT}/src/app/api/game/cloud-restore/route.ts`).text();
    const page = await Bun.file(`${ROOT}/src/app/jogar/page.tsx`).text();
    const migration = await Bun.file(
      `${ROOT}/supabase/migrations/20260923043000_stage12_server_authoritative_mirror.sql`
    ).text();

    expect(snapshot).toContain('syncServerCloudCharacters');
    expect(restore).toContain('loadServerCloudCharacters');
    expect(restore).toContain('z.object({}).strict()');
    expect(restore).not.toContain('parsed.data.personagens');
    expect(restore).not.toContain('sanitizeCloudProgress');
    expect(page).not.toContain('upsertCloudCharacters(');
    expect(page).not.toContain('deleteStaleCloudCharacters(');
    expect(page).not.toContain('JSON.stringify({ personagens: rows })');
    expect(migration).toContain('server_verified');
    expect(migration).toContain('revoke insert, update, delete on public.personagens from authenticated');
    expect(migration).toContain('where p.server_verified = true');
  });

  test('PvP offline não expõe snapshot interno por RPC autenticado', async () => {
    const offline = await Bun.file(`${ROOT}/src/lib/supabase/offline-pvp.ts`).text();
    const sql = await Bun.file(`${ROOT}/supabase-offline-pvp.sql`).text();
    const action = await Bun.file(`${ROOT}/src/app/api/game/action/route.ts`).text();

    expect(offline).toContain('loadServerOfflineOpponent');
    expect(offline).not.toContain('/rest/v1/rpc/pvp_opponent');
    expect(offline).not.toContain('SUPABASE_PUBLISHABLE_KEY');
    expect(sql).not.toContain('grant execute on function public.pvp_opponent(text) to authenticated');
    expect(action).not.toContain('extractBearerToken');
  });

  test('promoções de convidado rotacionam a sessão privilegiada', async () => {
    const local = await Bun.file(`${ROOT}/src/app/api/auth/convert/route.ts`).text();
    const bridge = await Bun.file(`${ROOT}/src/app/api/auth/supabase/route.ts`).text();

    expect(local).toContain('id: auth.session.id');
    expect(local).toContain('revokedAt: new Date()');
    expect(local).toContain('setSessionCookie(response, session.token)');
    expect(bridge).toContain('id: current.session.id');
    expect(bridge).toContain('rotatedSession');
    expect(bridge).toContain('revokedAt: new Date()');
  });

  test('avatares fixam DNS validado e limitam bomba de pixels', async () => {
    const avatars = await Bun.file(`${ROOT}/src/lib/avatars.ts`).text();
    const route = await Bun.file(`${ROOT}/src/app/api/game/avatar/route.ts`).text();

    expect(avatars).toContain('MAX_AVATAR_PIXELS');
    expect(avatars).toContain('function pinnedHttpsGet');
    expect(avatars).toContain('hostname: address');
    expect(avatars).toContain('servername: url.hostname');
    expect(avatars).toContain('limitInputPixels: MAX_AVATAR_PIXELS');
    expect(avatars).not.toContain('fetch(current');
    expect(route).toContain('const storageBytes = await fetchExternalImage(url)');
    expect(route).toContain('await validateImageBytes(storageBytes)');
  });

  test('rota de invocação administrativa usa guard compartilhado e rate limit', async () => {
    const route = await Bun.file(`${ROOT}/src/app/api/admin/universal-threat/route.ts`).text();
    expect(route).toContain('requirePanelAdmin(request)');
    expect(route).toContain('rateLimit(');
    expect(route).not.toContain('verifySupabaseAdmin(token)');
  });

  test('documentação vigente não contém o e-mail administrativo histórico', async () => {
    const design = await Bun.file(`${ROOT}/DESIGN-DECISIONS.md`).text();
    expect(design).not.toContain('alicomprasbbbb@gmail.com');
  });
});
