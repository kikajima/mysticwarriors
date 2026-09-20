import { describe, expect, test } from 'bun:test';
import { EQUIPPED_SLOT_META, EQUIPPED_SLOTS } from '../src/lib/game/types';

describe('Inventário — reorganização de navegação e responsabilidades', () => {
  test('Inventário substitui Oficina na navegação principal e contém as três subabas', async () => {
    const page = await Bun.file(`${import.meta.dir}/../src/app/jogar/page.tsx`).text();
    const inventory = await Bun.file(`${import.meta.dir}/../src/components/game/InventoryPanel.tsx`).text();

    expect(page).toContain("key: 'inventory', label: 'Inventário'");
    expect(page).not.toContain("key: 'workshop', label: 'Oficina'");
    expect(page).toContain('<InventoryPanel');

    expect(inventory).toContain("key: 'items', label: 'Itens'");
    expect(inventory).toContain("key: 'equipment', label: 'Equipamento'");
    expect(inventory).toContain("key: 'workshop', label: 'Oficina'");
    expect(inventory).toContain('<WorkshopPanel');
    expect(inventory).toContain('embedded');
  });

  test('Loja não renderiza mais o inventário possuído', async () => {
    const shop = await Bun.file(`${import.meta.dir}/../src/components/game/ShopPanel.tsx`).text();
    expect(shop).not.toContain('Seu Inventário');
    expect(shop).not.toContain('Consumíveis prontos para usar');
    expect(shop).not.toContain("type: 'sell'");
    expect(shop).not.toContain("type: 'use_item'");
  });

  test('Equipamento publica oito espaços, incluindo Acessório II logo abaixo do I', async () => {
    const inventory = await Bun.file(`${import.meta.dir}/../src/components/game/InventoryPanel.tsx`).text();

    expect(EQUIPPED_SLOTS).toHaveLength(8);
    expect(EQUIPPED_SLOT_META.accessory.label).toBe('Acessório I');
    expect(EQUIPPED_SLOT_META.accessory2.label).toBe('Acessório II');
    for (const slot of EQUIPPED_SLOTS) {
      expect(inventory).toContain(`key: '${slot}'`);
    }
    expect(inventory).toContain("accessory', ...EQUIPPED_SLOT_META.accessory, grid: 'col-start-3 row-start-2'");
    expect(inventory).toContain("accessory2', ...EQUIPPED_SLOT_META.accessory2, grid: 'col-start-3 row-start-3'");

    expect(inventory).not.toContain('backing:');
    expect(inventory).toContain("type: 'equip'");
    expect(inventory).toContain("type: 'unequip'");
  });

  test('venda e uso continuam acessíveis pelo Inventário', async () => {
    const inventory = await Bun.file(`${import.meta.dir}/../src/components/game/InventoryPanel.tsx`).text();
    expect(inventory).toContain("type: 'sell'");
    expect(inventory).toContain("type: 'use_item'");
  });
});
