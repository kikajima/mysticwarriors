import { describe, expect, test } from 'bun:test';
import {
  IMPETO,
  IMPETO_COMBO_THRESHOLD,
  clampImpeto,
  isHeavyBlow,
  effectiveScalePower,
} from '../src/lib/game/impeto';
import { simulateBattle, makeRng } from '../src/lib/game/engine';
import { getStrategy } from '../src/lib/game/content/techniques';
import { raceCombat } from '../src/lib/game/rules';
import { scaleCombatRules } from '../src/lib/game/powerScale';
import type { Combatant, StrategyDef, TechniqueDef } from '../src/lib/game/types';

// =====================================================================
// TESTES — ÍMPETO (v0.9.13)
// Capítulos 7 e 29 do ASCENSÃO Z traduzidos para o motor de combate:
//  * máximo 6 Ímpetos, combate começa com 1;
//  * Espírito de Superação: ≥1 escala abaixo → +1 no início;
//  * gatilhos: golpe poderoso recebido (+1, 1×/gatilho/rodada),
//    Abertura/crítico (+1 — ataques extra de combo NÃO geram), cair
//    abaixo da metade da Vida (+1, 1×/combate);
//  * gastos: 1 = estender combo (golpe extra imediato com decaimento),
//    2 = Defesa Heroica (golpe poderoso pela metade), 3 = Quebra de
//    Limite (1×/combate: +1 Escala por 2 rodadas);
//  * decisões 100% determinísticas (sem consumo de rng adicional).
// =====================================================================

function combatant(overrides: Partial<Combatant> & { name: string; power: number }): Combatant {
  return {
    emoji: '🥋',
    level: 10,
    race: 'none',
    strength: 50,
    defense: 50,
    speed: 50,
    ki: 50,
    maxHp: 4000,
    atkPower: 110,
    kiPower: 120,
    defPower: 90,
    resPower: 100,
    raceCombat: raceCombat('humano'),
    techniques: [] as TechniqueDef[],
    strategy: getStrategy('balanced') as StrategyDef,
    maxBattleKi: 240,
    battleKi: 240,
    transformation: null,
    ...overrides,
  };
}

function battle(player: Partial<Combatant> & { name: string; power: number }, enemy: Partial<Combatant> & { name: string; power: number }, seed = 12345) {
  return simulateBattle(combatant(player), combatant(enemy), {
    playerStartHp: 4000,
    rng: makeRng(seed),
  });
}

describe('IMPETO — constantes do Capítulo 7', () => {
  test('máximo 6 Ímpetos, começa com 1', () => {
    expect(IMPETO.max).toBe(6);
    expect(IMPETO.start).toBe(1);
  });

  test('tabela de custos do livro: combo 1, defesa heroica 2, quebra de limite 3', () => {
    expect(IMPETO.comboCost).toBe(1);
    expect(IMPETO.heroicDefenseCost).toBe(2);
    expect(IMPETO.quebraCost).toBe(3);
  });

  test('máximo normal: 3 ataques totais no combo, decaimento cumulativo', () => {
    expect(IMPETO.comboMaxAttacks).toBe(3);
    expect(IMPETO.comboDamageDecay).toBeLessThan(1);
  });

  test('Quebra de Limite: 1×/combate, +1 Escala, 2 rodadas (Cap. 29)', () => {
    expect(IMPETO.quebraScaleBonus).toBe(1);
    expect(IMPETO.quebraRounds).toBe(2);
  });
});

describe('clampImpeto / isHeavyBlow (helpers puros)', () => {
  test('clamp respeita o máximo do Cap. 7 e rejeita lixo', () => {
    expect(clampImpeto(7)).toBe(6);
    expect(clampImpeto(-3)).toBe(0);
    expect(clampImpeto(2.9)).toBe(2);
    expect(clampImpeto(NaN)).toBe(0);
  });

  test('golpe poderoso: ≥18% do HP máximo do RECEBEDOR', () => {
    expect(isHeavyBlow(180, 1000)).toBe(true);
    expect(isHeavyBlow(179, 1000)).toBe(false);
    expect(isHeavyBlow(10, 0)).toBe(false); // HP inválido
  });
});

describe('effectiveScalePower (Quebra de Limite — Cap. 29)', () => {
  test('sem Quebra ativa devolve o poder original', () => {
    expect(effectiveScalePower(111, false)).toBe(111);
  });

  test('com Quebra ativa sobe exatamente 1 escala (patamar mínimo da seguinte)', () => {
    // 111 → Mortal Comum(0); Quebra → Marcial(1) = threshold 120
    expect(effectiveScalePower(111, true)).toBe(120);
    // 500 → Super-Humana(2); Quebra → Planetária(3) = threshold 850
    expect(effectiveScalePower(500, true)).toBe(850);
  });

  test('poder já no topo não passa de Transcendente', () => {
    expect(effectiveScalePower(500000, true)).toBe(500000);
  });

  test('com Quebra ativa o poder efetivo NUNCA fica abaixo do original', () => {
    // bump é sempre crescente (threshold da escala seguinte > poder atual)
    expect(effectiveScalePower(300, true)).toBeGreaterThan(300);
    expect(effectiveScalePower(300, true)).toBe(850);
  });
});

describe('IMPETO_COMBO_THRESHOLD (política por estratégia)', () => {
  test('agressivos/body a corpo encadeiam combos com menos Ímpeto', () => {
    expect(IMPETO_COMBO_THRESHOLD.aggressive).toBeLessThanOrEqual(IMPETO_COMBO_THRESHOLD.balanced);
    expect(IMPETO_COMBO_THRESHOLD.melee).toBeLessThanOrEqual(IMPETO_COMBO_THRESHOLD.balanced);
    expect(IMPETO_COMBO_THRESHOLD.defensive).toBeGreaterThanOrEqual(IMPETO_COMBO_THRESHOLD.balanced);
  });
});

describe('Ímpeto na simulação (gatilhos e narrativa)', () => {
  test('combate de MESMA escala: ambos começam com 1 Ímpeto', () => {
    const sim = battle({ name: 'A', power: 1000, speed: 60 }, { name: 'B', power: 1000, speed: 60 });
    const first = sim.rounds[0];
    expect(first.playerImpeto).toBe(IMPETO.start);
    expect(first.enemyImpeto).toBe(IMPETO.start);
  });

  test('Espírito de Superação: o azarão (≥1 escala abaixo) começa com +1', () => {
    // jogador 100 (Mortal 0) vs inimigo 285 (Super-Humana 2)
    const sim = battle({ name: 'Azarao', power: 100, speed: 60 }, { name: 'Favorito', power: 285, speed: 60 });
    const first = sim.rounds[0];
    expect(first.playerImpeto).toBe(IMPETO.start + 1);
    expect(first.enemyImpeto).toBe(IMPETO.start);
  });

  test('Espírito de Superação é simétrico: inimigo abaixo também ganha', () => {
    const sim = battle({ name: 'Favorito', power: 285, speed: 60 }, { name: 'Azarao', power: 100, speed: 60 });
    const first = sim.rounds[0];
    expect(first.playerImpeto).toBe(IMPETO.start);
    expect(first.enemyImpeto).toBe(IMPETO.start + 1);
  });

  test('medidor de Ímpeto nunca ultrapassa 6 (Cap. 7)', () => {
    // luta desgastante de mesmas escalas: muitos gatilhos de golpe pesado
    const sim = battle(
      { name: 'A', power: 1000, speed: 60, atkPower: 400, kiPower: 400 },
      { name: 'B', power: 1000, speed: 60, atkPower: 400, kiPower: 400 },
      777
    );
    for (const r of sim.rounds) {
      expect(r.playerImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
      expect(r.enemyImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
      expect(r.playerImpeto ?? 0).toBeGreaterThanOrEqual(0);
      expect(r.enemyImpeto ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  test('golpes que acertam carregam o Ímpeto ao longo da luta (snapshot por round)', () => {
    const sim = battle(
      { name: 'A', power: 1000, speed: 60, atkPower: 250, kiPower: 250 },
      { name: 'B', power: 1000, speed: 60, atkPower: 250, kiPower: 250 },
      4242
    );
    // todos os rounds têm o par de instantâneos do Ímpeto
    for (const r of sim.rounds) {
      expect(r.playerImpeto).toBeDefined();
      expect(r.enemyImpeto).toBeDefined();
    }
  });

  test('narrativa dos eventos de Ímpeto aparece no log (gatilhos)', () => {
    // dano alto → golpes poderosos → ganhos narrados
    const sim = battle(
      { name: 'A', power: 1000, speed: 60, atkPower: 500, kiPower: 500 },
      { name: 'B', power: 1000, speed: 60, atkPower: 500, kiPower: 500 },
      99
    );
    const allText = sim.rounds.map((r) => r.text).join(' ');
    const hasImpetoNarrative =
      allText.includes('Ímpeto') || allText.includes('Defesa Heroica') || allText.includes('QUEBRA DE LIMITE');
    expect(hasImpetoNarrative).toBe(true);
  });

  test('combos encadeados respeitam o máximo normal de 3 ataques por rodada', () => {
    // estratégia agressiva: encadeia com 1 Ímpeto em caixa
    const sim = simulateBattle(
      combatant({ name: 'Aggro', power: 1000, speed: 80, atkPower: 60, kiPower: 60, strategy: getStrategy('aggressive') as StrategyDef }),
      combatant({ name: 'Tank', power: 1000, speed: 10, maxHp: 30000, defPower: 40, resPower: 40, atkPower: 60, kiPower: 60 }),
      { playerStartHp: 4000, rng: makeRng(555) }
    );
    // por rodada, o número de golpes de UM lado nunca passa de 3 (1 + 2 extensões)
    const perRound = new Map<number, number>();
    for (const r of sim.rounds) {
      if (r.attacker === 'player' && r.action !== 'dodge') {
        perRound.set(r.round, (perRound.get(r.round) ?? 0) + 1);
      }
    }
    for (const count of perRound.values()) {
      expect(count).toBeLessThanOrEqual(IMPETO.comboMaxAttacks);
    }
  });

  test('golpe extra de combo tem dano com decaimento (−25% cumulativo)', () => {
    // mesmo combatente, mesmas condições: combo 1º extra vs golpe básico
    // — verificamos que o decaimento está codificado na constante e
    // aplicado no raw (teste de sanidade da fórmula pura).
    expect(Math.pow(IMPETO.comboDamageDecay, 1)).toBeCloseTo(0.75, 5);
    expect(Math.pow(IMPETO.comboDamageDecay, 2)).toBeCloseTo(0.5625, 5);
  });

  test('Defesa Heroica: narrada quando dispara (2 Ímpetos, impacto pela metade)', () => {
    // simulação com golpes fortíssimos: alguém vai pagar 2 Ímpetos
    const sims = [11, 22, 33, 44, 55, 66, 77, 88].map((seed) =>
      battle(
        { name: 'A', power: 1000, speed: 60, atkPower: 900, kiPower: 900 },
        { name: 'B', power: 1000, speed: 60, atkPower: 900, kiPower: 900 },
        seed
      )
    );
    const anyHeroic = sims.some((s) => s.rounds.some((r) => r.impetoEvent === 'heroic-defense'));
    expect(anyHeroic).toBe(true);
  });

  test('Quebra de Limite dispara para quem cai abaixo da metade com 3+ Ímpetos', () => {
    // várias sementes: golpes PODEROSOS (≥18% do HP) carregam Ímpeto e a
    // luta desgasta — alguém quebra o limite
    const sims = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) =>
      battle(
        { name: 'A', power: 1000, speed: 60, atkPower: 900, kiPower: 900, maxHp: 3000 },
        { name: 'B', power: 1000, speed: 61, atkPower: 900, kiPower: 900, maxHp: 3000 },
        seed
      )
    );
    const anyQuebra = sims.some((s) => s.rounds.some((r) => r.impetoEvent === 'quebra-de-limite'));
    expect(anyQuebra).toBe(true);
    // e a narrativa do Cap. 29 aparece no texto do round
    const withQuebra = sims.find((s) => s.rounds.some((r) => r.impetoEvent === 'quebra-de-limite'))!;
    expect(withQuebra.rounds.map((r) => r.text).join(' ')).toContain('QUEBRA DE LIMITE');
  });

  test('Quebra de Limite acontece no MÁXIMO uma vez por lado por combate', () => {
    const sims = [1, 2, 3, 4, 5].map((seed) =>
      battle(
        { name: 'A', power: 1000, speed: 60, atkPower: 900, kiPower: 900, maxHp: 2500 },
        { name: 'B', power: 1000, speed: 61, atkPower: 900, kiPower: 900, maxHp: 2500 },
        seed
      )
    );
    for (const s of sims) {
      const playerQuebras = s.rounds.filter((r) => r.attacker === 'player' && r.impetoEvent === 'quebra-de-limite').length;
      const enemyQuebras = s.rounds.filter((r) => r.attacker === 'enemy' && r.impetoEvent === 'quebra-de-limite').length;
      expect(playerQuebras).toBeLessThanOrEqual(1);
      expect(enemyQuebras).toBeLessThanOrEqual(1);
    }
  });

  test('Ímpeto simétrico: azarão com Quebra ativa luta com +1 Escala (efeito real)', () => {
    // azarão 2 escalas abaixo (armadura 2) vs superior: com Quebra ativa
    // a armadura cai para 1 — a diferença efetiva encolhe 1 nível.
    // 130 → Marcial(1); 900 → Planetária(3): diferença 2.
    const a = combatant({ name: 'A', power: 130 });
    const aEff = effectiveScalePower(a.power, true); // → 280 (Super-Humana)
    const semQuebra = scaleCombatRules(130, 900);
    const comQuebra = scaleCombatRules(aEff, 900);
    expect(semQuebra.armor).toBe(2);
    expect(comQuebra.armor).toBe(1);
  });

  test('combate segue ÍNTEGRO: rounds, vitória e HPs coerentes com Ímpeto ativo', () => {
    const sim = battle({ name: 'A', power: 1000, speed: 60 }, { name: 'B', power: 1000, speed: 60 }, 31337);
    expect(sim.rounds.length).toBeGreaterThan(0);
    expect(sim.playerEndHp).toBeGreaterThanOrEqual(0);
    expect(sim.enemyEndHp).toBeGreaterThanOrEqual(0);
    for (const r of sim.rounds) {
      expect(r.playerHp).toBeGreaterThanOrEqual(0);
      expect(r.enemyHp).toBeGreaterThanOrEqual(0);
    }
  });
});

// fim dos testes de Ímpeto
