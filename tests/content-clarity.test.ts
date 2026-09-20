import { describe, expect, test } from 'bun:test';
import { TECHNIQUES, STRATEGY_LIST } from '../src/lib/game/content/techniques';
import { SHOP_ITEMS } from '../src/lib/game/content/world';
import { CRAFTED_ITEMS, CRAFT_RECIPES } from '../src/lib/game/content/crafting';

describe('clareza de conteúdo — itens e técnicas', () => {
  test('catálogos relevantes têm descrições preenchidas', () => {
    for (const entry of [...TECHNIQUES, ...STRATEGY_LIST, ...SHOP_ITEMS, ...CRAFTED_ITEMS, ...CRAFT_RECIPES]) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
  });

  test('interfaces exibem descrições e efeitos mecânicos', async () => {
    const shop = await Bun.file(`${import.meta.dir}/../src/components/game/ShopPanel.tsx`).text();
    const inventory = await Bun.file(`${import.meta.dir}/../src/components/game/InventoryPanel.tsx`).text();
    const training = await Bun.file(`${import.meta.dir}/../src/components/game/TrainingPanel.tsx`).text();

    expect(shop).toContain('{item.description}');
    expect(inventory).toContain('{item.description}');
    expect(inventory).toContain('dragonBallChanceBonus');
    expect(training).toContain('{tech.description}');
    expect(training).toContain('{tech!.description}');
    expect(training).toContain('techniqueDetailLabels');
    expect(training).toContain('{s.description}');
  });
});
