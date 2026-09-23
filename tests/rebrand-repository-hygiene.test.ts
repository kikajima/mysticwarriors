import { describe, expect, test } from 'bun:test';

const ROOT = `${import.meta.dir}/..`;

const DOCS_AND_OPERATIONS = [
  'DESIGN-DECISIONS.md',
  'worklog.md',
  'supabase-save-fix.sql',
  'supabase-admin.sql',
  'supabase-admin-delete.sql',
  'supabase-reset-rpc.sql',
  'supabase-migration-v096.sql',
  'supabase-ranking-v2.sql',
  'supabase-instalacao-nova-base.sql',
  'supabase-reset-geral.sql',
  'supabase-backup-v096.sql',
  'supabase-backup-reset.sql',
  'supabase-limpeza-manual.sql',
  'supabase-persistence.sql',
  'scripts/sim-balance.ts',
  'scripts/e2e-audit.sh',
  'scripts/concurrency-test.ts',
  'scripts/sim-audit-racial.ts',
  'scripts/auditoria-f2-economia.ts',
];

const COMMENT_SOURCES = [
  'prisma/schema.prisma',
  'prisma/schema.sqlite.prisma',
  'src/app/globals.css',
  'src/lib/game/types.ts',
  'src/lib/game/characterInitial.ts',
  'src/lib/game/rules.ts',
  'src/lib/game/actions.ts',
  'src/lib/game/powerScale.ts',
  'src/lib/game/impeto.ts',
  'src/app/api/game/cloud-snapshot/route.ts',
  'src/lib/worldboss.ts',
  'src/lib/game/engine.ts',
  'src/lib/game/content/world.ts',
  'src/lib/game/content/tournament.ts',
  'src/lib/supabase/ranking.ts',
  'src/lib/wiki/wiki-content.ts',
];

const OLD_BRAND_PHRASES = [
  'Guerreiros Místicos',
  'GUERREIROS MÍSTICOS',
  'Dragon Ball',
  'Esferas do Dragão',
  'Esfera do Dragão',
  'Radar das Esferas',
  'ASCENSÃO Z',
  'Kakaroto',
  'Cell',
  'Broly',
  'Gohan',
  'Tartaruga',
  'Mestre Kame',
  'Vegeta',
  'Piccolo',
  'Kuririn',
  'Tenshinhan',
  'Freeza',
  'Frieza',
  'Kaioshin',
  'Sonjin',
];

const OLD_COMMENT_TERMS = [
  ...OLD_BRAND_PHRASES,
  'Saiyajin',
  'Namekuseijin',
  'Namekusei',
  'Majin',
  'Scouter',
  'Tartaruga',
  'Mestre Kame',
  'Freeza',
  'Frieza',
];

function extractComments(source: string): string {
  const line = source.match(/\/\/.*$/gm) ?? [];
  const block = source.match(/\/\*[\s\S]*?\*\//g) ?? [];
  return [...line, ...block].join('\n');
}

describe('Rebrand etapa 10 — higiene do repositório', () => {
  test('documentação e scripts operacionais não usam branding antigo', async () => {
    const findings: string[] = [];

    for (const file of DOCS_AND_OPERATIONS) {
      const source = await Bun.file(`${ROOT}/${file}`).text();
      for (const legacy of OLD_BRAND_PHRASES) {
        if (source.includes(legacy)) findings.push(`${legacy}: ${file}`);
      }
    }

    expect(findings).toEqual([]);
  });

  test('comentários de código usam a identidade atual sem renomear contratos internos', async () => {
    const findings: string[] = [];

    for (const file of COMMENT_SOURCES) {
      const comments = extractComments(await Bun.file(`${ROOT}/${file}`).text());
      for (const legacy of OLD_COMMENT_TERMS) {
        if (comments.includes(legacy)) findings.push(`${legacy}: ${file}`);
      }
    }

    expect(findings).toEqual([]);
  });

  test('produto não se apresenta mais como fan game', async () => {
    const source = (
      await Promise.all([
        Bun.file(`${ROOT}/src/app/page.tsx`).text(),
        Bun.file(`${ROOT}/src/app/jogar/page.tsx`).text(),
      ])
    ).join('\n');

    expect(source.toLowerCase()).not.toContain('jogo de fã');
    expect(source).toContain('Myst Ki Warriors — RPG de navegador');
  });

  test('snapshots VLM locais não são versionados novamente', async () => {
    const gitignore = await Bun.file(`${ROOT}/.gitignore`).text();
    expect(gitignore).toContain('scripts/vlm-*.json');
  });
});
