import { describe, expect, test } from 'bun:test';

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

  test('Equipamento publica os sete slots corporais como slots reais', async () => {
    const inventory = await Bun.file(`${import.meta.dir}/../src/components/game/InventoryPanel.tsx`).text();

    for (const label of ['Cabeça', 'Torso', 'Pernas', 'Botas', 'Punhos', 'Acessório', 'Arma']) {
      expect(inventory).toContain(`label: '${label}'`);
    }
    for (const slot of ['head', 'wrists', 'armor', 'accessory', 'weapon', 'legs', 'boots']) {
      expect(inventory).toContain(`key: '${slot}'`);
    }

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
