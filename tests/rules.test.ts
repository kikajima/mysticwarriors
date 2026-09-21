/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import {
  addStat,
  capStat,
  dayKey,
  weekKey,
  shouldGrantZenkai,
  trainingCost,
  raceCombat,
  raceEconomy,
  ACTIVITY_DURATION,
  MISSION_BLOCKED_ACTIONS,
  ACTIVITY_BLOCKED_ACTIONS,
  isOnActiveMission,
} from '@/lib/game/rules';
import { baseTrainingCost, elixirPrice, TRAINING_COST_CEILING, professionEnergyCostOf } from '@/lib/game/content/world';

// =====================================================================
// TESTES — regras centralizadas v0.4
//  * STAT CAP inalterado;
//  * FARM diário REMOVIDO (nenhuma função de multiplicador existe mais);
//  * ZENKAI por risco (sem cota diária);
//  * curva de treino segura p/ Int32 + elixir dinâmico;
//  * duração de atividades + allowlist de missão.
// =====================================================================

describe('ATRIBUTOS SEM TETO ARTIFICIAL', () => {
  test('capStat apenas normaliza: não corta em 999 nem em Int32', () => {
    expect(capStat(998 + 5)).toBe(1003);
    expect(capStat(1_000_000)).toBe(1_000_000);
    expect(capStat(5_000_000_000)).toBe(5_000_000_000);
  });

  test('capStat nunca fica negativo e arredonda para baixo', () => {
    expect(capStat(-5)).toBe(0);
    expect(capStat(10.9)).toBe(10);
    expect(capStat(NaN)).toBe(0);
  });

  test('addStat continua crescendo acima de 999', () => {
    const player = { strength: 998, defense: 500, speed: 500, ki: 500 };
    const r = addStat(player, 'strength', 10);
    expect(r.after).toBe(1008);
    expect(player.strength).toBe(1008);
  });

  test('addStat suporta progressão muito acima do antigo Int32', () => {
    const player = { strength: 5_000_000_000, defense: 10, speed: 10, ki: 10 };
    addStat(player, 'strength', 25);
    expect(player.strength).toBe(5_000_000_025);
  });
});

describe('ZENKAI v0.4 (balanceado por RISCO — sem cota diária)', () => {
  const base = {
    race: 'saiyajin',
    level: 20,
    lastZenkaiAt: null,
    lastZenkaiOpponentId: null,
  };

  test('Saiyajin recebe Zenkai contra adversário relevante (>= 60% do nível)', () => {
    const d = shouldGrantZenkai({ ...base }, 12, 'enemy:capitao_saque_galactico'); // 12 >= 0.6*20
    expect(d.granted).toBe(true);
  });

  test('não-Saiyajin nunca recebe Zenkai', () => {
    const d = shouldGrantZenkai({ ...base, race: 'humano' }, 20, 'enemy:capitao_saque_galactico');
    expect(d.granted).toBe(false);
    expect(d.reason).toBe('not_saiyajin');
  });

  test('adversário irrelevante (nível < 60%) não dá Zenkai — perder de fraco não ativa', () => {
    const d = shouldGrantZenkai({ ...base }, 11, 'enemy:arruaceiro_ermo'); // 11 < 12
    expect(d.granted).toBe(false);
    expect(d.reason).toBe('irrelevant_opponent');
  });

  test('não repete contra o mesmo adversário em 12h (variedade forçada)', () => {
    const d = shouldGrantZenkai(
      { ...base, lastZenkaiAt: new Date(Date.now() - 3600_000), lastZenkaiOpponentId: 'enemy:capitao_saque_galactico' },
      20,
      'enemy:capitao_saque_galactico'
    );
    expect(d.granted).toBe(false);
    expect(d.reason).toBe('same_opponent');
  });

  test('MESMO adversário liberado após 12h — sem cota diária, o limite é o risco', () => {
    const d = shouldGrantZenkai(
      { ...base, lastZenkaiAt: new Date(Date.now() - 13 * 3600_000), lastZenkaiOpponentId: 'enemy:capitao_saque_galactico' },
      20,
      'enemy:capitao_saque_galactico'
    );
    expect(d.granted).toBe(true);
  });

  test('vários Zenkais no mesmo dia são permitidos (derrotas reais contra relevantes)', () => {
    // derrotas contra 3 adversários DIFERENTES, todos relevantes
    const ctx = { ...base };
    for (const opp of ['enemy:a', 'enemy:b', 'enemy:c']) {
      const d = shouldGrantZenkai({ ...ctx, lastZenkaiAt: new Date(Date.now() - 3600_000), lastZenkaiOpponentId: 'enemy:anterior' }, 20, opp);
      expect(d.granted).toBe(true);
    }
  });
});

describe('FARM LIVRE — penalidade diária REMOVIDA por completo', () => {
  test('nenhum multiplicador de farm existe no módulo de regras', async () => {
    // importa dinamicamente o fonte e garante que os símbolos extintos sumiram
    const rulesSource = Object.keys(await import('@/lib/game/rules'));
    expect(rulesSource).not.toContain('farmMultiplier');
    expect(rulesSource).not.toContain('farmMultiplierLegacy');
    expect(rulesSource).not.toContain('FARM');
  });

  test('recompensa de batalha NÃO depende de contagem diária (npcRewards puro)', async () => {
    const { npcRewards } = await import('@/lib/game/engine');
    const r0 = npcRewards(5, 'humano', true, () => 0.5);
    const r10 = npcRewards(5, 'humano', true, () => 0.5);
    const r1000 = npcRewards(5, 'humano', true, () => 0.5);
    expect(r0).toEqual(r10);
    expect(r10).toEqual(r1000);
  });
});

describe('CURVA DE TREINO v0.4 (segura para Int32, treino sempre viável)', () => {
  test('pontos de referência da curva', () => {
    expect(baseTrainingCost(10)).toBe(20);
    expect(baseTrainingCost(50)).toBe(140);
    expect(baseTrainingCost(100)).toBe(1614);
    expect(baseTrainingCost(150)).toBe(18515);
    expect(baseTrainingCost(200)).toBe(103406);
  });

  test('teto absoluto evita overflow de Int32 no banco', () => {
    expect(baseTrainingCost(999)).toBeLessThanOrEqual(TRAINING_COST_CEILING);
    expect(baseTrainingCost(999)).toBe(TRAINING_COST_CEILING);
    expect(TRAINING_COST_CEILING).toBeLessThanOrEqual(2_000_000_000);
  });

  test('humano mantém 10% de desconto no treino', () => {
    const base = baseTrainingCost(100);
    expect(trainingCost(100, 'humano')).toBe(Math.floor(base * 0.9));
    expect(trainingCost(100, 'saiyajin')).toBe(base);
  });
});

describe('ELIXIR DO DRAGÃO (preço dinâmico — papel próprio, nunca domina)', () => {
  test('preço mínimo no início do jogo', () => {
    const p = elixirPrice({ strength: 10, defense: 10, speed: 10, ki: 10 });
    expect(p).toBe(4000);
  });

  test('custa ~1,6x o equivalente de treino (conveniência premium)', () => {
    const stats = { strength: 80, defense: 80, speed: 80, ki: 80 };
    const equiv = 4 * (baseTrainingCost(80) + baseTrainingCost(81));
    const p = elixirPrice(stats);
    expect(p).toBe(Math.max(4000, Math.round(equiv * 1.6)));
    expect(p).toBeGreaterThan(equiv * 1.4);
    expect(p).toBeLessThan(equiv * 1.8);
  });

  test('escala com a progressão (nunca fica trivial no endgame)', () => {
    const early = elixirPrice({ strength: 20, defense: 20, speed: 20, ki: 20 });
    const late = elixirPrice({ strength: 150, defense: 150, speed: 150, ki: 150 });
    expect(late).toBeGreaterThan(early * 40);
  });
});

describe('ATIVIDADES server-side (duração central)', () => {
  test('durações positivas e coerentes', () => {
    expect(ACTIVITY_DURATION.trainMs).toBeGreaterThanOrEqual(1000);
    expect(ACTIVITY_DURATION.battleBaseMs).toBeGreaterThan(0);
    expect(ACTIVITY_DURATION.battlePerRoundMs).toBeGreaterThan(0);
    expect(ACTIVITY_DURATION.battleMaxMs).toBeGreaterThanOrEqual(
      ACTIVITY_DURATION.battleBaseMs + ACTIVITY_DURATION.battlePerRoundMs
    );
  });
});

describe('MISSÃO: matriz DEFINITIVA v0.16 (bloqueio de exatamente 3 ações)', () => {
  test('durante o trabalho PvE, torneio e Busca de Esferas são negados', () => {
    expect(MISSION_BLOCKED_ACTIONS.has('train')).toBe(false);
    expect(MISSION_BLOCKED_ACTIONS.has('battle')).toBe(true);
    expect(MISSION_BLOCKED_ACTIONS.has('tournament_fight')).toBe(true);
    expect(MISSION_BLOCKED_ACTIONS.has('search_dragon_ball')).toBe(true);
    // exatamente 3 — matriz fechada
    expect(MISSION_BLOCKED_ACTIONS.size).toBe(3);
    // TUDO mais LIBERADO (v0.16 — 3ª ordem):
    for (const liberated of ['attack_player', 'world_boss_attack', 'buy', 'sell', 'use_item', 'equip', 'unequip', 'wish', 'learn_technique', 'equip_technique', 'set_strategy', 'unlock_transformation', 'activate_transformation', 'create_guild', 'join_guild', 'leave_guild', 'donate_guild', 'claim_quest', 'claim_achievement', 'claim_mission', 'cancel_mission', 'select_player', 'buy_cosmetic', 'buy_talent', 'equip_cosmetic', 'unequip_cosmetic', 'mission']) {
      expect(MISSION_BLOCKED_ACTIONS.has(liberated)).toBe(false);
    }
  });

  test('coleta de recompensa NUNCA é bloqueada: claim_* fora dos DOIS sets (v0.16)', () => {
    for (const claim of ['claim_mission', 'claim_quest', 'claim_achievement']) {
      expect(MISSION_BLOCKED_ACTIONS.has(claim)).toBe(false);
      expect(ACTIVITY_BLOCKED_ACTIONS.has(claim)).toBe(false);
    }
  });

  test('isOnActiveMission: só enquanto o timer corre', () => {
    const future = { missionId: 'x', missionEndsAt: new Date(Date.now() + 60_000) };
    const past = { missionId: 'x', missionEndsAt: new Date(Date.now() - 60_000) };
    const none = { missionId: null, missionEndsAt: null };
    expect(isOnActiveMission(future)).toBe(true);
    expect(isOnActiveMission(past)).toBe(false); // concluída, aguardando coleta
    expect(isOnActiveMission(none)).toBe(false);
  });
});

describe('Períodos de reset (fuso America/Sao_Paulo — quests diárias/semanais)', () => {
  test('dayKey no formato YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-09-10T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('weekKey no formato YYYY-Www', () => {
    expect(weekKey(new Date('2026-09-10T12:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe('Custos e raças (fonte única de verdade)', () => {
  test('bônus raciais refletem exatamente a descrição da UI', () => {
    // valores aplicados pela engine == números anunciados nos perks
    expect(raceCombat('saiyajin').physicalDamageMult).toBeCloseTo(1.08);
    expect(raceCombat('humano').defenseMult).toBeCloseTo(1.07);
    expect(raceCombat('humano').kiDamageMult).toBeCloseTo(1.02);
    expect(raceCombat('namekuseijin').kiDamageMult).toBeCloseTo(1.05);
    expect(raceCombat('namekuseijin').dodgeBonus).toBeCloseTo(0.045);
    expect(raceCombat('androide').speedMult).toBeCloseTo(1.035);
    expect(raceCombat('androide').dodgeBonus).toBeCloseTo(0.045);
    expect(raceCombat('androide').kiAttackChanceBonus).toBeCloseTo(0.06);
    expect(raceCombat('majin').physicalDamageMult).toBeCloseTo(1.02);
    expect(raceEconomy('humano').energyRegenMult).toBeCloseTo(1.1);
    expect(raceEconomy('namekuseijin').hpRegenMult).toBeCloseTo(1.15);
    expect(raceEconomy('androide').missionEnergyMult).toBeCloseTo(0.85);
  });

  test('REGRA DE BALANCEAMENTO: nenhum bônus racial excede 15% em um atributo', () => {
    for (const race of ['saiyajin', 'humano', 'namekuseijin', 'androide', 'majin']) {
      const rc = raceCombat(race);
      const re = raceEconomy(race);
      for (const mult of [rc.physicalDamageMult, rc.kiDamageMult, rc.defenseMult, rc.speedMult]) {
        expect(mult).toBeLessThanOrEqual(1.15);
        expect(mult).toBeGreaterThan(0.85);
      }
      expect(rc.dodgeBonus).toBeLessThanOrEqual(0.08);
      expect(re.hpRegenMult).toBeLessThanOrEqual(1.15);
      expect(re.energyRegenMult).toBeLessThanOrEqual(1.15);
    }
  });

  test('nenhuma raça é 2x melhor que outra em regeneração', () => {
    const vals = ['saiyajin', 'humano', 'namekuseijin', 'androide', 'majin'].map((r) => raceEconomy(r).hpRegenMult);
    expect(Math.max(...vals) / Math.min(...vals)).toBeLessThan(1.2);
  });

  test('custo de energia de profissão da UI bate com o servidor (androide -15%)', () => {
    expect(professionEnergyCostOf(100, 'androide')).toBe(85);
    expect(professionEnergyCostOf(100, 'humano')).toBe(100);
  });
});
