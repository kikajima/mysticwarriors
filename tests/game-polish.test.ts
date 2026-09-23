import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { universalThreatWindowEnd, UNIVERSAL_THREAT } from '../src/lib/game/universalThreat';
import { hpRecovery } from '../src/lib/game/regenCountdown';
import { getPowerScale } from '../src/lib/game/powerScale';
import { initialCloudCharacterState, initialPlayerData } from '../src/lib/game/characterInitial';
import { applyPendingMigrations } from '../src/lib/game/persistence';
import { restoreOfflineOpponent, fetchOfflineOpponent, type OfflineOpponent } from '../src/lib/supabase/offline-pvp';
import { actionStartPvp } from '../src/lib/game/actions';
import { resolveDueActivities } from '../src/lib/game/activities';
import { ensureActiveBoss, invokeUniversalThreat } from '../src/lib/worldboss';
import { POST as invokeThreat } from '../src/app/api/admin/universal-threat/route';
import type { PlayerView } from '../src/lib/game/types';

describe('Ameaça Universal — horário de Brasília', () => {
  test('não aparece na sexta-feira, mesmo quando UTC já é sábado', () => {
    expect(universalThreatWindowEnd(new Date('2026-09-19T02:59:59Z'))).toBeNull();
  });
  test('sábado e domingo encerram na segunda à meia-noite local', () => {
    for (const date of ['2026-09-19T03:00:00Z', '2026-09-21T02:59:59Z']) {
      expect(universalThreatWindowEnd(new Date(date))?.toISOString()).toBe('2026-09-21T03:00:00.000Z');
    }
    expect(universalThreatWindowEnd(new Date('2026-09-21T03:00:00Z'))).toBeNull();
  });
  test('invocação permite um dia útil e respeita a expiração exata', () => {
    const until = '2026-09-17T15:00:00Z';
    expect(universalThreatWindowEnd(new Date('2026-09-16T15:00:00Z'), until)?.toISOString()).toBe('2026-09-17T15:00:00.000Z');
    expect(universalThreatWindowEnd(new Date(until), until)).toBeNull();
    expect(universalThreatWindowEnd(new Date('2026-09-16T15:00:00Z'), 'invalid')).toBeNull();
  });
  test('invocação não encurta o fim de semana; Kronar é Transcendente', () => {
    expect(universalThreatWindowEnd(new Date('2026-09-19T03:00:00Z'), '2026-09-20T03:00:00Z')?.toISOString()).toBe('2026-09-21T03:00:00.000Z');
    expect(getPowerScale(UNIVERSAL_THREAT.power).scale.nome).toBe('Transcendente');
  });
  test('invocação administrativa exige autenticação', async () => {
    expect((await invokeThreat(new Request('http://localhost/api/admin/universal-threat', { method: 'POST' }))).status).toBe(404);
  });
});

test('vida: prazo absoluto, bônus racial, atraso de polling e recurso cheio', () => {
  const reference = Date.parse('2026-09-16T12:00:00Z');
  const player = { hp: 90, derived: { maxHp: 100 }, regen: { hpIntervalSec: 12, lastRegenHpAt: new Date(reference).toISOString() } } as PlayerView;
  expect(hpRecovery(player, reference + 5000)).toEqual({ nextMs: 7000, fullMs: 115000 });
  expect(hpRecovery(player, reference + 13000)).toEqual({ nextMs: 0, fullMs: 107000 });
  player.regen.hpIntervalSec = 6;
  expect(hpRecovery(player, reference + 5000)?.fullMs).toBe(55000);
  player.hp = 100;
  expect(hpRecovery(player, reference)).toBeNull();
});

describe('PvP offline e preservação do estado', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mw-polish-'));
  const db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } } });
  const snapshot: OfflineOpponent = {
    user_id: '00000000-0000-4000-8000-000000000123',
    personagens: ['Offline Warrior', 'Sibling Warrior'].map((name, i) => ({
      id: `offline-test-${i}`, nome: name, ativo: i === 0, atualizado_em: new Date().toISOString(),
      estado: initialCloudCharacterState({ id: `offline-test-${i}`, name, race: 'humano' }),
    })),
  };
  beforeAll(async () => { expect(await applyPendingMigrations(db)).toBeGreaterThanOrEqual(0); });
  afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

  test('restaura personagens com a conta original, sem criar sessão', async () => {
    const target = await db.$transaction((tx) => restoreOfflineOpponent(tx, snapshot, 'Offline Warrior'));
    expect(target?.id).toBe('offline-test-0');
    expect(await db.player.count({ where: { accountId: target!.accountId } })).toBe(2);
    expect(await db.session.count()).toBe(0);
    expect((await db.account.findUnique({ where: { id: target!.accountId! } }))?.supabaseUserId).toBe(snapshot.user_id);
  });
  test('um adversário desconectado recebe o duelo e o resultado é aplicado uma vez', async () => {
    const attacker = await db.player.create({ data: {
      ...initialPlayerData(), name: 'Online Attacker', race: 'humano', strength: 999, speed: 999, ki: 999,
    } });
    const result = await db.$transaction((tx) => actionStartPvp(tx, attacker, 'offline-test-0'));
    expect(result.activity).toBeDefined();
    await db.activity.update({ where: { id: result.activity!.id }, data: { endsAt: new Date(0) } });
    await db.$transaction((tx) => resolveDueActivities(tx, attacker));
    const target = await db.player.findUniqueOrThrow({ where: { id: 'offline-test-0' } });
    expect(target.battlesLost).toBe(1);
    expect(target.zeni).toBeLessThan(500);
    expect(await db.session.count()).toBe(0);
    expect(await db.$transaction((tx) => resolveDueActivities(tx, attacker))).toHaveLength(0);
    // A stale cloud snapshot cannot refund the defender or reset losses on another challenge.
    await db.$transaction((tx) => restoreOfflineOpponent(tx, snapshot, 'Offline Warrior'));
    const after = await db.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.zeni).toBe(target.zeni);
    expect(after.battlesLost).toBe(target.battlesLost);
  });
  test('mantém autoataque proibido e permite desafio sem limite de nível', async () => {
    const attacker = await db.player.findUniqueOrThrow({ where: { name: 'Online Attacker' } });
    await expect(db.$transaction((tx) => actionStartPvp(tx, attacker, attacker.id))).rejects.toThrow('si mesmo');
    await db.player.update({ where: { id: 'offline-test-1' }, data: { level: attacker.level + 6 } });
    const result = await db.$transaction((tx) => actionStartPvp(tx, attacker, 'offline-test-1'));
    expect(result.activity).toBeDefined();
  });
  test('snapshots pré-reset não ressuscitam jogadores', async () => {
    await db.gameMeta.create({ data: { key: 'serverResetAt', value: new Date(Date.now() + 60000).toISOString() } });
    await expect(db.$transaction((tx) => restoreOfflineOpponent(tx, snapshot, 'Offline Warrior'))).rejects.toThrow('não está mais disponível');
  });
  test('consulta offline não depende de bearer Supabase do navegador', async () => {
    const source = await Bun.file(path.join(process.cwd(), 'src/lib/supabase/offline-pvp.ts')).text();
    expect(source).toContain('loadServerOfflineOpponent');
    expect(source).not.toContain('SUPABASE_PUBLISHABLE_KEY');
    expect(source).not.toContain('/rest/v1/rpc/pvp_opponent');
    await expect(fetchOfflineOpponent('Offline Warrior')).rejects.toThrow('Guerreiro não encontrado');
  });
  test('consulta normaliza encontro antigo sem perder dano', async () => {
    const until = new Date(Date.now() + 7 * 86400000);
    await db.gameMeta.create({ data: { key: 'universalThreatInvokedUntil', value: until.toISOString() } });
    const old = await db.worldBoss.create({ data: { name: 'Old encounter', emoji: 'X', maxHp: 1000, currentHp: 400, endsAt: new Date(Date.now() + 3600000) } });
    await db.$transaction((tx) => ensureActiveBoss(tx));
    const current = await db.worldBoss.findUniqueOrThrow({ where: { id: old.id } });
    expect(current.name).toBe('Kronar, o Devorador de Mundos');
    expect(current.currentHp).toBe(400);
    expect(current.endsAt.toISOString()).toBe(until.toISOString());
  });
  test('invocar cria encontro com vida cheia e sem dano ou cooldown anterior', async () => {
    const old = await db.worldBoss.findFirstOrThrow({ where: { status: 'active' } });
    await db.worldBossDamage.create({ data: { bossId: old.id, playerId: 'offline-test-0', damage: 442, attacks: 1 } });
    await invokeUniversalThreat(db);
    const fresh = await db.worldBoss.findFirstOrThrow({ where: { status: 'active' }, include: { damages: true } });
    expect(fresh.id).not.toBe(old.id);
    expect(fresh.currentHp).toBe(1_200_000);
    expect(fresh.currentHp).toBe(fresh.maxHp);
    expect(fresh.damages).toHaveLength(0);
    expect((await db.worldBoss.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('expired');
    expect(await db.worldBossDamage.count({ where: { bossId: old.id } })).toBe(1);
    await db.$transaction((tx) => ensureActiveBoss(tx));
    expect((await db.worldBoss.findFirstOrThrow({ where: { status: 'active' } })).id).toBe(fresh.id);
    await invokeUniversalThreat(db);
    expect(await db.worldBoss.count({ where: { status: 'active' } })).toBe(1);
    expect((await db.worldBoss.findFirstOrThrow({ where: { status: 'active' } })).id).not.toBe(fresh.id);
  });
});
