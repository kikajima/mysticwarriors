import { describe, expect, test } from 'bun:test';

describe('Oficina — carregamento resiliente', () => {
  test('faz retry com janela maior antes de mostrar falha', async () => {
    const src = await Bun.file(`${import.meta.dir}/../src/components/game/WorkshopPanel.tsx`).text();
    expect(src).toContain('attempt < 2');
    expect(src).toContain("attempt === 0 ? 8_000 : 12_000");
    expect(src).toContain('setTimeout(resolve, 600)');
  });

  test('não transforma estoque desconhecido em zero nas receitas', async () => {
    const src = await Bun.file(`${import.meta.dir}/../src/components/game/WorkshopPanel.tsx`).text();
    expect(src).toContain('{inventory !== null && (');
    expect(src.indexOf('{inventory !== null && (')).toBeLessThan(src.indexOf('Receitas da Oficina'));
  });
});
