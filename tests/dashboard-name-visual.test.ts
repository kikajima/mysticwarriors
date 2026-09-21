import { describe, expect, test } from 'bun:test';

describe('Dashboard — nome do personagem', () => {
  test('usa caixa segura para a fonte display sem margem negativa', async () => {
    const dashboard = await Bun.file(
      `${import.meta.dir}/../src/components/game/Dashboard.tsx`
    ).text();
    const css = await Bun.file(
      `${import.meta.dir}/../src/app/globals.css`
    ).text();

    expect(dashboard).toContain('font-display-safe');
    expect(dashboard).toContain('items-start');
    expect(dashboard).toContain('overflow-visible');
    expect(dashboard).not.toContain('py-1 -my-1');

    expect(css).toContain('.font-display-safe');
    expect(css).toContain('padding-bottom: 0.16em');
    expect(css).toContain('line-height: 1.24');
  });
});
