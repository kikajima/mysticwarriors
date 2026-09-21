import { describe, expect, test } from 'bun:test';
import {
  TOURNAMENT_COOLDOWN_MS,
  TOURNAMENT_ROUNDS,
  QUARTAS_FIGHTERS,
  SEMI_FIGHTERS,
  FINAL_FIGHTERS,
  fightersForRound,
  fighterForRound,
  roundDef,
  tournamentRewards,
  tournamentZeniReward,
  tournamentXpReward,
  parseTournament,
  serializeTournament,
  startRun,
  advanceTournament,
  tournamentCooldownRemainingMs,
  validateTournamentFight,
  buildTournamentOpponent,
} from '../src/lib/game/content/tournament';
import { simulateBattle, makeRng, buildPlayerCombatant } from '../src/lib/game/engine';
import { raceCombat } from '../src/lib/game/rules';
import { getStrategy } from '../src/lib/game/content/techniques';
import { ACHIEVEMENTS, WEEKLY_QUESTS } from '../src/lib/game/content/quests';
import { achievementMetrics } from '../src/lib/progression';
import type { Combatant } from '@/lib/game/types';
import type { Player as DbPlayer } from '@prisma/client';

// =====================================================================
// TESTES — TORNEIO DE ARTES MARCIAIS (v0.9.18)
// A chave de 8: quartas → semifinal → GRANDE FINAL.
//  • estado da campanha (parse/transições/cooldown) — 100% puro;
//  • adversário elástico (escala pelo combatente REAL do jogador);
//  • premiação por rodada + título na final;
//  • catálogo/conquistas/quests integrados;
//  • a engine roda a luta com o oponente construído (integração).
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
    techniques: [],
    strategy: getStrategy('balanced'),
    maxBattleKi: 240,
    battleKi: 240,
    transformation: null,
    ...overrides,
  };
}

describe('TORNEIO — catálogo (elenco, rodadas, premiação)', () => {
  test('elenco completo: 3 quartas + 3 semis + 2 finais = chave de 8 com o jogador', () => {
    expect(QUARTAS_FIGHTERS.length).toBe(3);
    expect(SEMI_FIGHTERS.length).toBe(3);
    expect(FINAL_FIGHTERS.length).toBe(2);
    const all = [...QUARTAS_FIGHTERS, ...SEMI_FIGHTERS, ...FINAL_FIGHTERS];
    expect(new Set(all.map((f) => f.id)).size).toBe(8);
    for (const f of all) {
      expect(f.name.length).toBeGreaterThan(3);
      expect(f.emoji.length).toBeGreaterThan(0);
      expect(f.taunt.length).toBeGreaterThan(15);
      expect(f.epithet.length).toBeGreaterThan(3);
      expect(f.color).toMatch(/^from-/);
      // viés plausível: nada de lutador 10× mais forte em um eixo
      for (const v of Object.values(f.bias)) {
        expect(v).toBeGreaterThan(0.5);
        expect(v).toBeLessThan(1.5);
      }
    }
  });

  test('três rodadas com dificuldade crescente e premiação crescente', () => {
    expect(TOURNAMENT_ROUNDS.length).toBe(3);
    expect(TOURNAMENT_ROUNDS[0].powerMult).toBeLessThan(TOURNAMENT_ROUNDS[1].powerMult);
    expect(TOURNAMENT_ROUNDS[1].powerMult).toBeLessThan(TOURNAMENT_ROUNDS[2].powerMult);
    expect(TOURNAMENT_ROUNDS[0].zeniBase).toBeLessThan(TOURNAMENT_ROUNDS[1].zeniBase);
    expect(TOURNAMENT_ROUNDS[1].zeniBase).toBeLessThan(TOURNAMENT_ROUNDS[2].zeniBase);
    expect(TOURNAMENT_ROUNDS[0].xpPct).toBeLessThan(TOURNAMENT_ROUNDS[1].xpPct);
    expect(TOURNAMENT_ROUNDS[1].xpPct).toBeLessThan(TOURNAMENT_ROUNDS[2].xpPct);
    expect(TOURNAMENT_ROUNDS.every((round) => !('crystals' in round))).toBe(true);
    expect(roundDef(1).short).toBe('Quartas');
    expect(roundDef(2).short).toBe('Semifinal');
    expect(roundDef(3).name).toBe('GRANDE FINAL');
    // roundDef tolera lixo
    expect(roundDef(0).round).toBe(1);
    expect(roundDef(99).round).toBe(3);
  });

  test('premiação: título apenas na final; Zeni e XP acompanham o nível; sem cristais', () => {
    const r1 = tournamentRewards(1, 10);
    const r3 = tournamentRewards(3, 10);
    expect(r1.title).toBe(false);
    expect(r3.title).toBe(true);
    expect(r3.xp).toBeGreaterThan(r1.xp);
    expect(r3.zeni).toBeGreaterThan(r1.zeni);
    expect('crystals' in r1).toBe(false);
    expect('crystals' in r3).toBe(false);

    // níveis maiores rendem proporcionalmente mais XP e Zeni.
    expect(tournamentXpReward(2, 30)).toBeGreaterThan(tournamentXpReward(2, 10));
    expect(tournamentZeniReward(2, 30)).toBeGreaterThan(tournamentZeniReward(2, 10));
    expect(tournamentZeniReward(3, 100)).toBeGreaterThan(tournamentZeniReward(3, 50));
    expect(tournamentXpReward(1, 1)).toBeGreaterThanOrEqual(1);
    expect(tournamentZeniReward(1, 1)).toBe(TOURNAMENT_ROUNDS[0].zeniBase);
  });

  test('fluxo direto do torneio não concede nem anuncia cristais', async () => {
    const actions = await Bun.file(`${import.meta.dir}/../src/lib/game/actions.ts`).text();
    const activities = await Bun.file(`${import.meta.dir}/../src/lib/game/activities.ts`).text();
    const panel = await Bun.file(`${import.meta.dir}/../src/components/game/TournamentPanel.tsx`).text();

    const actionStart = actions.indexOf('async function actionStartTournamentFight');
    const actionEnd = actions.indexOf('// ===== PVP', actionStart);
    const tournamentAction = actions.slice(actionStart, actionEnd);
    expect(tournamentAction).not.toContain('rewards.crystals');
    expect(tournamentAction).not.toContain('crystalsGain');

    const applyStart = activities.indexOf('async function applyTournamentResult');
    const applyEnd = activities.indexOf('// ===== helpers exportados', applyStart);
    const tournamentApply = activities.slice(applyStart, applyEnd);
    expect(tournamentApply).not.toContain('data.crystals');
    expect(tournamentApply).toContain('crystalsGain: undefined');

    expect(panel).not.toContain('roundDef(round).crystals');
    expect(panel).not.toContain('r.crystals');
  });

  test('consolação do eliminado: metade do XP, nunca zero (a luta ensina)', () => {
    // espelha a fórmula da ação: derrota leva floor(xp/2) com mínimo 1
    const consolation = (round: number, level: number) =>
      Math.max(1, Math.floor(tournamentXpReward(round, level) / 2));
    expect(consolation(1, 10)).toBeGreaterThanOrEqual(1);
    expect(consolation(3, 20)).toBe(Math.floor(tournamentXpReward(3, 20) / 2));
    expect(consolation(1, 1)).toBeGreaterThanOrEqual(1); // xp 1 → floor(0.5)=0 → mínimo 1
  });

  test('confronto determinístico por (rodada, campanha) e rotação entre campanhas', () => {
    const a = fighterForRound(1, 0);
    const b = fighterForRound(1, 0);
    expect(a.id).toBe(b.id);
    // campanhas consecutivas pegam lutadores diferentes no mesmo round
    const ids = new Set<number>();
    for (let run = 0; run < 3; run++) {
      ids.add(QUARTAS_FIGHTERS.findIndex((f) => f.id === fighterForRound(1, run).id));
    }
    expect(ids.size).toBe(3);
    // fightersForRound nunca volta vazio
    for (const r of [1, 2, 3, 0, 99]) {
      expect(fightersForRound(r).length).toBeGreaterThan(0);
    }
  });
});

describe('TORNEIO — estado da campanha (parse/transições)', () => {
  test('parse tolerante: null/lixim/valores fora de faixa nunca lançam', () => {
    expect(parseTournament(null).round).toBe(0);
    expect(parseTournament(undefined).round).toBe(0);
    expect(parseTournament('não é json').round).toBe(0);
    expect(parseTournament('{}').round).toBe(0);
    const garbage = parseTournament('{"round": 42, "wins": -5, "runCount": 1e9, "bestRound": "x", "lastRunAt": 123}');
    expect(garbage.round).toBe(3); // clampa
    expect(garbage.wins).toBe(0); // negativo vira 0
    expect(garbage.runCount).toBeGreaterThan(0);
    expect(garbage.bestRound).toBe(0); // lixo vira 0
    expect(garbage.lastRunAt).toBeNull();
  });

  test('serialize→parse é ida e volta sem perdas', () => {
    const state = { round: 2, wins: 1, runCount: 7, bestRound: 2, lastRunAt: '2026-09-14T00:00:00.000Z' };
    const back = parseTournament(serializeTournament(state));
    expect(back).toEqual(state);
  });

  test('startRun abre campanha nova (round 1) e incrementa o contador', () => {
    const before = { round: 0, wins: 2, runCount: 4, bestRound: 2, lastRunAt: '2026-09-14T00:00:00.000Z' };
    const after = startRun(before);
    expect(after.round).toBe(1);
    expect(after.runCount).toBe(5);
    expect(after.wins).toBe(0); // vitórias são DA CAMPANHA
    expect(after.bestRound).toBe(2); // histórico permanece
    expect(after.lastRunAt).toBe(before.lastRunAt); // cooldown antigo não é apagado
  });

  test('advanceTournament: vitória avança; derrota elimina; final coroa', () => {
    const now = new Date('2026-09-14T12:00:00.000Z');
    const base = { round: 1, wins: 0, runCount: 1, bestRound: 0, lastRunAt: null };
    // vitória nas quartas → semifinal
    const semi = advanceTournament(base, 1, true, now);
    expect(semi.round).toBe(2);
    expect(semi.wins).toBe(1);
    expect(semi.bestRound).toBe(1);
    expect(semi.lastRunAt).toBeNull(); // campanha CONTINUA
    // vitória na semi → final
    const final = advanceTournament(semi, 2, true, now);
    expect(final.round).toBe(3);
    expect(final.wins).toBe(2);
    expect(final.bestRound).toBe(2);
    // vitória na final → título, campanha encerra, cooldown conta
    const champ = advanceTournament(final, 3, true, now);
    expect(champ.round).toBe(0);
    expect(champ.wins).toBe(3);
    expect(champ.bestRound).toBe(3);
    expect(champ.lastRunAt).toBe(now.toISOString());
    // derrota nas quartas → eliminado, bestRound registra 0 vitórias
    const out = advanceTournament(base, 1, false, now);
    expect(out.round).toBe(0);
    expect(out.wins).toBe(0);
    expect(out.bestRound).toBe(0);
    expect(out.lastRunAt).toBe(now.toISOString());
    // derrota na final → eliminado MAS bestRound 2 (chegou à final)
    const outFinal = advanceTournament(final, 3, false, now);
    expect(outFinal.round).toBe(0);
    expect(outFinal.bestRound).toBe(2);
  });
});

describe('TORNEIO — cooldown do comitê', () => {
  test('cooldown de 15 minutos: bloqueia no início e libera no fim', () => {
    const end = new Date('2026-09-14T12:00:00.000Z');
    const state = { round: 0, wins: 0, runCount: 1, bestRound: 0, lastRunAt: end.toISOString() };
    const justAfter = new Date(end.getTime() + 60_000);
    expect(tournamentCooldownRemainingMs(state, justAfter)).toBeGreaterThan(TOURNAMENT_COOLDOWN_MS - 90_000);
    const before15 = new Date(end.getTime() + TOURNAMENT_COOLDOWN_MS - 1_000);
    expect(tournamentCooldownRemainingMs(state, before15)).toBeGreaterThan(0);
    const after15 = new Date(end.getTime() + TOURNAMENT_COOLDOWN_MS + 1_000);
    expect(tournamentCooldownRemainingMs(state, after15)).toBe(0);
    // em campanha ativa ou sem histórico não existe cooldown
    expect(tournamentCooldownRemainingMs({ ...state, round: 2 }, after15)).toBe(0);
    expect(tournamentCooldownRemainingMs({ ...state, lastRunAt: null }, after15)).toBe(0);
    // lastRunAt lixo não trava o jogador para sempre
    expect(tournamentCooldownRemainingMs({ ...state, lastRunAt: 'lixo' }, after15)).toBe(0);
  });

  test('validateTournamentFight: abre campanha quando livre; bloqueia quando cedo; segue quando em corrida', () => {
    const now = new Date('2026-09-14T12:00:00.000Z');
    // livre → abre campanha
    const idle = { round: 0, wins: 0, runCount: 2, bestRound: 1, lastRunAt: null };
    const open = validateTournamentFight(idle, now);
    expect(open.ok).toBe(true);
    expect(open.round).toBe(1);
    expect(open.stateToFight!.runCount).toBe(3);
    expect(open.stateToFight!.round).toBe(1);
    // em cooldown → rejeita com motivo legível
    const cooling = { ...idle, lastRunAt: new Date(now.getTime() - 60_000).toISOString() };
    const blocked = validateTournamentFight(cooling, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain('comitê');
    // em campanha → luta a rodada atual (não abre outra)
    const running = { round: 3, wins: 2, runCount: 5, bestRound: 2, lastRunAt: null };
    const next = validateTournamentFight(running, now);
    expect(next.ok).toBe(true);
    expect(next.round).toBe(3);
    expect(next.stateToFight!.runCount).toBe(5);
  });
});

describe('TORNEIO — adversário elástico', () => {
  const player = combatant({ name: 'Guerreiro', power: 10_000, level: 20, strength: 200, defense: 180, speed: 150, ki: 160 });

  test('poder cresce com a rodada e fica na vizinhança do jogador', () => {
    const r1 = buildTournamentOpponent(QUARTAS_FIGHTERS[0], player, 1);
    const r2 = buildTournamentOpponent(SEMI_FIGHTERS[0], player, 2);
    const r3 = buildTournamentOpponent(FINAL_FIGHTERS[0], player, 3);
    // o adversário NUNCA fica trivial nem esmagador: 60%–160% do poder
    for (const opp of [r1, r2, r3]) {
      expect(opp.power).toBeGreaterThan(player.power * 0.6);
      expect(opp.power).toBeLessThan(player.power * 1.6);
      expect(opp.maxHp).toBeGreaterThan(0);
      expect(opp.atkPower).toBeGreaterThan(0);
      expect(opp.raceCombat.physicalDamageMult).toBe(1); // neutro
      expect(opp.techniques.length).toBe(0); // sem técnicas
    }
    expect(r1.power).toBeLessThan(r3.power);
    expect(r2.power).toBeLessThan(r3.power);
    // combate SEM recursos: nem técnicas nem talentos
    expect(r3.talents ?? []).toHaveLength(0);
  });

  test('viés do lutador re-distribui o poder (tanque ≠ velocista)', () => {
    const tank = QUARTAS_FIGHTERS.find((f) => f.bias.def > 1.05)!;
    const speedy = QUARTAS_FIGHTERS.find((f) => f.bias.spd > 1.1)!;
    const asTank = buildTournamentOpponent(tank, player, 1);
    const asSpeedy = buildTournamentOpponent(speedy, player, 1);
    expect(asTank.defPower).toBeGreaterThan(asSpeedy.defPower);
    expect(asSpeedy.speed).toBeGreaterThan(asTank.speed);
    // adversário elástico escala com o jogador (rubber band)
    const strongPlayer = combatant({ ...player, name: 'Forte', power: 100_000, strength: 2000, defense: 1800, speed: 1500, ki: 1600, atkPower: 4000 });
    const vsStrong = buildTournamentOpponent(QUARTAS_FIGHTERS[0], strongPlayer, 1);
    expect(vsStrong.power).toBeGreaterThan(asTank.power * 5);
  });

  test('determinismo: mesmo lutador/jogador/rodada → combatente idêntico', () => {
    const a = buildTournamentOpponent(FINAL_FIGHTERS[1], player, 3);
    const b = buildTournamentOpponent(FINAL_FIGHTERS[1], player, 3);
    expect(a).toEqual(b);
  });

  test('integração: a engine roda a luta do torneio ponta a ponta', () => {
    // jogador com carga real (buildPlayerCombatant de um Player de mentira)
    const fakePlayer = {
      name: 'Integrado',
      race: 'saiyajin',
      level: 12,
      strength: 90,
      defense: 70,
      speed: 66,
      ki: 80,
      hp: 300,
      items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
      techniques: '[]',
      loadout: '{"1":null,"2":null,"3":null,"S":null}',
      strategy: 'balanced',
      transformationId: null,
      talents: '[]',
    } as unknown as DbPlayer;
    const pc = buildPlayerCombatant(fakePlayer as DbPlayer);
    const opp = buildTournamentOpponent(fighterForRound(1, 0), pc, 1);
    const sim = simulateBattle(pc, opp, { playerStartHp: 300, rng: makeRng(777) });
    expect(sim.rounds.length).toBeGreaterThan(0);
    expect(typeof sim.won).toBe('boolean');
    // reprodutível com a mesma semente
    const sim2 = simulateBattle(pc, opp, { playerStartHp: 300, rng: makeRng(777) });
    expect(JSON.stringify(sim2.rounds.map((r) => r.text))).toBe(JSON.stringify(sim.rounds.map((r) => r.text)));
  });
});

describe('TORNEIO — conquistas, quests e métricas', () => {
  test('três conquistas de torneio com métricas e categoria próprias', () => {
    const list = ACHIEVEMENTS.filter((a) => a.category === 'tournament');
    expect(list.length).toBe(3);
    expect(new Set(list.map((a) => a.id)).size).toBe(3);
    for (const a of list) {
      expect(['tournamentTitles', 'tournamentRoundWins']).toContain(a.metric);
      expect(a.rewardZeni).toBeGreaterThan(0);
      expect(a.rewardCrystals).toBeGreaterThan(0);
    }
    expect(ACHIEVEMENTS.find((a) => a.id === 'tournament_champion')?.target).toBe(1);
    expect(ACHIEVEMENTS.find((a) => a.id === 'tournament_dynasty')?.target).toBe(5);
    expect(ACHIEVEMENTS.find((a) => a.id === 'tournament_debut')?.metric).toBe('tournamentRoundWins');
  });

  test('quest semanal Gladiador da arena usa a métrica tournament_win', () => {
    const q = WEEKLY_QUESTS.find((w) => w.id === 'weekly_tournament');
    expect(q).toBeDefined();
    expect(q!.metric).toBe('tournament_win');
    expect(q!.target).toBe(5);
    expect(q!.kind).toBe('weekly');
  });

  test('achievementMetrics expõe as colunas do torneio', () => {
    const player = {
      battlesWon: 0, battlesLost: 0, missionsDone: 0, level: 1, techniques: '[]',
      guildId: null, items: '{"owned":[],"consumables":{}}', transformationsOwned: '[]',
      dragonBalls: 0, pvpWins: 0, guildDonated: 0, trainingsDone: 0,
      miracleWins: 0, davidWins: 0,
      tournamentTitles: 2, tournamentRoundWins: 9,
    } as unknown as DbPlayer;
    const metrics = achievementMetrics(player);
    expect(metrics.tournamentTitles).toBe(2);
    expect(metrics.tournamentRoundWins).toBe(9);
  });
});

describe('TORNEIO — integridade do bloqueio central', () => {
  test('tournament_fight está nas ações bloqueadas por atividade em andamento', async () => {
    const rules = await import('../src/lib/game/rules');
    expect(rules.ACTIVITY_BLOCKED_ACTIONS.has('tournament_fight')).toBe(true);
    // e está nos 3 bloqueios de missão (trabalho ativo bloqueia o ringue)
    expect(rules.MISSION_BLOCKED_ACTIONS.has('tournament_fight')).toBe(true);
  });
});
