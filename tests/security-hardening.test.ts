import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}

function walk(relative: string): string[] {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  for (const name of readdirSync(absolute)) {
    const childRel = path.join(relative, name);
    const child = path.join(root, childRel);
    const stat = statSync(child);
    if (stat.isDirectory()) out.push(...walk(childRel));
    else out.push(childRel);
  }
  return out;
}

describe('Release security hardening', () => {
  test('Supabase não possui projeto/chave publicável real como fallback no código', () => {
    const config = read('src/lib/supabase/config.ts');
    const probe = read('scripts/probe-postgrest.mjs');

    expect(config).not.toMatch(/https:\/\/[a-z0-9]{15,}\.supabase\.co/i);
    expect(config).not.toMatch(/sb_publishable_[A-Za-z0-9_-]{20,}/);
    expect(config).toContain("process.env.NODE_ENV === 'production'");
    expect(config).toContain('é obrigatório em produção');

    expect(probe).not.toMatch(/https:\/\/[a-z0-9]{15,}\.supabase\.co/i);
    expect(probe).not.toMatch(/sb_publishable_[A-Za-z0-9_-]{20,}/);
    expect(probe).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(probe).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  test('artefatos internos e respostas de IA não voltam ao repositório', () => {
    expect(existsSync(path.join(root, 'worklog.md'))).toBe(false);
    const vlm = existsSync(path.join(root, 'scripts'))
      ? readdirSync(path.join(root, 'scripts')).filter((name) => /^vlm-.*\.json$/i.test(name))
      : [];
    expect(vlm).toEqual([]);

    const ignore = read('.gitignore');
    expect(ignore).toContain('/worklog.md');
    expect(ignore).toContain('/scripts/vlm-*.json');
  });

  test('não há chaves conhecidas de IA/segredos ou e-mails pessoais em fontes versionadas', () => {
    const candidates = [
      ...walk('src'),
      ...walk('scripts'),
      ...walk('mini-services'),
      ...readdirSync(root)
        .filter((name) => /\.(sql|md|mjs|json|ya?ml)$/i.test(name) && name !== 'bun.lock')
        .map((name) => name),
    ].filter((file) => file !== 'tests/security-hardening.test.ts');

    const secretPatterns = [
      /sk-[A-Za-z0-9_-]{20,}/,
      /sk-ant-[A-Za-z0-9_-]{20,}/,
      /AIza[A-Za-z0-9_-]{25,}/,
      /sb_secret_[A-Za-z0-9_-]{20,}/,
      /sb_publishable_[A-Za-z0-9_-]{20,}/,
    ];
    const personalEmail = /[\w.+-]+@(gmail|hotmail|outlook|icloud)\.com/gi;

    const violations: string[] = [];
    for (const file of candidates) {
      let text: string;
      try {
        text = read(file);
      } catch {
        continue;
      }
      if (secretPatterns.some((pattern) => pattern.test(text))) violations.push(`${file}:secret-pattern`);
      if (personalEmail.test(text)) violations.push(`${file}:personal-email`);
      personalEmail.lastIndex = 0;
    }
    expect(violations).toEqual([]);
  });

  test('headers globais endurecem o navegador', () => {
    const config = read('next.config.mjs');
    for (const expected of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'poweredByHeader: false',
      "object-src 'none'",
      "frame-ancestors 'self'",
    ]) {
      expect(config).toContain(expected);
    }
  });

  test('rotas locais de username/senha ficam indisponíveis em produção', () => {
    const auth = read('src/lib/auth.ts');
    expect(auth).toContain('requireLegacyLocalAuthEnvironment');
    expect(auth).toContain("process.env.NODE_ENV === 'production'");

    for (const route of [
      'src/app/api/auth/login/route.ts',
      'src/app/api/auth/register/route.ts',
      'src/app/api/auth/convert/route.ts',
    ]) {
      expect(read(route)).toContain('requireLegacyLocalAuthEnvironment()');
    }
  });

  test('backup completo usa autorização admin e rate limit; export legado foi removido', () => {
    expect(existsSync(path.join(root, 'src/app/api/admin/db-export/route.ts'))).toBe(false);
    const backup = read('src/app/api/game/backup/route.ts');
    expect(backup).toContain('requirePanelAdmin(request)');
    expect(backup).toContain('rateLimit(');
    expect(backup).toContain('Retry-After');
  });
});
