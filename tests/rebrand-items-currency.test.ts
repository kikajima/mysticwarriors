import { describe, expect, test } from 'bun:test';
import { getItem } from '../src/lib/game/content/world';

describe('Rebrand etapa 6 — itens e moeda pública', () => {
  test('preserva IDs internos e troca os nomes públicos dos itens legados', () => {
    expect(getItem('senzu')).toMatchObject({
      name: 'Fruto de Sylva',
      effect: 'full_hp',
    });
    expect(getItem('scouter_basico')?.name).toBe('Visor de Fluxo Básico');
    expect(getItem('potara')?.name).toBe('Brinco de Convergência');
    expect(getItem('armadura_saiyajin')?.name).toBe('Armadura Solaris');
    expect(getItem('armadura_freeza')?.name).toBe('Blindagem Imperial de Varth');
    expect(getItem('capsula_ki')?.name).toBe('Módulo de Energia');
  });

  test('catálogo da Oficina mantém IDs legados sem exibir nomes derivados', async () => {
    const source = await Bun.file(
      `${import.meta.dir}/../src/lib/game/content/crafting.ts`
    ).text();

    expect(source).toContain("id: 'senzu_processado'");
    expect(source).toContain("id: 'visor_scouter_tatico'");
    expect(source).toContain("id: 'elmo_combate_saiyajin'");
    expect(source).toContain("name: 'Fruto de Sylva Processado'");
    expect(source).toContain("name: 'Visor de Fluxo Tático'");
    expect(source).toContain("name: 'Elmo de Combate Solaris'");

    for (const legacy of [
      'Feijão Senzu',
      'Visor Scouter',
      'Armadura de Combate Saiyajin',
      'Braceletes Saiyajin',
      'Grevas Saiyajin',
      'Botas Saiyajin',
    ]) {
      expect(source).not.toContain(legacy);
    }
  });

  test('telas econômicas exibem Créditos sem renomear o campo interno zeni', async () => {
    const files = [
      'src/components/game/ShopPanel.tsx',
      'src/components/game/MarketPanel.tsx',
      'src/components/game/MarketBuyOrders.tsx',
      'src/components/game/TrainingPanel.tsx',
      'src/components/game/ProfessionsPanel.tsx',
      'src/components/game/GuildsPanel.tsx',
      'src/components/game/TournamentPanel.tsx',
      'src/components/game/Dashboard.tsx',
      'src/components/game/WorkshopPanel.tsx',
    ];

    const source = (
      await Promise.all(
        files.map((file) => Bun.file(`${import.meta.dir}/../${file}`).text())
      )
    ).join('\n');

    expect(source).toContain('Créditos');
    expect(source).toContain('player.zeni');
    expect(source).not.toMatch(/\bZeni\b/);
  });
});
