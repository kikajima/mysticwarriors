import { describe, expect, test } from 'bun:test';
import { BOTS } from '../src/lib/game/content/names';
import { COSMETICS, COSMETIC_SETS } from '../src/lib/game/content/cosmetics';

describe('Rebrand etapa 7 — cosméticos, NPCs e lore', () => {
  test('mantém IDs de cosméticos existentes e expõe a nova identidade', () => {
    expect(COSMETICS.find((item) => item.id === 'bg_planeta_namek')?.name).toBe('Fundo: Sylva');
    expect(COSMETICS.find((item) => item.id === 'roupa_gi_branco')?.name).toBe('Traje Branco do Mestre');
    expect(COSMETICS.find((item) => item.id === 'nameplate_dragao_eterno')?.name).toBe('Nameplate do Horizonte');
    expect(COSMETIC_SETS.find((set) => set.id === 'heranca_dragao')?.name).toBe('Herança do Horizonte');
  });

  test('bots públicos usam nomes próprios do Setor Caelum', () => {
    expect(BOTS.map((bot) => bot.name)).toEqual([
      'Kael Voran',
      'Rhyss da Matilha',
      'Moroq do Vazio',
      'Vaelor Syl',
      'Nexus-87',
      'Sorin Escarlate',
      'Tarek do Horizonte',
      'Sahir Venn',
      'Ravel Lobo',
      'Tarin Sol',
      'Maelis',
      'Sylven-47',
      'Mercenário Kovar',
      'Auron Renegado',
      'Mestre Orun',
    ]);
  });

  test('camada pública desta etapa não contém referências antigas', async () => {
    const files = [
      'src/lib/game/content/cosmetics.ts',
      'src/lib/game/content/names.ts',
      'src/lib/wiki/wiki-content.ts',
      'src/components/game/ShopPanel.tsx',
      'src/components/game/CharacterCreate.tsx',
      'src/app/universo/page.tsx',
      'src/app/page.tsx',
    ];

    const publicSource = (
      await Promise.all(files.map((file) => Bun.file(`${import.meta.dir}/../${file}`).text()))
    ).join('\n');

    for (const legacy of [
      'Namekusei',
      'Tartaruga',
      'Freeza',
      'Gohan',
      'Kaioshin',
      'Mestre Kame',
      'Príncipe Vejor',
      'Picolan',
      'Gotan',
      'Yamcho',
      'Kuririn',
      'Herança do Dragão',
      'Dragão Eterno',
    ]) {
      expect(publicSource).not.toContain(legacy);
    }
  });
});
