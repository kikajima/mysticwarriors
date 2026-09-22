import { describe, expect, test } from 'bun:test';
import { TRANSFORMATIONS } from '../src/lib/game/content/transformations';

describe('Rebrand etapa 4 — transformações', () => {
  test('preserva todos os IDs persistidos', () => {
    expect(TRANSFORMATIONS.map((t) => t.id)).toEqual([
      'saiyajin_oozaru',
      'saiyajin_ss1',
      'saiyajin_ss2_forja',
      'saiyajin_ss2_mestre',
      'saiyajin_ss2_furia',
      'humano_despertar',
      'humano_potencial',
      'humano_instinto',
      'humano_aura',
      'humano_kaio',
      'nameku_sinergia',
      'nameku_super',
      'nameku_dragao',
      'nameku_guardiao',
      'nameku_sabio',
      'androide_overclock',
      'androide_nanotech',
      'androide_absorcao',
      'androide_eterno',
      'androide_raio',
      'majin_pura',
      'majin_caos',
      'majin_kid',
      'majin_absoluto',
      'majin_arcano',
    ]);
  });

  test('expõe as 25 formas com a nova identidade', () => {
    expect(TRANSFORMATIONS.map((t) => t.name)).toEqual([
      'Fera Lupina',
      'Ascensão Prateada',
      'Forja do Titã Lupino',
      'Matilha Solitária',
      'Fúria da Alcateia',
      'Despertar Tático',
      'Potencial Vanguardiano',
      'Reflexo Absoluto',
      'Disciplina Serena',
      'Convergência Celeste',
      'Sinergia Raiz',
      'Ascensão Silvestre',
      'Colosso de Sylva',
      'Guardião Celestial',
      'Oráculo do Horizonte',
      'Sobrecarga',
      'Nano-melhorias',
      'Protocolo de Absorção',
      'Reator Eterno',
      'Canhão de Raio Puro',
      'Forma Pura',
      'Caos Desencadeado',
      'Forma Original',
      'Núcleo Caótico',
      'Feitiço Arcano Supremo',
    ]);
  });

  test('remove referências antigas dos textos públicos das transformações', () => {
    const text = TRANSFORMATIONS
      .flatMap((t) => [t.name, t.description])
      .join(' ');

    for (const legacy of [
      'Oozaru',
      'Super Saiyajin',
      'SSJ2',
      'Namekuseijin',
      'Namekusei',
      'Majin',
      'Bibidi',
      'Drs. Gero',
      'Brief',
      'Ancião Kaio',
      'Torre de Karin',
    ]) {
      expect(text).not.toContain(legacy);
    }
  });
});
