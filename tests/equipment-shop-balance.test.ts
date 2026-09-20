import { describe, expect, test } from 'bun:test';
import { SHOP_ITEMS } from '../src/lib/game/content/world';
import { CRAFTED_ITEMS } from '../src/lib/game/content/crafting';
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_META,
  EQUIPPED_SLOTS,
  type EquipmentSlot,
  type ShopItem,
} from '../src/lib/game/types';

function combatScore(item: ShopItem): number {
  return (item.atk ?? 0) + (item.def ?? 0) + (item.spd ?? 0) + (item.ki ?? 0);
}

describe('Loja e Oficina — equipamentos claros e progressão coerente', () => {
  test('itens históricos que estavam em categorias confusas agora ocupam o slot correto', () => {
    expect(SHOP_ITEMS.find((item) => item.id === 'luvas')?.category).toBe('wrists');
    expect(SHOP_ITEMS.find((item) => item.id === 'punho_dragao')?.category).toBe('wrists');
    expect(SHOP_ITEMS.find((item) => item.id === 'botas')?.category).toBe('boots');
    expect(SHOP_ITEMS.find((item) => item.id === 'bandana')?.category).toBe('head');
  });

  test('toda categoria corporal possui uma seleção comercial real', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const items = SHOP_ITEMS.filter((item) => item.category === slot);
      expect(items.length).toBeGreaterThanOrEqual(4);
      expect(items.every((item) => item.price > 0)).toBe(true);
    }
  });

  test('descrições de todo equipamento dizem explicitamente onde ele equipa', () => {
    const equipment = [...SHOP_ITEMS, ...CRAFTED_ITEMS].filter((item) =>
      EQUIPMENT_SLOTS.includes(item.category as EquipmentSlot)
    );
    expect(equipment.length).toBeGreaterThan(30);
    for (const item of equipment) {
      expect(item.description).toContain('Slot:');
      const expected =
        item.category === 'accessory'
          ? 'Acessório'
          : EQUIPMENT_SLOT_META[item.category as EquipmentSlot].label;
      expect(item.description).toContain(expected);
    }
  });

  test('o melhor craft é superior ao melhor item da loja em todas as sete categorias', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const bestShop = Math.max(
        ...SHOP_ITEMS.filter((item) => item.category === slot).map(combatScore)
      );
      const bestCraft = Math.max(
        ...CRAFTED_ITEMS.filter((item) => item.category === slot).map(combatScore)
      );
      expect(bestCraft).toBeGreaterThan(bestShop);
    }
  });

  test('contrato publica exatamente dois espaços de acessório e oito espaços equipáveis', () => {
    expect(EQUIPPED_SLOTS.filter((slot) => slot === 'accessory' || slot === 'accessory2')).toEqual([
      'accessory',
      'accessory2',
    ]);
    expect(EQUIPPED_SLOTS).toHaveLength(8);
  });

  test('UI separa todas as categorias da loja e mostra total = base + equipamento', async () => {
    const shop = await Bun.file(`${import.meta.dir}/../src/components/game/ShopPanel.tsx`).text();
    for (const slot of EQUIPMENT_SLOTS) {
      expect(shop).toContain(`key: '${slot}'`);
    }
    expect(shop).toContain('Slot: {slotText(item)}');

    const dashboard = await Bun.file(`${import.meta.dir}/../src/components/game/Dashboard.tsx`).text();
    expect(dashboard).toContain('Base {base}');
    expect(dashboard).toContain("Equip. {bonus > 0 ? `+${bonus}` : '+0'}");
    expect(dashboard).toContain('Total = atributo base + bônus dos equipamentos');
    expect(dashboard).toContain('player.derived.totalStats');
  });
});
