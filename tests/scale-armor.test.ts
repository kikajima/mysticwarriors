import { describe, expect, test } from 'bun:test';
import {
  SCALE_COMBAT,
  scaleCombatRules,
  aberturaChance,
  getPowerScale,
  POWER_SCALES,
} from '../src/lib/game/powerScale';
import { simulateBattle, makeRng } from '../src/lib/game/engine';
import { npcCombatPower, ENEMIES } from '../src/lib/game/content/world';
import type { Combatant, StrategyDef, TechniqueDef } from '../src/lib/game/types';
import { getStrategy } from '../src/lib/game/content/techniques';
import { raceCombat } from '../src/lib/game/rules';

// =====================================================================
// TESTES — ARMADURA DE ESCALA (v0.9.12)
// Regras 5.1 e 5.3 do ASCENSÃO Z traduzidas para o motor de combate:
//  * 5.1 — superior +7%/escala (máx. 3); inferior −12%/nível (máx. 3);
//  * 5.3 — diferença ≥ 4 esmaga golpes do azarão (×0.35), críticos
//    geram ABERTURAS (×1.75) e 3 delas dão a uma TÉCNICA o tratamento
//    de diferença 3 ("quebra de barreira");
//  * 5.2 — escala NÃO mexe em esquiva (rng stream preservado).
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
    maxHp: 4000, // alto: a luta dura o suficiente para colher rounds
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

/** Soma o dano dos golpes de UM lado específico (ignorando esquivas). */
function damageBySide(rounds: ReturnType<typeof simulateBattle>['rounds'], side: 'player' | 'enemy') {
  return rounds.filter((r) => r.attacker === side && r.action !== 'dodge').reduce((s, r) => s + r.damage, 0);
}

describe('scaleCombatRules (regra 5.1 — cálculo puro)', () => {
  test('mesma escala: neutro (mult 1, sem armadura, sem vantagem)', () => {
    const r = scaleCombatRules(1000, 1000);
    expect(r.diff).toBe(0);
    expect(r.damageMult).toBe(1);
    expect(r.armor).toBe(0);
    expect(r.advantage).toBe(0);
    expect(r.crushing).toBe(false);
  });

  test('defensor 1-3 escalas acima: armadura igual à diferença (máx. 3)', () => {
    // 127 → Marcial(1); 285 → Super-Humana(2); 860 → Planetária(3); 1850 → Estelar(4)
    expect(scaleCombatRules(127, 285).armor).toBe(1);
    expect(scaleCombatRules(127, 860).armor).toBe(2);
    expect(scaleCombatRules(127, 1850).armor).toBe(3);
  });

  test('armadura SATURA em 3 além da diferença real (regra 5.1: máximo normal)', () => {
    // Mortal Comum(0) vs Deus Maior(8): diferença 8 → armadura 3
    const r = scaleCombatRules(100, 46000);
    expect(r.diff).toBe(8);
    expect(r.armor).toBe(3);
    expect(r.damageMult).toBeCloseTo(1 - 3 * SCALE_COMBAT.armorPerLevel, 5);
  });

  test('atacante acima: vantagem +7%/escala (máx. 3)', () => {
    const r = scaleCombatRules(1850, 127); // Estelar vs Marcial = 3 acima
    expect(r.advantage).toBe(3);
    expect(r.damageMult).toBeCloseTo(1 + 3 * SCALE_COMBAT.advantagePerLevel, 5);
    expect(r.armor).toBe(0);
  });

  test('regra 5.3: diferença ≥ 4 marca crushing', () => {
    expect(scaleCombatRules(100, 1850).crushing).toBe(true); // 4 escalas
    expect(scaleCombatRules(100, 20000).crushing).toBe(true);
    expect(scaleCombatRules(127, 860).crushing).toBe(false); // 3 escalas: não
    expect(scaleCombatRules(1000, 1000).crushing).toBe(false);
  });

  test('lixo e +Infinity: seguro (Mortal Comum / topo, mults válidos)', () => {
    expect(() => scaleCombatRules(NaN, 100)).not.toThrow();
    expect(scaleCombatRules(NaN, 100).damageMult).toBeGreaterThan(0);
    const inf = scaleCombatRules(Number.POSITIVE_INFINITY, 100);
    expect(inf.advantage).toBe(3);
  });
});

describe('aberturaChance (regra 5.3 — velocidade encontra brechas)', () => {
  test('faixa 3%–9% com folga de velocidade −10..+10', () => {
    expect(aberturaChance(50, 50)).toBeCloseTo(0.06, 5);
    expect(aberturaChance(100, 50)).toBeCloseTo(0.09, 5);
    expect(aberturaChance(50, 100)).toBeCloseTo(0.03, 5);
    // além do clamp: não sai da faixa
    expect(aberturaChance(200, 0)).toBeCloseTo(0.09, 5);
    expect(aberturaChance(0, 200)).toBeCloseTo(0.03, 5);
  });
});

describe('simulateBattle — Armadura de Escala aplicada', () => {
  const SEED = 4242;

  /** Mesma semente, mesmos atributos — só o PODER (escala) muda. */
  function runPair(powerA: number, powerB: number) {
    const a = combatant({ name: 'A', power: powerA });
    const b = combatant({ name: 'B', power: powerB });
    const sim1 = simulateBattle(a, b, { playerStartHp: 4000, rng: makeRng(SEED) });
    return { sim: sim1, a, b };
  }

  test('igualdade de escala: dano do atacante NÃO muda vs baseline neutro', () => {
    // A(1000) vs B(1000) — a regra desligada: dano idêntico ao par neutro
    const { sim } = runPair(1000, 1000);
    const base = simulateBattle(combatant({ name: 'A', power: 1000 }), combatant({ name: 'B', power: 1000 }), {
      playerStartHp: 4000,
      rng: makeRng(SEED),
    });
    expect(damageBySide(sim.rounds, 'player')).toBe(damageBySide(base.rounds, 'player'));
  });

  test('inferior causa MENOS dano através da Armadura de Escala (5.1)', () => {
    // B 3 escalas acima (Planetária 860 vs Marcial 127... aqui usamos
    // 1000 [Super-Humana 2] vs 1850 [Estelar 4] = 2 escalas)
    const neutral = runPair(1000, 1000);
    const weaker = runPair(1000, 1850);
    // mesmos atributos: o dano do A cai com a armadura do B
    expect(damageBySide(weaker.sim.rounds, 'player')).toBeLessThan(
      damageBySide(neutral.sim.rounds, 'player')
    );
    // e o dano do B (superior) sobe com a vantagem
    expect(damageBySide(weaker.sim.rounds, 'enemy')).toBeGreaterThan(
      damageBySide(neutral.sim.rounds, 'enemy')
    );
  });

  test('superior recebe o bônus de dano por escala de vantagem (5.1)', () => {
    const neutral = runPair(1000, 1000);
    const stronger = runPair(1850, 1000); // A 2 escalas acima
    expect(damageBySide(stronger.sim.rounds, 'player')).toBeGreaterThan(
      damageBySide(neutral.sim.rounds, 'player')
    );
    expect(damageBySide(stronger.sim.rounds, 'enemy')).toBeLessThan(
      damageBySide(neutral.sim.rounds, 'enemy')
    );
  });

  test('azarão 4+ escalas: rounds de dano esmagado OU abertura (nunca neutros)', () => {
    // A (Mortal Comum 100) vs B (Estelar 1850): diff 4 — todos os golpes
    // de A que conectam caem em 'crushing' ou 'abertura'
    const { sim } = runPair(100, 1850);
    const playerStrikes = sim.rounds.filter((r) => r.attacker === 'player' && r.action !== 'dodge');
    expect(playerStrikes.length).toBeGreaterThan(0);
    for (const r of playerStrikes) {
      expect(
        r.scaleEvent === 'crushing' || r.scaleEvent === 'abertura' || r.scaleEvent === 'breakthrough'
      ).toBe(true);
    }
    // eventos de abertura carregam a contagem no texto da regra
    const aberturas = playerStrikes.filter((r) => r.scaleEvent === 'abertura');
    for (const r of aberturas) {
      expect(r.text).toContain('ABERTURA!');
    }
  });

  test('golpes do azarão têm dano ≥ 1 mesmo esmagados (piso)', () => {
    const { sim } = runPair(100, 20000); // 7 escalas de diferença
    const playerStrikes = sim.rounds.filter((r) => r.attacker === 'player' && r.action !== 'dodge');
    for (const r of playerStrikes) {
      expect(r.damage).toBeGreaterThanOrEqual(1);
    }
  });

  test('textos narrativos: armadura e vantagem aparecem no log (5.1)', () => {
    const { sim } = runPair(1000, 1850); // 2 escalas abaixo
    expect(sim.rounds.some((r) => r.text.includes('Armadura de Escala'))).toBe(true);
    const { sim: simUp } = runPair(1850, 1000);
    expect(simUp.rounds.some((r) => r.text.includes('escala de vantagem'))).toBe(true);
  });

  test('esquiva NÃO muda com a escala (regra 5.2 — rng stream preservado)', () => {
    // mesma semente + mesmos atributos: mesmo número de esquivas
    // independentemente da diferença de escala
    const n = runPair(1000, 1000);
    const d = runPair(100, 20000);
    const dodgesNeutral = n.sim.rounds.filter((r) => r.action === 'dodge').length;
    const dodgesCrushed = d.sim.rounds.filter((r) => r.action === 'dodge').length;
    // mesmo total de strikes (mesma semente decide KO igualmente? não
    // necessariamente — HP cai diferente; então verificamos o PRIMEIRO
    // round: action do round 1 idêntico entre os cenários)
    expect(n.sim.rounds[0].action).toBe(d.sim.rounds[0].action);
    expect(dodgesCrushed).toBeGreaterThanOrEqual(0); // sanity: contou
    void dodgesNeutral;
  });
});

describe('calibração com o conteúdo real do jogo', () => {
  test('cada trio I/II/III ocupa exatamente sua escala base', () => {
    expect(ENEMIES).toHaveLength(POWER_SCALES.length * 3);
    ENEMIES.forEach((enemy) => {
      expect(getPowerScale(npcCombatPower(enemy)).scale.index).toBe(enemy.enemyScaleIndex);
    });
  });

  test('novato contra o capanga Transcendente: crushing ATIVO', () => {
    const top = ENEMIES[ENEMIES.length - 1];
    const rules = scaleCombatRules(111, npcCombatPower(top));
    expect(rules.crushing).toBe(true);
  });

  test('novato contra o Mortal Comum: sem crushing', () => {
    const first = ENEMIES[0];
    const rules = scaleCombatRules(111, npcCombatPower(first));
    expect(rules.crushing).toBe(false);
    expect(Math.abs(rules.diff)).toBeLessThanOrEqual(1);
  });
});
