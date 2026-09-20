import { describe, expect, test } from 'bun:test';
import {
  DRAGON_BALL_PVP_STEAL_CHANCE,
  DRAGON_BALL_SEARCH_MAX_CHANCE,
  DRAGON_BALL_SEARCH_SHIFTS,
  getItem,
} from '../src/lib/game/content/world';

describe('Esferas do Dragão — consistência global', () => {
  test('chance de roubo PvP usa a constante central de 50%', async () => {
    expect(DRAGON_BALL_PVP_STEAL_CHANCE).toBe(0.5);
    const actions = await Bun.file(`${import.meta.dir}/../src/lib/game/actions.ts`).text();
    expect(actions).toContain('dragonBallStealChance: DRAGON_BALL_PVP_STEAL_CHANCE');
    expect(actions).not.toContain('dragonBallStealChance: 0.25');
  });

  test('roubo de esfera está dentro do ramo de vitória do PvP', async () => {
    const activities = await Bun.file(`${import.meta.dir}/../src/lib/game/activities.ts`).text();
    const start = activities.indexOf('async function applyPvpResult');
    const win = activities.indexOf('if (data.won) {', start);
    const loss = activities.indexOf('} else {', win);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(win).toBeGreaterThan(start);
    expect(loss).toBeGreaterThan(win);

    const beforeWin = activities.slice(start, win);
    const victoryBranch = activities.slice(win, loss);
    expect(beforeWin).not.toContain('dragonBallPossession.findFirst');
    expect(victoryBranch).toContain('dragonBallPossession.findFirst');
    expect(victoryBranch).toContain('dragonBallStolen = 1');
  });

  test('Radar soma 30 p.p. e respeita teto mundial de 50%', () => {
    const radar = getItem('radar_esferas');
    expect(radar?.dragonBallSearchChanceBonus).toBe(0.3);
    expect(DRAGON_BALL_SEARCH_MAX_CHANCE).toBe(0.5);
    expect(Math.max(...DRAGON_BALL_SEARCH_SHIFTS.map((shift) => shift.chance))).toBe(0.2);
    expect(
      Math.min(
        DRAGON_BALL_SEARCH_MAX_CHANCE,
        Math.max(...DRAGON_BALL_SEARCH_SHIFTS.map((shift) => shift.chance)) +
          (radar?.dragonBallSearchChanceBonus ?? 0)
      )
    ).toBe(0.5);
  });

  test('Busca mostra quantas estrelas estão livres e bloqueia antes de gastar energia quando são zero', async () => {
    const actions = await Bun.file(`${import.meta.dir}/../src/lib/game/actions.ts`).text();
    const start = actions.indexOf('async function actionSearchDragonBall');
    const end = actions.indexOf('async function actionCancelDragonBallSearch', start);
    const body = actions.slice(start, end);

    const countAt = body.indexOf("dragonBallPossession.count({ where: { playerId: null } })");
    const noFreeAt = body.indexOf("DRAGON_BALL_NONE_AVAILABLE");
    const energyAt = body.indexOf("energy: { decrement: DRAGON_BALL_SEARCH_ENERGY_COST }");
    expect(countAt).toBeGreaterThanOrEqual(0);
    expect(noFreeAt).toBeGreaterThan(countAt);
    expect(energyAt).toBeGreaterThan(noFreeAt);
    expect(body).toContain('Há ${freeStars}');
    expect(body).toContain('esferas espalhadas');

    const state = await Bun.file(`${import.meta.dir}/../src/app/api/game/state/route.ts`).text();
    expect(state).toContain("db.dragonBallPossession.count({ where: { playerId: null } })");
    expect(state).toContain('playerView.dragonBallsAvailable = dragonBallsAvailable');

    const panel = await Bun.file(`${import.meta.dir}/../src/components/game/ProfessionsPanel.tsx`).text();
    expect(panel).toContain('Esferas espalhadas');
    expect(panel).toContain('noFreeBalls');
    expect(panel).toContain('Nenhuma esfera espalhada');
  });

  test('restore de nuvem não recria posse global de esfera', async () => {
    const restore = await Bun.file(`${import.meta.dir}/../src/app/api/game/cloud-restore/route.ts`).text();
    expect(restore).toContain('Esferas são recurso GLOBAL do mundo');
    expect(restore.match(/dragonBalls: 0/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('estado pessoal usa a tabela global para exibir a contagem', async () => {
    const state = await Bun.file(`${import.meta.dir}/../src/app/api/game/state/route.ts`).text();
    expect(state).toContain('dragonBallPossessions: { select: { star: true } }');
    expect(state).toContain('currentPlayer.dragonBalls = withActivity.dragonBallPossessions.length');
  });
});
