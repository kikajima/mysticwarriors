import { describe, expect, test } from 'bun:test';

describe('Torneio — sincronização do resultado', () => {
  test('fim da luta usa action leve em vez do /state pesado', async () => {
    const page = await Bun.file(`${import.meta.dir}/../src/app/jogar/page.tsx`).text();
    expect(page).toContain("type: 'sync_activity'");
    expect(page).toContain("fetch('/api/game/action'");
    expect(page).toContain('controller.abort()');
    expect(page).toContain('12_000');
  });

  test('executor atualiza o Player depois de aplicar atividade vencida', async () => {
    const actions = await Bun.file(`${import.meta.dir}/../src/lib/game/actions.ts`).text();
    expect(actions).toContain("case 'sync_activity'");
    expect(actions).toContain('if (appliedResults.length > 0)');
    expect(actions).toContain('player = await requirePlayer(auth, playerId, tx)');
  });

  test('sync não paga setup de quests novamente', async () => {
    const route = await Bun.file(`${import.meta.dir}/../src/app/api/game/action/route.ts`).text();
    expect(route).toContain("if (type !== 'sync_activity')");
  });

  test('atividade vencida não é mais apresentada como luta em 0s', async () => {
    const panel = await Bun.file(`${import.meta.dir}/../src/components/game/TournamentPanel.tsx`).text();
    expect(panel).toContain('runningExpired');
    expect(panel).toContain('Confirmando resultado da luta…');
  });
});
