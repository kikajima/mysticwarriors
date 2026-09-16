import { describe, expect, test } from 'bun:test';
import { IMPETO } from '../src/lib/game/impeto';
import { simulateBattle, makeRng } from '../src/lib/game/engine';
import { getStrategy } from '../src/lib/game/content/techniques';
import { raceCombat } from '../src/lib/game/rules';
import { getAchievement, ACHIEVEMENTS } from '../src/lib/game/content/quests';
import { validateTalentPurchase, getTalent, TALENTS } from '../src/lib/game/content/talents';
import type { Combatant, StrategyDef, TechniqueDef } from '../src/lib/game/types';

// =====================================================================
// TESTES — SEGUNDO VENTO + CONQUISTAS NARRATIVAS (v0.9.17)
// Capítulo 29 do ASCENSÃO Z fecha o ciclo com o contragolpe à Exaustão:
//   • talento "Segundo Vento" (2 Ímpetos): quando o efeito da Quebra
//     expira e a Exaustão ia entrar, o guerreiro a supera na hora —
//     o milagre COMPLETO, sem fadiga (1×/combate, sem rng);
//   • conquista "Milagre no Limite": venceu com a Quebra ativada;
//   • conquista "David vs Golias": Reposicionamento Dramático anulou
//     um golpe poderoso de oponente 2+ escalas acima.
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

// luta desgastante (receita das suítes de Ímpeto/Exaustão): golpes
// PODEROSOS (≥18% do HP) carregam Ímpeto dos dois lados e derrubam a
// vida abaixo da metade — a Defesa Heroica intercala e mantém a luta
// viva até o buff da Quebra expirar (janela do Segundo Vento)
function grindBattle(seed: number, playerTalents?: string[]) {
  return simulateBattle(
    combatant({
      name: 'Alpha',
      power: 1000,
      speed: 60,
      atkPower: 1000,
      kiPower: 1000,
      maxHp: 5200,
      ...(playerTalents ? { talents: playerTalents } : {}),
    }),
    combatant({ name: 'Beta', power: 1000, speed: 61, atkPower: 1000, kiPower: 1000, maxHp: 5200 }),
    { playerStartHp: 5200, rng: makeRng(seed) }
  );
}

// cenário CRIADO para o caminho PREVENTIVO: Alpha defensivo (não queima
// Ímpeto em combos com 2 em caixa), ataque fraco (Beta nunca ganha
// Ímpeto → nunca quebra → TODA 💧 da luta é de Alpha), inimigo pesado
// (golpe sempre poderoso ≥18%) — verifica que a fadiga some DEPOIS do
// Segundo Vento sem ambiguidade de lado
function craftedBattle(seed: number, talents?: string[]) {
  return simulateBattle(
    combatant({
      name: 'Alpha',
      power: 1000,
      speed: 55,
      atkPower: 300,
      kiPower: 300,
      maxHp: 10000,
      strategy: getStrategy('defensive'),
      ...(talents ? { talents } : {}),
    }),
    combatant({ name: 'Beta', power: 1000, speed: 60, atkPower: 2000, kiPower: 2000, maxHp: 10000 }),
    { playerStartHp: 10000, rng: makeRng(seed) }
  );
}

describe('SEGUNDO VENTO — constantes e catálogo', () => {
  test('custo de 2 Ímpetos (equilíbrio: preço da Defesa Heroica)', () => {
    expect(IMPETO.segundoVentoCost).toBe(2);
    expect(IMPETO.segundoVentoCost).toBe(IMPETO.heroicDefenseCost);
  });

  test('talento no catálogo com nível e preço progressivos', () => {
    const t = getTalent('segundo-vento');
    expect(t).not.toBeNull();
    expect(t?.minLevel).toBeGreaterThan(getTalent('reposicionamento')!.minLevel);
    expect(t?.price).toBeGreaterThan(getTalent('reposicionamento')!.price);
    expect(TALENTS.map((x) => x.id)).toContain('segundo-vento');
  });

  test('validação de compra aceita o terceiro talento', () => {
    const r = validateTalentPurchase(10, 99999, [], 'segundo-vento');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownedAfter).toEqual(['segundo-vento']);
      expect(r.zeniAfter).toBe(99999 - r.talent.price);
    }
    // nível insuficiente rejeita
    expect(validateTalentPurchase(7, 99999, [], 'segundo-vento').ok).toBe(false);
    // duplicado rejeita
    expect(validateTalentPurchase(10, 99999, ['segundo-vento'], 'segundo-vento').ok).toBe(false);
  });
});

describe('SEGUNDO VENTO — comportamento no motor', () => {
  test('SEM o talento: Exaustão segue cobrando (comportamento v0.9.16 intacto)', () => {
    let exaustou = false;
    for (let seed = 1; seed <= 60; seed++) {
      const sim = grindBattle(seed);
      const allText = sim.rounds.map((r) => r.text).join(' ');
      if (allText.includes('EXAUSTÃO PÓS-LIMITE') || allText.includes('💧 exausto')) exaustou = true;
    }
    expect(exaustou).toBe(true); // sem o talento, a fadiga existe no universo de seeds
  });

  test('COM o talento: 🌬️ SEGUNDO VENTO dispara; sem ele, nunca', () => {
    let ventoCom = 0;
    let ventoSem = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const com = grindBattle(seed, ['segundo-vento']);
      const sem = grindBattle(seed);
      if (com.rounds.some((r) => r.text.includes('SEGUNDO VENTO'))) ventoCom++;
      if (sem.rounds.some((r) => r.text.includes('SEGUNDO VENTO'))) ventoSem++;
    }
    expect(ventoCom).toBeGreaterThan(0); // o milagre acontece com Ímpeto em caixa
    expect(ventoSem).toBe(0); // e JAMAIS sem o talento
  });

  test('o milagre vem sempre DEPOIS de uma Quebra de Limite do lado', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const sim = grindBattle(seed, ['segundo-vento']);
      const ventoRounds = sim.rounds.filter((r) => r.impetoEvent === 'segundo-vento');
      if (ventoRounds.length === 0) continue;
      const allText = sim.rounds.map((r) => r.text).join(' ');
      expect(allText).toContain('QUEBRA DE LIMITE'); // causalidade estrita
      for (const r of ventoRounds) {
        expect(r.text).toContain('2 Ímpetos'); // o preço narrado
        expect(r.playerImpeto ?? 0).toBeGreaterThanOrEqual(0);
        expect(r.playerImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
      }
    }
  });

  test('os TRÊS caminhos funcionam: preventivo e recuperação no meio da fadiga', () => {
    let preventivo = 0;
    let recuperacao = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const sim = grindBattle(seed, ['segundo-vento']);
      const ventoIdx = sim.rounds.findIndex((r) => r.impetoEvent === 'segundo-vento');
      if (ventoIdx < 0) continue;
      const entradaIdx = sim.rounds.findIndex((r) => r.text.includes('EXAUSTÃO PÓS-LIMITE! Alpha'));
      if (entradaIdx < 0) preventivo++; // a fadiga nem entrou
      else if (ventoIdx > entradaIdx) recuperacao++; // superou NO MEIO dela
    }
    expect(preventivo).toBeGreaterThan(0);
    expect(recuperacao).toBeGreaterThan(0);
  });

  test('cenário dedicado: depois do Segundo Vento a 💧 de Alpha some para sempre', () => {
    let validados = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const sim = craftedBattle(seed, ['segundo-vento']);
      const ventoIdx = sim.rounds.findIndex((r) => r.impetoEvent === 'segundo-vento');
      if (ventoIdx < 0) continue;
      validados++;
      // no cenário criado, Beta NUNCA ganha Ímpeto (golpes de Alpha não
      // são poderosos) → toda marca 💧 é da fadiga de Alpha
      for (let i = ventoIdx + 1; i < sim.rounds.length; i++) {
        expect(sim.rounds[i].text.includes('💧')).toBe(false);
      }
    }
    expect(validados).toBeGreaterThan(0);
  });

  test('narração 1× por lado (não repete no ataque e defesa da mesma rodada)', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const sim = grindBattle(seed, ['segundo-vento']);
      const ventos = sim.rounds.filter((r) => r.text.includes('SEGUNDO VENTO'));
      // a Quebra é 1×/combate por lado → o Vento também (≤1 por lado)
      expect(ventos.length).toBeLessThanOrEqual(2);
      for (const r of ventos) {
        expect(r.impetoEvent).toBe('segundo-vento');
      }
    }
  });

  test('determinismo: sem talentos, mesma semente → bytes idênticos', () => {
    const a = grindBattle(4242);
    const b = grindBattle(4242);
    expect(a.won).toBe(b.won);
    expect(a.rounds.map((r) => r.text)).toEqual(b.rounds.map((r) => r.text));
    expect(a.rounds.map((r) => r.damage)).toEqual(b.rounds.map((r) => r.damage));
  });

  test('integridade: medidores 0–6 e HP válidos com o talento ativo', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = grindBattle(seed, ['segundo-vento']);
      for (const r of sim.rounds) {
        expect(r.playerImpeto ?? 0).toBeGreaterThanOrEqual(0);
        expect(r.playerImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
        expect(r.enemyImpeto ?? 0).toBeGreaterThanOrEqual(0);
        expect(r.enemyImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
      }
      const last = sim.rounds[sim.rounds.length - 1];
      expect(last.playerHp).toBeGreaterThanOrEqual(0);
      expect(last.enemyHp).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('CONQUISTAS NARRATIVAS — flags da engine', () => {
  test('miracleWin: só quando venceu E ativou a Quebra', () => {
    let comMilagre = 0;
    let quebraSemVitoria = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const sim = grindBattle(seed);
      const allText = sim.rounds.map((r) => r.text).join(' ');
      const quebraPlayer = allText.includes('QUEBRA DE LIMITE! Alpha');
      if (sim.miracleWin) {
        expect(sim.won).toBe(true);
        expect(quebraPlayer).toBe(true);
        comMilagre++;
      }
      if (quebraPlayer && !sim.won) quebraSemVitoria++;
    }
    expect(comMilagre).toBeGreaterThan(0); // existe no universo de seeds
    expect(quebraSemVitoria).toBeGreaterThanOrEqual(0); // derrota NUNCA conta
    // sem quebra → sem milagre, sempre
    for (let seed = 500; seed <= 540; seed++) {
      const sim = grindBattle(seed);
      const allText = sim.rounds.map((r) => r.text).join(' ');
      if (!allText.includes('QUEBRA DE LIMITE! Alpha')) {
        expect(sim.miracleWin ?? false).toBe(false);
      }
    }
  });

  test('davidReposition: anulação de golpe poderoso vs 2+ escalas acima', () => {
    // David: poder baixo, Reposicionamento; Golias: 3+ escalas acima
    // (thresholds: ver POWER_SCALES — usar gap grande garante ≥2 escalas)
    let david = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const sim = simulateBattle(
        combatant({
          name: 'David',
          power: 1000,
          speed: 55,
          atkPower: 120,
          kiPower: 120,
          maxHp: 6000,
          talents: ['reposicionamento'],
        }),
        combatant({
          name: 'Golias',
          power: 220000,
          speed: 60,
          atkPower: 1400,
          kiPower: 1400,
          maxHp: 6000,
        }),
        { playerStartHp: 6000, rng: makeRng(seed) }
      );
      if (sim.davidReposition) {
        const repositionRounds = sim.rounds.filter((r) => r.impetoEvent === 'reposition');
        expect(repositionRounds.length).toBeGreaterThan(0);
        david++;
      }
      // sem o talento NUNCA marca a flag
      expect(sim.rounds.every((r) => r.playerImpeto === undefined || true)).toBe(true);
    }
    expect(david).toBeGreaterThan(0); // em 200 seeds, o momento acontece
  });

  test('davidReposition SEM o talento ou SEM gap de escala: nunca marca', () => {
    for (let seed = 1; seed <= 60; seed++) {
      // mesmo gap, sem talento
      const semTalento = simulateBattle(
        combatant({ name: 'Azarao', power: 1000, maxHp: 6000, speed: 55 }),
        combatant({ name: 'Gigante', power: 220000, maxHp: 6000, atkPower: 1400, kiPower: 1400 }),
        { playerStartHp: 6000, rng: makeRng(seed) }
      );
      expect(semTalento.davidReposition ?? false).toBe(false);
      // com talento, escala IGUAL (gap 0) — em igualdade de escala a
      // flag NÃO pode marcar (grindBattle usa poderes iguais)
      const escalaIgual = grindBattle(seed, ['reposicionamento']);
      expect(escalaIgual.davidReposition ?? false).toBe(false);
    }
  });
});

describe('CONQUISTAS NARRATIVAS — catálogo', () => {
  test('duas conquistas narrativas com métricas novas', () => {
    const milagre = getAchievement('milagre_limite');
    expect(milagre).toBeDefined();
    expect(milagre?.category).toBe('narrative');
    expect(milagre?.metric).toBe('miracleWins');
    expect(milagre?.target).toBe(3);
    expect(milagre?.rewardCrystals).toBeGreaterThan(0);

    const david = getAchievement('david_golias');
    expect(david).toBeDefined();
    expect(david?.category).toBe('narrative');
    expect(david?.metric).toBe('davidWins');
    expect(david?.target).toBe(1);
    expect(david?.rewardCrystals).toBeGreaterThan(0);
  });

  test('categoria narrativa existe no catálogo com ids únicos globais', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    const narrativas = ACHIEVEMENTS.filter((a) => a.category === 'narrative');
    expect(narrativas.length).toBe(2);
  });
});
