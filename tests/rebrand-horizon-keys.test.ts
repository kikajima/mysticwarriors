import { describe, expect, test } from 'bun:test';
import { ACHIEVEMENTS } from '../src/lib/game/content/quests';
import { SHOP_ITEMS } from '../src/lib/game/content/world';
import { WIKI_SECTIONS } from '../src/lib/wiki/wiki-content';

describe('Rebrand etapa 5 — Chaves do Horizonte e Aethelgard', () => {
  test('mantém os contratos internos legados enquanto troca a identidade pública', () => {
    const achievement = ACHIEVEMENTS.find((item) => item.id === 'dragao_7');
    expect(achievement?.metric).toBe('dragonBalls');
    expect(achievement?.name).toBe('Guardião das Chaves');
    expect(achievement?.icon).toBe('◇');

    const tracker = SHOP_ITEMS.find((item) => item.id === 'radar_esferas');
    expect(tracker?.name).toBe('Rastreador do Horizonte');
    expect(tracker?.dragonBallSearchChanceBonus).toBe(0.3);
  });

  test('wiki apresenta somente a nova identidade do colecionável', () => {
    const section = WIKI_SECTIONS.find((item) => item.id === 'esferas-dragao');
    expect(section?.title).toBe('Chaves do Horizonte e Aethelgard');

    const text = JSON.stringify(section);
    for (const legacy of ['Esferas do Dragão', 'Esfera do Dragão', 'Shenlon', 'Shenron', 'Radar das Esferas']) {
      expect(text).not.toContain(legacy);
    }
    expect(text).toContain('Convergência do Horizonte');
    expect(text).toContain('Bênçãos Primordiais');
  });

  test('Chaves usam identidade visual própria, sem orbes ou estrelas numeradas', async () => {
    const [tracker, ranking, activities, game] = await Promise.all([
      Bun.file(`${import.meta.dir}/../src/components/game/ShenronPanel.tsx`).text(),
      Bun.file(`${import.meta.dir}/../src/components/game/RankingPanel.tsx`).text(),
      Bun.file(`${import.meta.dir}/../src/components/game/ProfessionsPanel.tsx`).text(),
      Bun.file(`${import.meta.dir}/../src/app/jogar/page.tsx`).text(),
    ]);

    const publicKeyUi = [tracker, ranking, activities, game].join('\n');
    expect(publicKeyUi).not.toContain('🔮');
    expect(tracker).not.toContain("'⭐'.repeat");
    expect(ranking).not.toContain('★');
    expect(tracker).toContain('CH-{i + 1}');
    expect(ranking).toContain('CH-${star}');
    expect(publicKeyUi).toContain('◇');
  });

  test('telas públicas não exibem os termos antigos', async () => {
    const files = [
      'src/components/game/ShenronPanel.tsx',
      'src/components/game/ProfessionsPanel.tsx',
      'src/components/game/InventoryPanel.tsx',
      'src/components/game/AdminPanel.tsx',
      'src/components/game/BattleLogDialog.tsx',
      'src/app/jogar/page.tsx',
      'src/app/page.tsx',
      'src/app/layout.tsx',
      'src/app/jogar/layout.tsx',
      'src/app/universo/page.tsx',
      'src/app/wiki/page.tsx',
      'src/components/wiki/WikiView.tsx',
      'public/manifest.webmanifest',
    ];

    const visibleSource = (
      await Promise.all(files.map((file) => Bun.file(`${import.meta.dir}/../${file}`).text()))
    )
      .join('\n')
      // Nome interno do componente/arquivo fica legado para compatibilidade técnica.
      .replaceAll('ShenronPanel', '');

    for (const legacy of ['Esferas do Dragão', 'Esfera do Dragão', 'Shenlon', 'Busca pelas Esferas', 'dragão sagrado']) {
      expect(visibleSource).not.toContain(legacy);
    }
  });
});
