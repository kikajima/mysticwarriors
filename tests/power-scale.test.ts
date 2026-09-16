// tests/power-scale.test.ts — Escala de Poder (ASCENSÃO Z, Cap. 5)
// ---------------------------------------------------------------------
// Módulo puro src/lib/game/powerScale.ts: classificação do poder do
// scouter nas 10 escalas do sistema do dono + regra 5.1 (diferença).

import { describe, expect, test } from 'bun:test';
import { POWER_SCALES, getPowerScale, scaleDiff, scaleDiffLabel } from '../src/lib/game/powerScale';

describe('Escala de Poder — ASCENSÃO Z (Cap. 5)', () => {
  test('a trilha tem as 10 escalas do livro, de Mortal Comum a Transcendente', () => {
    expect(POWER_SCALES.length).toBe(10);
    expect(POWER_SCALES.map((s) => s.nome)).toEqual([
      'Mortal Comum',
      'Marcial',
      'Super-Humana',
      'Guerreiro Planetário',
      'Guerreiro Estelar',
      'Guerreiro Galáctico',
      'Guerreiro Cósmico',
      'Divino',
      'Deus Maior',
      'Transcendente',
    ]);
    // índices 0..9 em ordem, thresholds crescentes
    POWER_SCALES.forEach((s, i) => expect(s.index).toBe(i));
    for (let i = 1; i < POWER_SCALES.length; i++) {
      expect(POWER_SCALES[i].threshold).toBeGreaterThan(POWER_SCALES[i - 1].threshold);
    }
  });

  test('personagem recém-criado (poder ~111) é Mortal Comum', () => {
    expect(getPowerScale(111).scale.index).toBe(0);
    expect(getPowerScale(111).scale.nome).toBe('Mortal Comum');
  });

  test('classificação nos limites exatos de cada escala', () => {
    // no limiar → pertence à escala nova
    expect(getPowerScale(120).scale.index).toBe(1); // Marcial
    expect(getPowerScale(119).scale.index).toBe(0);
    expect(getPowerScale(280).scale.index).toBe(2); // Super-Humana
    expect(getPowerScale(850).scale.index).toBe(3); // Planetário
    expect(getPowerScale(1800).scale.index).toBe(4); // Estelar
    expect(getPowerScale(4000).scale.index).toBe(5); // Galáctico
    expect(getPowerScale(9000).scale.index).toBe(6); // Cósmico
    expect(getPowerScale(20000).scale.index).toBe(7); // Divino
    expect(getPowerScale(45000).scale.index).toBe(8); // Deus Maior
    expect(getPowerScale(100000).scale.index).toBe(9); // Transcendente
  });

  test('calibração com o conteúdo real do jogo (bots/entreteni­mento)', () => {
    // Mestre Kamo L2 = 168 → Marcial; Kaoran L32 = 1598 → Planetário;
    // World Boss Kronar ≈ 2840 → Estelar (1800+)
    expect(getPowerScale(168).scale.index).toBe(1);
    expect(getPowerScale(1598).scale.index).toBe(3);
    expect(getPowerScale(2840).scale.index).toBe(4);
  });

  test('progresso e poder restante rumo à próxima escala', () => {
    const p = getPowerScale(300); // Super-Humana [280, 850)
    expect(p.scale.index).toBe(2);
    expect(p.next?.nome).toBe('Guerreiro Planetário');
    expect(p.powerToNext).toBe(550);
    expect(p.progress).toBeCloseTo(20 / 570, 5);
  });

  test('Transcendente (topo): sem próxima escala, progresso 1, resto 0', () => {
    const p = getPowerScale(999_999);
    expect(p.scale.index).toBe(9);
    expect(p.next).toBeNull();
    expect(p.progress).toBe(1);
    expect(p.powerToNext).toBe(0);
  });

  test('lixo (NaN/negativo/Infinity) vira Mortal Comum sem lançar', () => {
    for (const bad of [Number.NaN, -5, Number.NEGATIVE_INFINITY, Number.NaN]) {
      const r = getPowerScale(bad);
      expect(r.scale.index).toBe(0);
      expect(r.powerToNext).toBe(120); // limiar da Marcial a partir de 0
    }
    // Infinity positivo: sobe até onde der — sem crash
    expect(getPowerScale(Number.POSITIVE_INFINITY).scale.index).toBe(9);
  });

  test('regra 5.1 — diferença de escala entre dois poderes', () => {
    expect(scaleDiff(900, 111)).toBe(3); // Planetário vs Mortal Comum
    expect(scaleDiff(111, 900)).toBe(-3);
    expect(scaleDiff(200, 200)).toBe(0);
  });

  test('rótulos da UI: perigo / neutro / vantagem', () => {
    expect(scaleDiffLabel(900, 111).text).toBe('+3 escalas acima');
    expect(scaleDiffLabel(900, 111).className).toContain('text-red-300');
    expect(scaleDiffLabel(200, 200).text).toBe('mesma escala');
    expect(scaleDiffLabel(150, 1110).text).toBe('2 escalas abaixo');
    expect(scaleDiffLabel(150, 1110).className).toContain('text-emerald-300');
  });
});
