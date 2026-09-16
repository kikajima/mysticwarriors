// =====================================================================
// v0.16 — TESTES ANTI-DRIFT DA MATRIZ DE OCUPAÇÃO + REMOÇÃO DE GÊNERO
// ---------------------------------------------------------------------
// BLINDAGEM ANTI-DESAPARECIMENTO (3ª ordem, item 4): estes testes são
// PERMANENTES e vigiam as 3 decisões registradas em DESIGN-DECISIONS.md:
//   1. criação de personagem SEM campo de gênero (falha se voltar);
//   2. trabalhando → comprar ok · doar ok · coletar ok · atacar boss ok ·
//      atacar jogador ok · curar ok · desejar ok;
//      trabalhando → treinar NEGADO · PvE NEGADO · torneio NEGADO;
//   3. em luta (atividade) → coletar ok (coleta NUNCA espera ocupação).
//
// A história: a 1ª implementação (v0.11) morreu no rollback de plataforma
// de 15/set sem commit — esta suíte existe para que NENHUM futuro
// rollback/refactor silencioso desfaça as decisões.
// =====================================================================

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient, type Player } from '@prisma/client';
import { applyPendingMigrations } from '../src/lib/game/persistence';
import {
  assertPlayerAvailableForAction,
  MISSION_BLOCKED_ACTIONS,
  ACTIVITY_BLOCKED_ACTIONS,
} from '../src/lib/game/rules';
import { assertNoRunningActivityTx } from '../src/lib/game/activities';
import { playerToView } from '../src/lib/game/engine';
import { initialPlayerData } from '../src/lib/game/characterInitial';
import { ApiError } from '../src/lib/api';

// ===== fixture =====

function missionPlayer(overrides: Partial<Player> = {}): Player {
  return {
    ...(initialPlayerData() as unknown as Player),
    id: 'pl_matrix_1',
    name: 'Matriz QA',
    race: 'saiyajin',
    accountId: null,
    guildId: null,
    lastRegen: new Date(),
    lastRegenHp: new Date(),
    // TRABALHANDO: timer correndo por mais uma hora
    missionId: 'agricultor',
    missionEndsAt: new Date(Date.now() + 60 * 60_000),
    ...overrides,
  };
}

function freePlayer(overrides: Partial<Player> = {}): Player {
  return missionPlayer({ missionId: null, missionEndsAt: null, ...overrides });
}

async function makeTempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gm-occ-matrix-'));
  const client = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'custom.db')}` } } });
  await applyPendingMigrations(client);
  return { client, dir };
}

/** Executa fn esperando ApiError com o código dado (falha se NÃO lançar). */
async function expectApiError(code: ApiError['code'], fn: () => Promise<unknown> | unknown) {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ApiError);
  expect((caught as ApiError).code).toBe(code);
}

// =====================================================================
// DECISÃO 1 — criação de personagem SEM campo de gênero
// =====================================================================

describe('v0.16 anti-drift — GÊNERO REMOVIDO DA CRIAÇÃO (decisão permanente)', () => {
  test('rota de criação não valida/aceita/envia gênero (contrato da rota)', async () => {
    const src = await Bun.file(`${import.meta.dir}/../src/app/api/game/create/route.ts`).text();
    expect(src).not.toContain('gender');
    expect(src).not.toContain('GENDER');
  });

  test('schema Prisma não tem coluna gender (contrato do schema)', async () => {
    const schema = await Bun.file(`${import.meta.dir}/../prisma/schema.prisma`).text();
    expect(schema).not.toMatch(/^\s*gender\s+String/m);
  });

  test('PlayerView NÃO expõe gênero (runtime — falha se o campo voltar)', () => {
    const view = playerToView(missionPlayer());
    expect(view).not.toHaveProperty('gender');
  });

  test('estado inicial de criação não carrega gênero', () => {
    const data = initialPlayerData();
    expect(data).not.toHaveProperty('gender');
  });

  test('integração: player nasce no banco SEM gênero (cadeia real de migrations)', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const created = await client.player.create({
        data: { name: 'QA Sem Genero', race: 'majin', level: 2 },
      });
      // coluna morta: SELECT cru não devolve gender
      const row = (await client.$queryRawUnsafe(`SELECT * FROM Player WHERE id = '${created.id}'`)) as Array<Record<string, unknown>>;
      expect(row[0]).not.toHaveProperty('gender');
      // e a view também não
      const fresh = await client.player.findUniqueOrThrow({ where: { id: created.id } });
      expect(playerToView(fresh)).not.toHaveProperty('gender');
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('analytics não tem evento gender_set (contrato de eventos)', async () => {
    const src = await Bun.file(`${import.meta.dir}/../src/lib/analytics.ts`).text();
    expect(src).not.toContain('gender_set');
  });
});

// =====================================================================
// DECISÃO 2+3 — matriz de ocupação: TRABALHANDO bloqueia EXATAMENTE 2
// =====================================================================

describe('v0.16 anti-drift — TRABALHANDO: tudo liberado EXCETO os 2 negados', () => {
  const working = missionPlayer();

  test('trabalhando → comprar ok · vender ok · usar ok · equipar ok', () => {
    expect(() => assertPlayerAvailableForAction(working, 'buy')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'sell')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'use_item')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'equip')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'unequip')).not.toThrow();
  });

  test('trabalhando → doar na guilda ok · fundar/entrar/sair ok', () => {
    expect(() => assertPlayerAvailableForAction(working, 'donate_guild')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'create_guild')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'join_guild')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'leave_guild')).not.toThrow();
  });

  test('trabalhando → coletar ok (conquista · quest · missão · qualquer claim)', () => {
    expect(() => assertPlayerAvailableForAction(working, 'claim_achievement')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'claim_quest')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'claim_mission')).not.toThrow();
    // nenhum claim* pode voltar aos sets de bloqueio
    for (const claim of ['claim_achievement', 'claim_quest', 'claim_mission']) {
      expect(MISSION_BLOCKED_ACTIONS.has(claim)).toBe(false);
      expect(ACTIVITY_BLOCKED_ACTIONS.has(claim)).toBe(false);
    }
  });

  test('trabalhando → atacar Chefe Global ok · atacar jogador (PvP) ok', () => {
    expect(() => assertPlayerAvailableForAction(working, 'world_boss_attack')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'attack_player')).not.toThrow();
  });

  test('trabalhando → hospital ok · Shenron ok · perfil ok · cosméticos/talentos ok', () => {
    expect(() => assertPlayerAvailableForAction(working, 'heal')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'wish')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'select_player')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'buy_cosmetic')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'buy_talent')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(working, 'set_strategy')).not.toThrow();
  });

  test('trabalhando → treino permitido', () => {
    expect(() => assertPlayerAvailableForAction(working, 'train')).not.toThrow();
  });

  test('trabalhando → PvE NEGADO · torneio NEGADO', async () => {
    await expectApiError('PLAYER_BUSY_ON_MISSION', () => assertPlayerAvailableForAction(working, 'battle'));
    await expectApiError('PLAYER_BUSY_ON_MISSION', () => assertPlayerAvailableForAction(working, 'tournament_fight'));
  });

  test('matriz FECHADA: blocklist tem EXATAMENTE battle/tournament_fight', () => {
    expect([...MISSION_BLOCKED_ACTIONS].sort()).toEqual(['battle', 'tournament_fight']);
  });

  test('LIVRE: as ações passam quando não há trabalho ativo', () => {
    const free = freePlayer();
    expect(() => assertPlayerAvailableForAction(free, 'train')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(free, 'battle')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(free, 'tournament_fight')).not.toThrow();
  });

  test('trabalho CONCLUÍDO (timer expirado) NÃO bloqueia mais nada', () => {
    const done = missionPlayer({ missionEndsAt: new Date(Date.now() - 60_000) });
    expect(() => assertPlayerAvailableForAction(done, 'train')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(done, 'battle')).not.toThrow();
    expect(() => assertPlayerAvailableForAction(done, 'tournament_fight')).not.toThrow();
  });
});

// =====================================================================
// DECISÃO 2 — EM LUTA (atividade com duração): coleta segue liberada
// =====================================================================

describe('v0.16 anti-drift — EM LUTA: coleta NUNCA espera ocupação', () => {
  test('integração: atividade de batalha correndo → claim_achievement/claim_quest/claim_mission PASSAM; battle/trem NEGADOS', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const account = await client.account.create({ data: {} });
      const player = await client.player.create({
        data: { name: 'QA Em Luta', race: 'androide', accountId: account.id },
      });
      // atividade de BATALHA em andamento (replay de 30s)
      await client.activity.create({
        data: {
          playerId: player.id,
          kind: 'battle',
          startedAt: new Date(),
          endsAt: new Date(Date.now() + 30_000),
          payload: JSON.stringify({ kind: 'battle', enemyId: 'saibaman' }),
          result: JSON.stringify({ kind: 'battle', display: null, result: { message: 'luta', levelsGained: 0 } }),
        },
      });

      // coletas PASSAM com luta em andamento (regra da 3ª ordem)
      await client.$transaction(async (tx) => {
        await expect(assertNoRunningActivityTx(tx, player.id, 'claim_achievement')).resolves.toBeUndefined();
        await expect(assertNoRunningActivityTx(tx, player.id, 'claim_quest')).resolves.toBeUndefined();
        await expect(assertNoRunningActivityTx(tx, player.id, 'claim_mission')).resolves.toBeUndefined();
        // loja/hospital/guilda/perfil também passam (matriz)
        await expect(assertNoRunningActivityTx(tx, player.id, 'buy')).resolves.toBeUndefined();
        await expect(assertNoRunningActivityTx(tx, player.id, 'heal')).resolves.toBeUndefined();
        await expect(assertNoRunningActivityTx(tx, player.id, 'donate_guild')).resolves.toBeUndefined();
        await expect(assertNoRunningActivityTx(tx, player.id, 'select_player')).resolves.toBeUndefined();
      });

      // as ações de luta/treino/trabalho/torneio são negadas (uma por vez)
      await client.$transaction(async (tx) => {
        await expectApiError('ACTIVITY_IN_PROGRESS', () => assertNoRunningActivityTx(tx, player.id, 'battle'));
        await expectApiError('ACTIVITY_IN_PROGRESS', () => assertNoRunningActivityTx(tx, player.id, 'train'));
        await expectApiError('ACTIVITY_IN_PROGRESS', () => assertNoRunningActivityTx(tx, player.id, 'attack_player'));
        await expectApiError('ACTIVITY_IN_PROGRESS', () => assertNoRunningActivityTx(tx, player.id, 'mission'));
        await expectApiError('ACTIVITY_IN_PROGRESS', () => assertNoRunningActivityTx(tx, player.id, 'tournament_fight'));
      });
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =====================================================================
// REGRA PERMANENTE — vítima/alvo JAMAIS é bloqueado por estado
// =====================================================================

describe('v0.16 anti-drift — PvP: o ALVO nunca é protegido por estado', () => {
  test('actionStartPvp não consulta estado do alvo (contrato de código)', async () => {
    const src = await Bun.file(`${import.meta.dir}/../src/lib/game/actions.ts`).text();
    const fn = src.slice(src.indexOf('async function actionStartPvp'));
    const body = fn.slice(0, fn.indexOf('async function') > 0 ? fn.indexOf('\nasync function', 1) : undefined);
    // nenhum isOnActiveMission/getRunningActivity sobre o TARGET
    expect(body).not.toContain('target.missionId');
    expect(body).not.toContain('PVP_TARGET_BUSY');
  });
});
