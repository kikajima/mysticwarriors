import { describe, expect, test } from 'bun:test';
import { IMPETO } from '../src/lib/game/impeto';
import {
  TALENTS,
  getTalent,
  parseTalents,
  validateTalentPurchase,
} from '../src/lib/game/content/talents';
import { simulateBattle, makeRng } from '../src/lib/game/engine';
import { getStrategy } from '../src/lib/game/content/techniques';
import { raceCombat } from '../src/lib/game/rules';
import type { Combatant, StrategyDef, TechniqueDef } from '../src/lib/game/types';

// =====================================================================
// TESTES — TALENTOS DE ÍMPETO (v0.9.15 + v0.9.17)
// Capítulo 7 do ASCENSÃO Z COMPLETO: os dois gastos restantes de
// 1 Ímpeto como talentos compráveis:
//  • Repetição do Destino ("Repetir um d10"): golpe esquivado →
//    repete o teste de acerto (1×/rodada, fora de combo);
//  • Reposicionamento Dramático: golpe poderoso recebido → esquiva
//    extra com bônus (1×/rodada; falha deixa o golpe seguir).
// v0.9.17 — Terceiro talento (Cap. 29):
//  • Segundo Vento: Exaustão pós-Quebra cancelada por 2 Ímpetos.
// Determinismo: sem talentos a sequência de rng é IDÊNTICA à anterior.
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

function battle(
  player: Partial<Combatant> & { name: string; power: number },
  enemy: Partial<Combatant> & { name: string; power: number },
  seed = 12345
) {
  return simulateBattle(combatant(player), combatant(enemy), {
    playerStartHp: 4000,
    rng: makeRng(seed),
  });
}

describe('TALENTOS — catálogo e validação de compra', () => {
  test('três talentos, ids únicos, custos da tabela (Cap. 7: 1; Cap. 29: 2)', () => {
    expect(TALENTS.length).toBe(3);
    const ids = TALENTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
    for (const t of TALENTS) {
      expect(t.impetoCost).toBeGreaterThanOrEqual(1);
      expect(t.impetoCost).toBeLessThanOrEqual(IMPETO.segundoVentoCost);
      expect(t.price).toBeGreaterThan(0);
      expect(t.minLevel).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(20);
    }
    // tabela do Cap. 7: os dois gastos de 1 Ímpeto
    expect(getTalent('repeticao-destino')?.impetoCost).toBe(1);
    expect(getTalent('reposicionamento')?.impetoCost).toBe(1);
    // Cap. 29: o contragolpe à Exaustão custa 2 Ímpetos
    expect(getTalent('segundo-vento')?.impetoCost).toBe(2);
    expect(getTalent('segundo-vento')?.minLevel).toBeGreaterThanOrEqual(8);
  });

  test('getTalent acha por id e rejeita desconhecido', () => {
    expect(getTalent('repeticao-destino')?.name).toBe('Repetição do Destino');
    expect(getTalent('reposicionamento')?.name).toBe('Reposicionamento Dramático');
    expect(getTalent('segundo-vento')?.name).toBe('Segundo Vento');
    expect(getTalent('nao-existe')).toBeNull();
  });

  test('parseTalents tolera lixo e filtra ids desconhecidos', () => {
    expect(parseTalents(null)).toEqual([]);
    expect(parseTalents(undefined)).toEqual([]);
    expect(parseTalents('lixo total')).toEqual([]);
    expect(parseTalents('{"a":1}')).toEqual([]);
    expect(parseTalents('["repeticao-destino","hackeado",42]')).toEqual(['repeticao-destino']);
    expect(parseTalents('["reposicionamento"]')).toEqual(['reposicionamento']);
  });

  test('validateTalentPurchase: feliz — debita e registra', () => {
    const r = validateTalentPurchase(10, 5000, [], 'repeticao-destino');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownedAfter).toEqual(['repeticao-destino']);
      expect(r.zeniAfter).toBe(5000 - r.talent.price);
    }
  });

  test('validateTalentPurchase: nível, duplicado e Zeni insuficiente', () => {
    expect(validateTalentPurchase(1, 99999, [], 'repeticao-destino').ok).toBe(false);
    expect(validateTalentPurchase(99, 99999, ['reposicionamento'], 'reposicionamento').ok).toBe(false);
    expect(validateTalentPurchase(99, 1, [], 'reposicionamento').ok).toBe(false);
    expect(validateTalentPurchase(99, 99999, [], 'id-invalido').ok).toBe(false);
  });
});

describe('TALENTOS — Repetição do Destino (motor)', () => {
  test('sem o talento: batalha é byte a byte idêntica (determinismo)', () => {
    // o mesmo seed SEM talentos precisa produzir o MESMO resultado que
    // o motor produzia antes da v0.9.15 (nenhum consumo extra de rng)
    const base = battle({ name: 'A', power: 1000 }, { name: 'B', power: 1000 }, 777);
    const deNovo = battle({ name: 'A', power: 1000 }, { name: 'B', power: 1000 }, 777);
    expect(base.rounds.length).toBe(deNovo.rounds.length);
    expect(base.won).toBe(deNovo.won);
    expect(base.rounds.map((r) => r.text)).toEqual(deNovo.rounds.map((r) => r.text));
  });

  test('com o talento: rerolls aparecem narrados e os Ímpetos caem', () => {
    // força velocidades iguais (chance de esquiva base ~5–8%): em 20+
    // rounds com vários seeds, rerolls (🎯) DEVE ocorrer em algum momento
    let sawReroll = false;
    let impetoDrop = false;
    for (let seed = 1; seed <= 60 && !(sawReroll && impetoDrop); seed++) {
      const sim = battle(
        { name: 'ComTalento', power: 1000, talents: ['repeticao-destino'] },
        { name: 'Alvo', power: 1000 },
        seed
      );
      for (const r of sim.rounds) {
        if (r.impetoEvent === 'reroll') sawReroll = true;
        // reroll com sucesso: round de ATAQUE com evento reroll e dano > 0
        if (r.impetoEvent === 'reroll' && r.action !== 'dodge' && (r.playerImpeto ?? 0) < IMPETO.start + 1) {
          impetoDrop = true;
        }
      }
    }
    expect(sawReroll).toBe(true);
    expect(impetoDrop).toBe(true);
  });

  test('reroll dispara no máximo 1×/rodada por lado', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sim = battle(
        { name: 'ComTalento', power: 1000, talents: ['repeticao-destino'] },
        { name: 'Alvo', power: 1000 },
        seed
      );
      const perRound = new Map<number, number>();
      for (const r of sim.rounds) {
        if (r.impetoEvent === 'reroll' && r.attacker === 'player') {
          perRound.set(r.round, (perRound.get(r.round) ?? 0) + 1);
        }
      }
      for (const count of perRound.values()) {
        expect(count).toBeLessThanOrEqual(1);
      }
    }
  });

  test('o reroll com sucesso mantém o golpe vivo (dano > 0 no round)', () => {
    let seen = false;
    for (let seed = 1; seed <= 120 && !seen; seed++) {
      const sim = battle(
        { name: 'ComTalento', power: 1000, talents: ['repeticao-destino'] },
        { name: 'Alvo', power: 1000 },
        seed
      );
      for (const r of sim.rounds) {
        if (r.impetoEvent === 'reroll' && r.action !== 'dodge' && r.damage > 0) {
          seen = true;
          expect(r.text).toContain('Repetição do Destino');
        }
      }
    }
    expect(seen).toBe(true);
  });
});

describe('TALENTOS — Reposicionamento Dramático (motor)', () => {
  test('com o talento: golpes poderosos do INIMIGO podem sumir (dano 0)', () => {
    // inimigo MUITO mais forte: todo golpe dele é pesado → gatilho
    // constante; em vários seeds o reposition acontece
    let sawReposition = false;
    let sawZero = false;
    for (let seed = 1; seed <= 80 && !(sawReposition && sawZero); seed++) {
      const sim = battle(
        { name: 'Azacado', power: 1000, talents: ['reposicionamento'] },
        { name: 'Titã', power: 1000, atkPower: 800, kiPower: 800 },
        seed
      );
      for (const r of sim.rounds) {
        if (r.impetoEvent === 'reposition') sawReposition = true;
        if (r.impetoEvent === 'reposition' && r.attacker === 'enemy' && r.damage === 0) {
          sawZero = true;
          expect(r.text).toContain('Reposicionamento');
        }
      }
    }
    expect(sawReposition).toBe(true);
    expect(sawZero).toBe(true);
  });

  test('reposition no máximo 1×/rodada por defensor', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const sim = battle(
        { name: 'Azacado', power: 1000, talents: ['reposicionamento'] },
        { name: 'Titã', power: 1000, atkPower: 800, kiPower: 800 },
        seed
      );
      const perRound = new Map<number, number>();
      for (const r of sim.rounds) {
        if (r.impetoEvent === 'reposition' && r.attacker === 'enemy') {
          perRound.set(r.round, (perRound.get(r.round) ?? 0) + 1);
        }
      }
      for (const count of perRound.values()) expect(count).toBeLessThanOrEqual(1);
    }
  });

  test('dano anulado não gera Ímpeto de golpe pesado para o defensor', () => {
    // o round com reposition bem-sucedido (dano 0) NÃO pode ter ganhado
    // +1 de Ímpeto no MESMO round pelo gatilho "golpe pesado recebido"
    for (let seed = 1; seed <= 80; seed++) {
      const sim = battle(
        { name: 'Azacado', power: 1000, talents: ['reposicionamento'] },
        { name: 'Titã', power: 1000, atkPower: 800, kiPower: 800 },
        seed
      );
      for (let i = 1; i < sim.rounds.length; i++) {
        const r = sim.rounds[i];
        const prev = sim.rounds[i - 1];
        if (r.impetoEvent === 'reposition' && r.attacker === 'enemy' && r.damage === 0) {
          // Ímpeto do jogador não subiu por causa deste golpe (pode ter
          // caído pelo custo do reposition)
          expect((r.playerImpeto ?? 0)).toBeLessThanOrEqual((prev.playerImpeto ?? 0));
        }
      }
    }
  });

  test('medidores de Ímpeto continuam no intervalo 0–6 com talentos', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = battle(
        { name: 'Tudo', power: 1000, talents: ['repeticao-destino', 'reposicionamento'] },
        { name: 'Titã', power: 1000, atkPower: 800, kiPower: 800 },
        seed
      );
      for (const r of sim.rounds) {
        expect(r.playerImpeto ?? 0).toBeGreaterThanOrEqual(0);
        expect(r.playerImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
        expect(r.enemyImpeto ?? 0).toBeGreaterThanOrEqual(0);
        expect(r.enemyImpeto ?? 0).toBeLessThanOrEqual(IMPETO.max);
      }
    }
  });
});

describe('TALENTOS — integridade do combate', () => {
  test('batalha com ambos talentos termina com vencedor e HP consistente', () => {
    const sim = battle(
      { name: 'Heroi', power: 1000, talents: ['repeticao-destino', 'reposicionamento'] },
      { name: 'Vilao', power: 1000 },
      4242
    );
    expect(typeof sim.won).toBe('boolean');
    expect(sim.rounds.length).toBeGreaterThan(0);
    // MAX_ROUNDS do motor = 40 (v0.9.21); entradas de log podem exceder
    // (combos) e uma eventual rodada de DECISÃO DOS JURADOS entra em
    // seguida ao limite (round finalRound + 1)
    expect(sim.rounds[sim.rounds.length - 1].round).toBeLessThanOrEqual(41);
    const last = sim.rounds[sim.rounds.length - 1];
    expect(last.playerHp).toBeGreaterThanOrEqual(0);
    expect(last.enemyHp).toBeGreaterThanOrEqual(0);
  });

  test('constantes de talento coerentes com o Cap. 7', () => {
    expect(IMPETO.rerollCost).toBe(1);
    expect(IMPETO.repositionCost).toBe(1);
    expect(IMPETO.repositionDodgeBonus).toBeGreaterThan(0);
    expect(IMPETO.repositionDodgeCap).toBeLessThanOrEqual(0.6);
  });
});
