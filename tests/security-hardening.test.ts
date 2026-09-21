import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'scripts', '.github', 'mini-services'];
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

  test('Supabase exige configuração explícita e não embute projeto real', async () => {
    const config = await Bun.file(`${ROOT}/src/lib/supabase/config.ts`).text();
    expect(config).toContain("requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL')");
    expect(config).toContain("requiredPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')");
    expect(config).not.toMatch(/https:\/\/[a-z0-9]+\.supabase\.co/);
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
  });

  test('documentação vigente não contém o e-mail administrativo histórico', async () => {
    const design = await Bun.file(`${ROOT}/DESIGN-DECISIONS.md`).text();
    expect(design).not.toContain('alicomprasbbbb@gmail.com');
  });
});
