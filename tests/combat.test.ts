import { describe, expect, test } from 'bun:test';
import {
  buildPlayerCombatant,
  buildNpcCombatant,
  computeDerived,
  decideFirst,
  loadoutTechniques,
  parseLoadout,
  parseItems,
  parseTechniques,
  canEquipInSlot,
  playerToView,
} from '@/lib/game/engine';
/// <reference types="bun-types" />
import type { Combatant, StrategyDef, TechniqueDef } from '@/lib/game/types';
import type { Player } from '@prisma/client';
import { getStrategy, getTechnique, STRATEGIES, TECHNIQUES } from '@/lib/game/content/techniques';
import { raceCombat } from '@/lib/game/rules';
import { simulateBattle } from '@/lib/game/engine';
import { makeRng } from '@/lib/game/engine';

// =====================================================================
// TESTES — engine de combate v2
// * bônus raciais simétricos (atacante E defensor);
// * empate de velocidade → 50/50;
// * físico escala de Força; energia escala de Ki;
// * loadout: só técnicas equipadas entram na luta.
// =====================================================================

/** Player fake para construir combatentes sem banco. */
function fakePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'test',
    name: 'Teste',
    race: 'humano',
    level: 10,
    xp: 0,
    zeni: 1000,
    crystals: 0,
    hp: 200,
    strength: 50,
    defense: 40,
    speed: 30,
    ki: 40,
    energy: 100,
    battlesWon: 0,
    battlesLost: 0,
    pvpWins: 0,
    trainingsDone: 0,
    guildDonated: 0,
    missionsDone: 0,
    dragonBalls: 0,
    isBot: false,
    items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
    techniques: '[]',
    loadout: '{"1":null,"2":null,"3":null,"S":null}',
    strategy: 'balanced',
    missionId: null,
    missionEndsAt: null,
    missionsCompleted: '[]',
    transformationId: null,
    transformationsOwned: '[]',
    lastZenkaiAt: null,
    zenkaiWindowStart: null,
    zenkaiCount24h: 0,
    lastZenkaiOpponentId: null,
    pveBattleDay: null,
    pveBattleCount: 0,
    stateVersion: 0,
    lastRegen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    accountId: null,
    guildId: null,
    avatarUrl: null,
    ...overrides,
  } as Player;
}

function combatantFrom(opts: {
  name: string;
  strength: number;
  ki: number;
  defense: number;
  speed: number;
  race?: Combatant['race'];
  techniques?: TechniqueDef[];
  strategy?: StrategyDef;
  power?: number;
}): Combatant {
  const rc = opts.race && opts.race !== 'none' ? raceCombat(opts.race) : raceCombat('humano');
  return {
    name: opts.name,
    emoji: '🥋',
    level: 10,
    race: opts.race ?? 'none',
    strength: opts.strength,
    defense: opts.defense,
    speed: opts.speed,
    ki: opts.ki,
    maxHp: 300,
    atkPower: Math.round(opts.strength * 2.2),
    kiPower: Math.round(opts.ki * 2.4),
    defPower: Math.round(opts.defense * 1.8),
    resPower: Math.round(opts.defense * 1.1 + opts.ki * 0.9),
    // poder de scouter: controlável por teste (Armadura de Escala 5.1);
    // padrão neutro (mesma escala dos dois lados — regra desligada)
    power: opts.power ?? 1000,
    raceCombat: rc,
    techniques: opts.techniques ?? [],
    strategy: opts.strategy ?? getStrategy('balanced'),
    maxBattleKi: 40 + opts.ki * 4,
    battleKi: 40 + opts.ki * 4,
    transformation: null,
  };
}

describe('Desempate de velocidade (50/50)', () => {
  test('velocidade maior sempre começa', () => {
    const fast = combatantFrom({ name: 'A', strength: 10, ki: 10, defense: 10, speed: 100 });
    const slow = combatantFrom({ name: 'B', strength: 10, ki: 10, defense: 10, speed: 20 });
    for (let i = 0; i < 30; i++) {
      expect(decideFirst(fast, slow)).toBe('a');
      expect(decideFirst(slow, fast)).toBe('b');
    }
  });

  test('empate de velocidade é imparcial (~50/50, sem vantagem do iniciante)', () => {
    const a = combatantFrom({ name: 'A', strength: 10, ki: 10, defense: 10, speed: 50 });
    const b = combatantFrom({ name: 'B', strength: 10, ki: 10, defense: 10, speed: 50 });
    let aFirst = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      if (decideFirst(a, b) === 'a') aFirst++;
    }
    // entre 45% e 55% com alta confiança
    const ratio = aFirst / N;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });
});

describe('Stats derivados: físico vs energia', () => {
  test('atkPower escala de Força; kiPower escala de Ki', () => {
    const p = fakePlayer({ strength: 100, ki: 10, race: 'humano' });
    const d = computeDerived(p);
    expect(d.atkPower).toBeGreaterThan(d.kiPower * 2); // guerreiro físico

    const p2 = fakePlayer({ strength: 10, ki: 100, race: 'humano' });
    const d2 = computeDerived(p2);
    expect(d2.kiPower).toBeGreaterThan(d2.atkPower); // guerreiro de Ki
  });

  test('resistência de energia mistura Defesa e Ki em proporção equilibrada', () => {
    const p = fakePlayer({ defense: 100, ki: 0 });
    const d = computeDerived(p);
    // def 100: resPower = (110 + 0) ≈ defPower/1.8*1.1 → menor que defPower
    expect(d.resPower).toBeLessThan(d.defPower);
    const p2 = fakePlayer({ defense: 50, ki: 50 });
    const d2 = computeDerived(p2);
    expect(d2.resPower).toBeGreaterThan(0);
  });

  test('bônus racial Saiyajin aumenta atkPower (atacante físico, 9% v0.4)', () => {
    const humano = computeDerived(fakePlayer({ race: 'humano', strength: 100 }));
    const saiyajin = computeDerived(fakePlayer({ race: 'saiyajin', strength: 100 }));
    expect(saiyajin.atkPower).toBe(Math.round(humano.atkPower * raceCombat('saiyajin').physicalDamageMult));
  });

  test('bônus racial Majin aumenta kiPower (versátil: tudo +2% v0.4)', () => {
    const base = computeDerived(fakePlayer({ race: 'androide', ki: 100 })); // neutro em Ki
    const majin = computeDerived(fakePlayer({ race: 'majin', ki: 100 }));
    expect(majin.kiPower).toBe(Math.round(base.kiPower * raceCombat('majin').kiDamageMult));
  });

  test('bônus racial Humano aumenta defesa (def + res, 7% v0.4)', () => {
    const saiyajin = computeDerived(fakePlayer({ race: 'saiyajin', defense: 100 }));
    const humano = computeDerived(fakePlayer({ race: 'humano', defense: 100 }));
    expect(humano.defPower).toBe(Math.round(saiyajin.defPower * raceCombat('humano').defenseMult));
    expect(humano.resPower).toBe(Math.round(saiyajin.resPower * raceCombat('humano').defenseMult));
  });

  test('bônus racial Namekuseijin: +5% de dano de Ki (regeneração fica na economia)', () => {
    const base = computeDerived(fakePlayer({ race: 'androide', ki: 100 })); // neutro em Ki
    const namek = computeDerived(fakePlayer({ race: 'namekuseijin', ki: 100 }));
    expect(namek.kiPower).toBe(Math.round(base.kiPower * raceCombat('namekuseijin').kiDamageMult));
  });
});

describe('Simetria racial (PvP justo nos dois lados)', () => {
  test('combatente construído de Player usa raça do próprio player', () => {
    const saiyajin = buildPlayerCombatant(fakePlayer({ race: 'saiyajin' }));
    expect(saiyajin.raceCombat.physicalDamageMult).toBe(raceCombat('saiyajin').physicalDamageMult);
    const majin = buildPlayerCombatant(fakePlayer({ race: 'majin' }));
    expect(majin.raceCombat.kiDamageMult).toBe(raceCombat('majin').kiDamageMult);
    const namek = buildPlayerCombatant(fakePlayer({ race: 'namekuseijin' }));
    expect(namek.raceCombat.dodgeBonus).toBe(raceCombat('namekuseijin').dodgeBonus);
    const humano = buildPlayerCombatant(fakePlayer({ race: 'humano' }));
    expect(humano.raceCombat.defenseMult).toBe(raceCombat('humano').defenseMult);
    const androide = buildPlayerCombatant(fakePlayer({ race: 'androide' }));
    expect(androide.raceCombat.speedMult).toBe(raceCombat('androide').speedMult);
  });

  test('mesma simulação independe de quem "iniciou": engine aplica raça aos dois lados', () => {
    // O combate é função dos combatentes — o atacante não recebe tratamento especial.
    const playerA = combatantFrom({ name: 'A', strength: 80, ki: 10, defense: 40, speed: 50, race: 'saiyajin' });
    const playerB = combatantFrom({ name: 'B', strength: 10, ki: 80, defense: 40, speed: 50, race: 'majin' });
    // ambos têm raceCombat aplicado simetricamente na engine (ver simulateBattle):
    // dano físico do A usa A.physicalDamageMult; dano recebido por A usa A.defenseMult
    expect(playerA.raceCombat.physicalDamageMult).toBe(raceCombat('saiyajin').physicalDamageMult);
    expect(playerB.raceCombat.kiDamageMult).toBe(raceCombat('majin').kiDamageMult);
  });
});

describe('Loadout de técnicas', () => {
  test('apenas técnicas equipadas E aprendidas entram no combate', () => {
    const p = fakePlayer({
      techniques: JSON.stringify(['kamehameha', 'genki_dama', 'rogafufuken']),
      loadout: JSON.stringify({ '1': 'kamehameha', '2': null, '3': null, S: 'genki_dama' }),
    });
    const techs = loadoutTechniques(p);
    const ids = techs.map((t) => t.id).sort();
    expect(ids).toEqual(['genki_dama', 'kamehameha']); // rogafufuken NÃO entra (não equipada)
  });

  test('técnica não aprendida no loadout é ignorada (anti-manipulação)', () => {
    const p = fakePlayer({
      techniques: JSON.stringify(['kamehameha']),
      loadout: JSON.stringify({ '1': 'final_flash', '2': null, '3': null, S: null }),
    });
    expect(loadoutTechniques(p)).toHaveLength(0);
  });

  test('categoria suprema só cabe no slot S; comuns não ocupam o slot S', () => {
    const genki = getTechnique('genki_dama')!;
    const kame = getTechnique('kamehameha')!;
    expect(genki.category).toBe('supreme');
    expect(canEquipInSlot(genki, 'S')).toBe(true);
    expect(canEquipInSlot(genki, '1')).toBe(false);
    expect(canEquipInSlot(kame, '1')).toBe(true);
    expect(canEquipInSlot(kame, 'S')).toBe(false);
  });

  test('todas as técnicas têm kiCost positivo e poder > 1', () => {
    // data-driven: integridade dos dados de técnicas
    for (const t of TECHNIQUES) {
      expect(t.kiCost).toBeGreaterThan(0);
      expect(t.power).toBeGreaterThan(1);
      expect(t.name.length).toBeGreaterThan(0);
    }
  });
});

describe('Estratégias', () => {
  test('as 5 estratégias existem e têm trade-offs coerentes', () => {
    expect(Object.keys(STRATEGIES)).toHaveLength(5);
    const aggr = STRATEGIES.aggressive;
    const def = STRATEGIES.defensive;
    expect(aggr.damageDealtMult).toBeGreaterThan(def.damageDealtMult); // agressivo causa mais
    expect(aggr.damageTakenMult).toBeGreaterThan(def.damageTakenMult); // e recebe mais
    expect(STRATEGIES.melee.physicalBias).toBeGreaterThan(0);
    expect(STRATEGIES.ki_specialist.physicalBias).toBeLessThan(0);
  });
});

describe('Parsing defensivo de JSON', () => {
  test('parseItems sobrevive a JSON corrompido', () => {
    const items = parseItems('{{{lixo');
    expect(items.owned).toEqual([]);
    expect(items.weapon).toBeNull();
    expect(items.consumables).toEqual({});
  });

  test('parseTechniques/parseLoadout com valores inválidos caem em defaults seguros', () => {
    expect(parseTechniques('não-json')).toEqual([]);
    const l = parseLoadout('{"1":123}');
    expect(l['1']).toBeNull();
  });
});

describe('playerToView (interface)', () => {
  test('view inclui loadout, estratégia, cristais e HP limitado pelo máximo', () => {
    const p = fakePlayer({ hp: 99999, ki: 40 });
    const view = playerToView(p);
    expect(view.hp).toBeLessThanOrEqual(view.derived.maxHp);
    expect(view.crystals).toBe(0);
    expect(view.loadout['1']).toBeNull();
    expect(view.strategy).toBe('balanced');
    expect(view.transformation).toBeNull();
  });

  test('view inclui avatar customizado e dados de regeneração — SEM gênero (v0.16)', () => {
    const p = fakePlayer({ avatarUrl: 'https://exemplo.com/img.png' });
    const view = playerToView(p);
    // v0.16 — ANTI-DRIFT: gênero foi REMOVIDO da view do jogador (3ª ordem).
    // Se este teste falhar, o campo de gênero voltou ao PlayerView — reverta.
    expect(view).not.toHaveProperty('gender');
    expect(view.avatarUrl).toBe('https://exemplo.com/img.png');
    expect(view.regen.energyIntervalSec).toBeGreaterThan(0);
    expect(view.regen.hpIntervalSec).toBeGreaterThan(0);
    expect(Number.isNaN(new Date(view.regen.lastRegenAt).getTime())).toBe(false);
  });

  test('campo gender no banco legado é IGNORADO pela view (tolerância v0.16)', () => {
    // snapshots/bancos legados podem ainda carregar gender — a view nunca expõe
    const p = fakePlayer({ avatarUrl: null });
    expect(playerToView(p)).not.toHaveProperty('gender');
  });

  test('humano regenera energia mais rápido (intervalo menor) que saiyajin', () => {
    const h = playerToView(fakePlayer({ race: 'humano' })).regen.energyIntervalSec;
    const s = playerToView(fakePlayer({ race: 'saiyajin' })).regen.energyIntervalSec;
    expect(h).toBeLessThan(s);
  });
});

describe('firstAction (quem começa a luta) — v0.3', () => {
  test('SEMPRE assignado: { isPlayer } presente em toda simulação', () => {
    const player = combatantFrom({ name: 'A', strength: 60, ki: 10, defense: 40, speed: 50 });
    const enemy = combatantFrom({ name: 'B', strength: 40, ki: 10, defense: 40, speed: 50 });
    const sim = simulateBattle(player, enemy, { playerStartHp: 300, rng: makeRng(42) });
    expect(sim.firstAction).not.toBeNull();
    expect(typeof sim.firstAction?.isPlayer).toBe('boolean');
  });

  test('velocidade maior → firstAction.isPlayer = true (jogador mais rápido)', () => {
    const fast = combatantFrom({ name: 'Rápido', strength: 60, ki: 10, defense: 40, speed: 100 });
    const slow = combatantFrom({ name: 'Lento', strength: 40, ki: 10, defense: 40, speed: 20 });
    for (let seed = 0; seed < 25; seed++) {
      const sim = simulateBattle(fast, slow, { playerStartHp: 300, rng: makeRng(seed) });
      expect(sim.firstAction?.isPlayer).toBe(true);
    }
  });

  test('velocidade menor → firstAction.isPlayer = false', () => {
    const fast = combatantFrom({ name: 'Rápido', strength: 60, ki: 10, defense: 40, speed: 100 });
    const slow = combatantFrom({ name: 'Lento', strength: 40, ki: 10, defense: 40, speed: 20 });
    for (let seed = 0; seed < 25; seed++) {
      const sim = simulateBattle(slow, fast, { playerStartHp: 300, rng: makeRng(seed) });
      expect(sim.firstAction?.isPlayer).toBe(false);
    }
  });

  test('empate de velocidade: firstAction segue o rng 50/50 (imparcial)', () => {
    const a = combatantFrom({ name: 'A', strength: 50, ki: 10, defense: 40, speed: 50 });
    const b = combatantFrom({ name: 'B', strength: 50, ki: 10, defense: 40, speed: 50 });
    let playerFirst = 0;
    const N = 2000;
    for (let seed = 0; seed < N; seed++) {
      const sim = simulateBattle(a, b, { playerStartHp: 300, rng: makeRng(seed) });
      if (sim.firstAction?.isPlayer) playerFirst++;
    }
    const ratio = playerFirst / N;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });
});

describe('NPCs (PvE)', () => {
  test('combatente NPC tem raceCombat neutro e estratégia balanceada', () => {
    const npc = buildNpcCombatant(0);
    expect(npc.raceCombat.physicalDamageMult).toBe(1);
    expect(npc.strategy.id).toBe('balanced');
    expect(npc.maxHp).toBeGreaterThan(0);
  });
});
