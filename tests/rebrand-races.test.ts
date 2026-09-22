import { describe, expect, test } from 'bun:test';
import { RACES } from '../src/lib/game/content/races';

describe('Rebrand etapa 2 — raças públicas', () => {
  test('mantém IDs persistidos e expõe apenas os novos nomes', () => {
    expect(Object.keys(RACES)).toEqual([
      'saiyajin',
      'humano',
      'namekuseijin',
      'androide',
      'majin',
    ]);

    expect(RACES.saiyajin.name).toBe('Solaris');
    expect(RACES.humano.name).toBe('Vanguardiano');
    expect(RACES.namekuseijin.name).toBe('Verdant');
    expect(RACES.androide.name).toBe('Sintético');
    expect(RACES.majin.name).toBe('Amorph');
  });

  test('remove referências antigas das descrições e taglines públicas', () => {
    const publicText = Object.values(RACES)
      .flatMap((race) => [race.name, race.tagline, race.description, ...race.perks])
      .join(' ');

    for (const legacy of ['Saiyajin', 'Namekuseijin', 'Majin', 'Zenkai', 'Namekusei']) {
      expect(publicText).not.toContain(legacy);
    }
  });
});
