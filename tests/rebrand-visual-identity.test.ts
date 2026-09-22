import { describe, expect, test } from 'bun:test';
import { RACES } from '../src/lib/game/content/races';

describe('Rebrand etapa 8 — identidade visual', () => {
  test('linhagens apontam para os novos retratos originais', () => {
    expect(RACES.saiyajin.avatar).toBe('/images/race-solaris.svg');
    expect(RACES.humano.avatar).toBe('/images/race-vanguardiano.svg');
    expect(RACES.namekuseijin.avatar).toBe('/images/race-verdant.svg');
    expect(RACES.androide.avatar).toBe('/images/race-sintetico.svg');
    expect(RACES.majin.avatar).toBe('/images/race-amorph.svg');
  });

  test('novos assets visuais existem no pacote público', async () => {
    const files = [
      'public/images/banner-mystki.svg',
      'public/images/race-solaris.svg',
      'public/images/race-vanguardiano.svg',
      'public/images/race-verdant.svg',
      'public/images/race-sintetico.svg',
      'public/images/race-amorph.svg',
      'public/images/aethelgard.svg',
      'public/icons/icon.svg',
    ];

    for (const file of files) {
      expect(await Bun.file(`${import.meta.dir}/../${file}`).exists()).toBe(true);
    }
  });

  test('UI principal não referencia os assets legados removidos', async () => {
    const files = [
      'src/app/page.tsx',
      'src/app/layout.tsx',
      'src/app/wiki/page.tsx',
      'src/components/game/AuthGate.tsx',
      'src/components/game/CharacterCreate.tsx',
      'src/components/game/ShenronPanel.tsx',
      'src/lib/game/content/races.ts',
      'public/manifest.webmanifest',
      'public/sw.js',
    ];
    const source = (
      await Promise.all(files.map((file) => Bun.file(`${import.meta.dir}/../${file}`).text()))
    ).join('\n');

    for (const legacy of [
      '/images/banner.png',
      '/images/race-saiyajin.png',
      '/images/race-humano.png',
      '/images/race-namekuseijin.png',
      '/images/race-androide.png',
      '/images/race-majin.png',
      '/images/shenron.png',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      'Guerreiros<br />Místicos',
    ]) {
      expect(source).not.toContain(legacy);
    }
  });

  test('assets visuais antigos foram removidos do repositório', async () => {
    const legacyFiles = [
      'public/images/banner.png',
      'public/images/race-saiyajin.png',
      'public/images/race-humano.png',
      'public/images/race-namekuseijin.png',
      'public/images/race-androide.png',
      'public/images/race-majin.png',
      'public/images/shenron.png',
    ];

    for (const file of legacyFiles) {
      expect(await Bun.file(`${import.meta.dir}/../${file}`).exists()).toBe(false);
    }
  });
});
