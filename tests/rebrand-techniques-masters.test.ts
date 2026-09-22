import { describe, expect, test } from 'bun:test';
import { TECHNIQUES, TRAINING_MASTERS } from '../src/lib/game/content/techniques';

describe('Rebrand etapa 3 — técnicas e mestres', () => {
  test('preserva IDs de técnicas e troca apenas a identidade pública', () => {
    expect(TECHNIQUES.map((t) => t.id)).toEqual([
      'rogafufuken',
      'megaton_punch',
      'kamehameha',
      'kienzan',
      'dodonpa',
      'kikoho',
      'makankosappo',
      'big_bang',
      'kaioken',
      'final_flash',
      'genki_dama',
    ]);

    expect(TECHNIQUES.map((t) => t.name)).toEqual([
      'Garras do Lobo Astral',
      'Impacto de Aço',
      'Onda de Aether',
      'Disco de Ruptura',
      'Lança Fotônica',
      'Prisma de Pressão',
      'Espiral Penetrante',
      'Nova de Caelum',
      'Sobrecarga Carmesim',
      'Ruptura do Horizonte',
      'Convergência do Aether',
    ]);
  });

  test('preserva IDs dos mestres e expõe os novos NPCs', () => {
    expect(TRAINING_MASTERS.map((m) => m.id)).toEqual([
      'kame',
      'satan',
      'kuririn',
      'tenshinhan',
      'piccolo',
      'vegeta',
      'rei_kai',
    ]);

    expect(TRAINING_MASTERS.map((m) => m.name)).toEqual([
      'Mestre Orun',
      'Brakus Vale',
      'Tarin Sol',
      'Sahir Venn',
      'Vaelor Syl',
      'Kael Voran',
      'Arconte Elyon',
    ]);
  });

  test('textos públicos desta camada não contêm nomes antigos', () => {
    const text = [
      ...TECHNIQUES.flatMap((t) => [t.name, t.description]),
      ...TRAINING_MASTERS.flatMap((m) => [m.name, m.title, m.quote, m.location]),
    ].join(' ');

    for (const legacy of [
      'Rogafufuken',
      'Megaton Punch',
      'Kamehameha',
      'Kienzan',
      'Dodonpa',
      'Kikoho',
      'Makankosappo',
      'Big Bang Attack',
      'Kaioken',
      'Final Flash',
      'Genki Dama',
      'Mestre Kame',
      'Mr. Satã',
      'Kuririn',
      'Tenshinhan',
      'Piccolo',
      'Vegeta',
      'Rei Kai',
      'Tartaruga',
      'Garça',
      'Kami',
    ]) {
      expect(text).not.toContain(legacy);
    }
  });
});
