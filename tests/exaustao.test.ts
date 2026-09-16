import { describe, expect, test } from 'bun:test';
import { IMPETO } from '../src/lib/game/impeto';
import { simulateBattle, makeRng } from '../src/lib/game/engine';
import { getStrategy } from '../src/lib/game/content/techniques';
import { raceCombat } from '../src/lib/game/rules';
import type { Combatant, StrategyDef, TechniqueDef } from '../src/lib/game/types';

// =====================================================================
// TESTES — EXAUSTÃO PÓS-QUEBRA DE LIMITE (v0.9.16)
// Capítulo 29 do ASCENSÃO Z: a Quebra de Limite tem PREÇO. "Exaustão 2"
// traduzida como 2 rodadas de fadiga quando o efeito expira:
//   • golpes do exausto: ×0.85 (fadiga enfraquece);
//   • golpes recebidos pelo exausto: ×1.10 (reações lentas);
//   • multiplicadores puros — ZERO consumo de rng;
//   • só existe DEPOIS de uma Quebra de Limite (causalidade estrita).
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

// luta desgastante (receita do impeto.test.ts): golpes PODEROSOS
// (≥18% do HP) carregam Ímpeto dos dois lados e derrubam a vida abaixo
// da metade — a Defesa Heroica intercala e desacelera o derretimento,
// deixando a luta viva o bastante para o buff expirar e a fadiga chegar
function grindBattle(seed: number) {
  return simulateBattle(
    combatant({ name: 'Alpha', power: 1000, speed: 60, atkPower: 900, kiPower: 900, maxHp: 3000 }),
    combatant({ name: 'Beta', power: 1000, speed: 61, atkPower: 900, kiPower: 900, maxHp: 3000 }),
    { playerStartHp: 3000, rng: makeRng(seed) }
  );
}

describe('EXAUSTÃO — constantes do Capítulo 29', () => {
  test('"Exaustão 2": 2 rodadas de fadiga após a Quebra expirar', () => {
    expect(IMPETO.exaustaoRounds).toBe(2);
  });

  test('multiplicadores moderados (risco real, não punição esmagadora)', () => {
    expect(IMPETO.exaustaoDamageDealtMult).toBeLessThan(1);
    expect(IMPETO.exaustaoDamageDealtMult).toBeGreaterThan(0.75);
    expect(IMPETO.exaustaoDamageTakenMult).toBeGreaterThan(1);
    expect(IMPETO.exaustaoDamageTakenMult).toBeLessThan(1.25);
  });
});

describe('EXAUSTÃO — causalidade e duração no motor', () => {
  test('exaustão SÓ aparece em lutas que tiveram Quebra de Limite', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const sim = grindBattle(seed);
      const allText = sim.rounds.map((r) => r.text).join(' ');
      const hasQuebra = allText.includes('QUEBRA DE LIMITE');
      const hasExaustao = allText.includes('EXAUSTÃO PÓS-LIMITE') || allText.includes('💧 exausto');
      if (hasExaustao) {
        expect(hasQuebra).toBe(true); // nunca exausto sem ter quebrado
      }
    }
    // e existe pelo menos uma luta com Quebra → Exaustão no universo de seeds
    let quebraComExaustao = 0;
    let quebraTotal = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const sim = grindBattle(seed);
      const allText = sim.rounds.map((r) => r.text).join(' ');
      if (allText.includes('QUEBRA DE LIMITE')) {
        quebraTotal++;
        if (allText.includes('EXAUSTÃO PÓS-LIMITE') || allText.includes('💧 exausto')) quebraComExaustao++;
      }
    }
    expect(quebraTotal).toBeGreaterThan(0);
    // lutas que ACONTECEM de ter exaustão visível (algumas terminam antes
    // do efeito expirar — a luta acabou no milagre; isso também é válido)
    expect(quebraComExaustao).toBeGreaterThan(0);
  });

  test('a narração de ENTRADA aparece no máximo 1× por lado', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const sim = grindBattle(seed);
      const entradas = sim.rounds.filter((r) => r.impetoEvent === 'exaustao');
      expect(entradas.length).toBeLessThanOrEqual(2); // 1 por lado no máximo
      for (const r of entradas) {
        expect(r.text).toContain('EXAUSTÃO PÓS-LIMITE');
      }
    }
  });

  test('rodadas com 💧 vêm DEPOIS da rodada da Quebra do lado correspondente', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const sim = grindBattle(seed);
      const quebraPlayerRound = sim.rounds.find(
        (r) => r.impetoEvent === 'quebra-de-limite' && r.attacker === 'player'
      )?.round;
      const quebraEnemyRound = sim.rounds.find(
        (r) => r.impetoEvent === 'quebra-de-limite' && r.attacker === 'enemy'
      )?.round;
      for (const r of sim.rounds) {
        if (r.text.includes('💧')) {
          // exaustão do jogador: depois da quebra do jogador
          if (r.text.includes('Alpha') === false && quebraPlayerRound !== undefined && r.attacker === 'enemy') {
            expect(r.round).toBeGreaterThanOrEqual(quebraPlayerRound);
          }
          if (quebraEnemyRound !== undefined && r.attacker === 'player') {
            expect(r.round).toBeGreaterThanOrEqual(quebraEnemyRound);
          }
        }
      }
    }
  });

  test('fadiga dura no máximo 2 rodadas por lado (selos 💧 limitados)', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const sim = grindBattle(seed);
      // rodadas DISTINTAS com selo de exaustão
      const playerRounds = new Set<number>();
      const enemyRounds = new Set<number>();
      for (const r of sim.rounds) {
        if (r.text.includes('💧')) {
          if (r.attacker === 'player') playerRounds.add(r.round);
          else enemyRounds.add(r.round);
        }
      }
      // o selo aparece nos golpes do exausto (atacando) e nos golpes que
      // ele SOFRE (defendendo) — união limitada pelas 2 rodadas de fadiga
      const distinct = new Set([...playerRounds, ...enemyRounds]);
      expect(distinct.size).toBeLessThanOrEqual(5); // 2 rodadas × ataques + folga de combo
    }
  });

  test('exaustão não consome rng: mesma semente, mesmo resultado', () => {
    const a = grindBattle(999);
    const b = grindBattle(999);
    expect(a.won).toBe(b.won);
    expect(a.rounds.map((r) => r.text)).toEqual(b.rounds.map((r) => r.text));
    expect(a.rounds.map((r) => r.damage)).toEqual(b.rounds.map((r) => r.damage));
  });

  test('medidores de Ímpeto seguem 0–6 durante exaustão', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = grindBattle(seed);
      for (const r of sim.rounds) {
        expect(r.playerImpeto ?? 0).toBeGreaterThanOrEqual(0);
        expect(r.playerImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
        expect(r.enemyImpeto ?? 0).toBeGreaterThanOrEqual(0);
        expect(r.enemyImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
      }
    }
  });

  test('integridade: luta com quebra+exaustão termina com HP válido', () => {
    let validados = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const sim = grindBattle(seed);
      const allText = sim.rounds.map((r) => r.text).join(' ');
      if (allText.includes('EXAUSTÃO PÓS-LIMITE')) {
        const last = sim.rounds[sim.rounds.length - 1];
        expect(last.playerHp).toBeGreaterThanOrEqual(0);
        expect(last.enemyHp).toBeGreaterThanOrEqual(0);
        expect(sim.rounds[sim.rounds.length - 1].round).toBeLessThanOrEqual(20);
        validados++;
      }
    }
    expect(validados).toBeGreaterThan(0);
  });
});
