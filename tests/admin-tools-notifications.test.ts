import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { applyPendingMigrations } from '../src/lib/game/persistence';
import { initialCloudCharacterState, initialPlayerData } from '../src/lib/game/characterInitial';
import {
  grantAdminDragonBallStar,
  patchCloudCharacterState,
} from '../src/lib/game/adminActions';
import {
  acknowledgePlayerNotifications,
  createPlayerNotification,
  listPendingPlayerNotifications,
} from '../src/lib/game/notifications';

async function makeDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-admin-alerts-'));
  const db = new PrismaClient({
    datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } },
  });
  await applyPendingMigrations(db);
  return { db, dir };
}

describe('Notificações persistentes de jogador', () => {
  test('fica pendente até o cliente confirmar e depois some', async () => {
    const { db, dir } = await makeDb();
    try {
      const player = await db.player.create({
        data: { ...initialPlayerData(), name: 'QA Aviso', race: 'humano' },
      });

      await db.$transaction((tx) =>
        createPlayerNotification(tx, {
          playerId: player.id,
          kind: 'dragon_ball_lost',
          title: '🚨 Uma Chave foi roubada!',
          message: 'Teste persistente.',
          metadata: { star: 4 },
        })
      );

      const first = await db.$transaction((tx) =>
        listPendingPlayerNotifications(tx, player.id)
      );
      const second = await db.$transaction((tx) =>
        listPendingPlayerNotifications(tx, player.id)
      );
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0].metadata?.star).toBe(4);

      expect(
        await db.$transaction((tx) =>
          acknowledgePlayerNotifications(tx, player.id, [first[0].id])
        )
      ).toBe(1);
      expect(
        await db.$transaction((tx) =>
          listPendingPlayerNotifications(tx, player.id)
        )
      ).toHaveLength(0);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Admin — Chaves globais', () => {
  test('concede a estrela exata e recusa transferir estrela ocupada', async () => {
    const { db, dir } = await makeDb();
    try {
      const owner = await db.player.create({
        data: { ...initialPlayerData(), name: 'QA Estrela A', race: 'saiyajin' },
      });
      const other = await db.player.create({
        data: { ...initialPlayerData(), name: 'QA Estrela B', race: 'humano' },
      });

      const message = await db.$transaction((tx) =>
        grantAdminDragonBallStar(tx, owner, 4)
      );
      expect(message).toContain('Chave do Horizonte nº 4');
      expect(
        (await db.dragonBallPossession.findUniqueOrThrow({ where: { star: 4 } })).playerId
      ).toBe(owner.id);
      expect(
        (await db.player.findUniqueOrThrow({ where: { id: owner.id } })).dragonBalls
      ).toBe(1);
      expect(
        await db.playerNotification.count({
          where: { playerId: owner.id, kind: 'admin', deliveredAt: null },
        })
      ).toBe(1);

      let error: unknown;
      try {
        await db.$transaction((tx) => grantAdminDragonBallStar(tx, other, 4));
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error instanceof Error ? error.message : String(error)).toContain('já pertence');
      expect(
        (await db.dragonBallPossession.findUniqueOrThrow({ where: { star: 4 } })).playerId
      ).toBe(owner.id);
    } finally {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Admin — ferramentas novas de atividade e crafting', () => {
  test('snapshot da nuvem acelera trabalho/craft e aceita material + item craftado', () => {
    const base = initialCloudCharacterState({
      id: 'qa-cloud-admin',
      name: 'QA Cloud Admin',
      race: 'humano',
    });
    base.missionId = 'agricultor';
    base.missionStartedAt = new Date().toISOString();
    base.missionEndsAt = new Date(Date.now() + 3600_000).toISOString();
    base.missionHours = 1;
    base.craftJob = {
      recipeId: 'capsula_recuperacao_simples',
      outputItemId: 'capsula_recuperacao_simples',
      outputQuantity: 1,
      outputKind: 'player_item',
      academicLevelStart: 0,
      startedAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3600_000).toISOString(),
    };

    const out = patchCloudCharacterState(base, {
      accelerateActivity: true,
      materialId: 'liga_metais_leves',
      materialQuantity: 7,
      craftedItemId: 'capsula_recuperacao_simples',
      craftedItemQuantity: 3,
      restoreHealth: true,
    });

    expect(out).not.toBeNull();
    expect(new Date(out!.missionEndsAt!).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(out!.craftJob!.endsAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(out!.materials?.find((m) => m.itemId === 'liga_metais_leves')?.quantity).toBe(7);
    expect(out!.items.consumables.capsula_recuperacao_simples).toBe(3);
    expect(out!.hp).toBeGreaterThan(0);
  });

  test('contratos da UI/admin cobrem aceleração universal e catálogos novos', async () => {
    const panel = await Bun.file(`${import.meta.dir}/../src/components/game/AdminPanel.tsx`).text();
    const actions = await Bun.file(`${import.meta.dir}/../src/lib/game/adminActions.ts`).text();
    const pvp = await Bun.file(`${import.meta.dir}/../src/lib/game/activities.ts`).text();

    expect(panel).toContain('Acelerar atividade');
    expect(panel).toContain("action: 'grant_dragon_ball'");
    expect(panel).toContain("action: 'grant_craft_material'");
    expect(panel).toContain("action: 'grant_crafted_item'");
    expect(panel).toContain('PROFESSION_MATERIALS');
    expect(panel).toContain('CRAFT_STACK_ITEMS');
    expect(panel).toContain('CRAFTED_ITEMS');

    expect(actions).toContain('tx.activity.updateMany');
    expect(actions).toContain('resolveDueActivities(tx, fresh)');
    expect(actions).toContain('tx.craftJob.updateMany');
    expect(actions).toContain('missionEndsAt: readyAt');

    expect(pvp).toContain("kind: 'dragon_ball_stolen'");
    expect(pvp).toContain("kind: 'dragon_ball_lost'");
    expect(pvp.indexOf("kind: 'dragon_ball_stolen'")).toBeGreaterThan(
      pvp.indexOf('if (data.won) {')
    );
  });
});
