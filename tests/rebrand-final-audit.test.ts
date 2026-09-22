import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const PUBLIC_DIRS = [
  'src/app',
  'src/components',
  'src/lib/wiki',
  'src/lib/game/content',
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.md']);

const LEGACY_TERMS = [
  'Dragon Ball',
  'Shenron',
  'Shenlon',
  'Saiyajin',
  'Namekuseijin',
  'Namekusei',
  'Majin',
  'Oozaru',
  'Super Saiyajin',
  'Kamehameha',
  'Kienzan',
  'Dodonpa',
  'Kikoho',
  'Makankosappo',
  'Big Bang Attack',
  'Kaioken',
  'Final Flash',
  'Genki Dama',
  'Mestre Kame',
  'Mr. Satã',
  'Kuririn',
  'Tenshinhan',
  'Piccolo',
  'Vegeta',
  'Rei Kai',
  'Kaioshin',
  'Feijão Senzu',
  'Scouter',
  'Potara',
  'Freeza',
  'Gohan',
  'Tartaruga',
  'Zenkai',
  'ASCENSÃO Z',
  'Guerreiros Místicos',
  'Esferas do Dragão',
  'Esfera do Dragão',
];

function walk(relativeDir: string, out: string[] = []): string[] {
  const absolute = path.join(ROOT, relativeDir);
  for (const name of readdirSync(absolute)) {
    const relative = path.join(relativeDir, name);
    const full = path.join(ROOT, relative);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(relative, out);
    } else if (EXTENSIONS.has(path.extname(name))) {
      out.push(relative);
    }
  }
  return out;
}

describe('Rebrand etapa 9 — auditoria final de identidade', () => {
  test('camada pública não reintroduz nomenclatura derivada antiga', () => {
    const findings: string[] = [];

    for (const file of PUBLIC_DIRS.flatMap((dir) => walk(dir))) {
      let source = readFileSync(path.join(ROOT, file), 'utf8');

      // Nome técnico legado do componente é mantido apenas para evitar uma
      // refatoração de rota/import sem benefício para o jogador.
      source = source.replaceAll('ShenronPanel', '');

      for (const legacy of LEGACY_TERMS) {
        if (source.includes(legacy)) findings.push(`${legacy}: ${file}`);
      }
    }

    expect(findings).toEqual([]);
  });

  test('UI não usa a palavra scouter nem Esfera como terminologia pública', () => {
    const uiDirs = ['src/app', 'src/components', 'src/lib/wiki'];
    const findings: string[] = [];

    for (const file of uiDirs
      .flatMap((dir) => walk(dir))
      .filter((file) => !file.startsWith('src/app/api/'))) {
      let source = readFileSync(path.join(ROOT, file), 'utf8');
      source = source.replaceAll('ShenronPanel', '');

      if (/\bscouter\b/i.test(source)) findings.push(`scouter: ${file}`);
      if (/\bEsferas?\b/.test(source)) findings.push(`Esfera: ${file}`);
    }

    expect(findings).toEqual([]);
  });

  test('Wiki não reintroduz Zenkai em texto JSX visível', async () => {
    const wikiView = await Bun.file(path.join(ROOT, 'src/components/wiki/WikiView.tsx')).text();

    // Identificadores internos legados podem continuar existindo por compatibilidade,
    // mas a cópia renderizada para o jogador não pode reintroduzir o nome antigo.
    expect(wikiView).not.toMatch(/>[^<>{}]*\\bzenkai\\b[^<>{}]*</i);
  });

  test('novos pilares de identidade permanecem presentes', async () => {
    const [races, techniques, transformations, wiki] = await Promise.all([
      Bun.file(path.join(ROOT, 'src/lib/game/content/races.ts')).text(),
      Bun.file(path.join(ROOT, 'src/lib/game/content/techniques.ts')).text(),
      Bun.file(path.join(ROOT, 'src/lib/game/content/transformations.ts')).text(),
      Bun.file(path.join(ROOT, 'src/lib/wiki/wiki-content.ts')).text(),
    ]);

    expect(races).toContain("name: 'Solaris'");
    expect(races).toContain("name: 'Verdant'");
    expect(techniques).toContain("name: 'Onda de Aether'");
    expect(transformations).toContain("name: 'Ascensão Prateada'");
    expect(wiki).toContain('Chaves do Horizonte e Aethelgard');
    expect(wiki).toContain('ESCALAS DE CAELUM');
  });
});
