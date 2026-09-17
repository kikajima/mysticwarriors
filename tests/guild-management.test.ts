import { beforeAll, afterAll, test, expect } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyPendingMigrations, splitSqlStatements } from '../src/lib/game/persistence';
import { initialPlayerData } from '../src/lib/game/characterInitial';
import { runGuildOnce } from '../src/lib/game/guilds';
import { guildBonuses, guildThreshold, guildCapacity, GUILD_UPGRADE_COSTS, GUILD_PERMISSIONS, GUILD_BONUS_TABLE } from '../src/lib/game/guildRules';
import { grantRewards, transferZeniPvp } from '../src/lib/economy';
import { applyRegen, buildPlayerCombatant, playerToView } from '../src/lib/game/engine';
import { WIKI_SECTIONS } from '../src/lib/wiki/wiki-content';

const dir = mkdtempSync(path.join(tmpdir(), 'mw-guild-tests-'));
const db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'test.db')}?connection_limit=1` } } });
const ids: string[] = [];
let guildId = '';
beforeAll(async () => {
  await applyPendingMigrations(db);
  for (let i = 0; i < 7; i++) {
    const a = await db.account.create({ data: { username: `QA_Guild_${i}` } });
    const p = await db.player.create({ data: { ...initialPlayerData(), accountId: a.id, name: `QA_Guild_${i}`, race: 'saiyajin', zeni: i === 6 ? 100 : 3_000_000 } });
    ids.push(p.id);
  }
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
const act = (i: number, type: string, args: Record<string, unknown> = {}, requestId = randomUUID()) => db.$transaction(async tx => {
  const player = await tx.player.findUniqueOrThrow({ where: { id: ids[i] }, include: { guild: true } });
  return runGuildOnce(tx, player, type, { ...args, requestId });
});
async function inviteJoin(i: number, inviter = 0) {
  await act(inviter, 'guild_invite', { targetId: ids[i] });
  const invite = await db.guildInvitation.findFirstOrThrow({ where: { playerId: ids[i] } });
  await act(i, 'guild_accept', { inviteId: invite.id });
}
test('fundação atômica e replay: exatamente uma guilda e um débito', async () => {
  await expect(act(6, 'create_guild', { guildName: 'QA_Poor' })).rejects.toThrow();
  expect(await db.guild.count()).toBe(0);
  const request = randomUUID();
  await Promise.all([act(0, 'create_guild', { guildName: 'QA_Collective' }, request), act(0, 'create_guild', { guildName: 'QA_Collective' }, request)]);
  expect(await db.guild.count()).toBe(1);
  const p = await db.player.findUniqueOrThrow({ where: { id: ids[0] } });
  expect(p.zeni).toBe(2_995_000); guildId = p.guildId!;
});
test('convites offline, recusa, expiração e revalidação de vagas no aceite', async () => {
  await expect(act(1, 'join_guild', { targetId: guildId })).rejects.toThrow('convite');
  await act(0, 'guild_invite', { targetId: ids[5] });
  let invite = await db.guildInvitation.findFirstOrThrow({ where: { playerId: ids[5] } });
  await act(5, 'guild_decline', { inviteId: invite.id });
  await act(0, 'guild_invite', { targetId: ids[5] });
  invite = await db.guildInvitation.findFirstOrThrow({ where: { playerId: ids[5] } });
  await db.guildInvitation.update({ where: { id: invite.id }, data: { expiresAt: new Date(0) } });
  await expect(act(5, 'guild_accept', { inviteId: invite.id })).rejects.toThrow('expirou');
  await act(0, 'guild_invite', { targetId: ids[5] });
  for (const i of [1, 2, 3, 4]) await inviteJoin(i);
  await expect(act(5, 'guild_accept', { inviteId: invite.id })).rejects.toThrow('sem vagas');
  expect(await db.player.count({ where: { guildId } })).toBe(5);
});
test('doações simultâneas sobem exatamente um nível; replay e inválidos não debitam', async () => {
  await Promise.all([act(0, 'donate_guild', { amount: 8000 }), act(1, 'donate_guild', { amount: 8000 })]);
  let g = await db.guild.findUniqueOrThrow({ where: { id: guildId } });
  expect(g.level).toBe(2); expect(g.xp).toBe(16000); expect(g.totalDonated).toBe(16000);
  const request = randomUUID();
  await Promise.all([act(1, 'donate_guild', { amount: 1 }, request), act(1, 'donate_guild', { amount: 1 }, request)]);
  for (const amount of [0, -1, 1.5, NaN, 2_000_000]) await expect(act(1, 'donate_guild', { amount })).rejects.toThrow();
  g = await db.guild.findUniqueOrThrow({ where: { id: guildId } }); expect(g.totalDonated).toBe(16001);
});
test('cargos, permissões, hierarquia e gestão offline são autoritativos', async () => {
  await act(0, 'guild_role_save', { roleName: 'Recruta-Mestre', rank: 10, permissions: ['convidar'] });
  const role = await db.guildRole.findFirstOrThrow({ where: { guildId } });
  await act(0, 'guild_assign', { targetId: ids[1], roleId: role.id });
  await act(1, 'guild_invite', { targetId: ids[5] });
  await expect(act(1, 'guild_kick', { targetId: ids[2] })).rejects.toThrow();
  await expect(act(1, 'guild_role_save', { roleName: 'Intruso', rank: 90, permissions: [] })).rejects.toThrow();
  await act(0, 'guild_role_save', { roleId: role.id, roleName: role.name, rank: 10, permissions: ['convidar', 'expulsar', 'promover'] });
  await expect(act(1, 'guild_kick', { targetId: ids[0] })).rejects.toThrow();
  await expect(act(1, 'guild_assign', { targetId: ids[2], roleId: role.id })).rejects.toThrow();
  await act(0, 'guild_assign', { targetId: ids[2], roleId: role.id });
  await expect(act(1, 'guild_kick', { targetId: ids[2] })).rejects.toThrow();
  await act(0, 'guild_role_save', { roleName: 'Superior', rank: 20, permissions: [] });
  const superior = await db.guildRole.findFirstOrThrow({ where: { name: 'Superior' } });
  await act(0, 'guild_assign', { targetId: ids[2], roleId: superior.id });
  await expect(act(1, 'guild_kick', { targetId: ids[2] })).rejects.toThrow();
  await act(0, 'guild_assign', { targetId: ids[2], roleId: null });
  await act(1, 'guild_kick', { targetId: ids[2] });
  expect((await db.player.findUniqueOrThrow({ where: { id: ids[2] } })).guildId).toBeNull();
});
test('bônus são aplicados na concessão real e desaparecem ao expulsar', async () => {
  await db.guild.update({ where: { id: guildId }, data: { level: 10, xp: guildThreshold(10) } });
  const reward = async (i: number, source: string) => db.$transaction(async tx => {
    const p = await tx.player.findUniqueOrThrow({ where: { id: ids[i] }, include: { guild: true } });
    return grantRewards(tx, p, { xp: 100, zeni: 100 }, { type: 'reward', source });
  });
  expect((await reward(1, 'pve')).xpGranted).toBe(110);
  expect((await reward(1, 'mission'))).toMatchObject({ xpGranted: 105, zeniGranted: 105 });
  expect((await reward(1, 'quest')).xpGranted).toBe(100);
  let p = await db.player.findUniqueOrThrow({ where: { id: ids[1] }, include: { guild: true } });
  expect(buildPlayerCombatant(p).guildCritical).toBe(.02);
  const view = playerToView(p);
  expect(view.regen.energyIntervalSec).toBeCloseTo(300 / 1.05);
  expect(view.regen.hpIntervalSec).toBeCloseTo(12 / 1.05);
  p.energy = 0; p.lastRegen = new Date(0); applyRegen(p, 285715); expect(p.energy).toBe(1);
  const transfer = await db.$transaction(tx => transferZeniPvp(tx, { fromPlayerId: ids[1], fromAccountId: p.accountId, toPlayerId: ids[0], toAccountId: null, amount: 100, context: 'pvp_loss' }));
  expect(transfer.amount).toBe(95);
  await act(0, 'guild_kick', { targetId: ids[1] });
  expect((await reward(1, 'pve')).xpGranted).toBe(100);
  p = await db.player.findUniqueOrThrow({ where: { id: ids[1] }, include: { guild: true } });
  expect(buildPlayerCombatant(p).guildCritical).toBe(0);
  expect(playerToView(p).regen.energyIntervalSec).toBe(300);
  await expect(act(0, 'donate_guild', { amount: 1 })).rejects.toThrow('máximo');
  expect(guildBonuses(4).bossDamage).toBe(1.05);
});
test('MOTD sanitizada, transferência explícita, dissolução confirmada e histórico preservado', async () => {
  await act(0, 'guild_motd', { text: '<b>Bem-vindos</b>' });
  await expect(act(0, 'guild_description', { text: 'x'.repeat(501) })).rejects.toThrow();
  expect((await db.guild.findUniqueOrThrow({ where: { id: guildId } })).motd).toBe('Bem-vindos');
  await expect(act(0, 'leave_guild')).rejects.toThrow('Transfira');
  await act(0, 'guild_transfer', { targetId: ids[3], leave: true });
  expect((await db.guild.findUniqueOrThrow({ where: { id: guildId } })).leaderId).toBe(ids[3]);
  await expect(act(3, 'guild_dissolve')).rejects.toThrow('Confirme');
  await act(3, 'guild_dissolve', { confirm: true });
  expect(await db.player.count({ where: { guildId } })).toBe(0);
  expect(await db.guildDonation.count({ where: { guildId } })).toBe(3);
  expect((await db.guild.findUniqueOrThrow({ where: { id: guildId } })).disbandedAt).not.toBeNull();
});
test('contratos fixos: curva, bônus, permissões e wiki sincronizados', () => {
  expect(GUILD_UPGRADE_COSTS).toEqual([8000, 14000, 25000, 45000, 80000, 145000, 260000, 470000, 850000]);
  expect(GUILD_BONUS_TABLE.map(r => [r[0], r[2]])).toEqual([[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,2],[9,5],[10,5]]);
  expect(GUILD_PERMISSIONS).toEqual(['convidar','expulsar','promover','alterar_descricao','mensagem_do_dia']);
  const wiki = JSON.stringify(WIKI_SECTIONS.find(s => s.id === 'guildas'));
  for (const cost of GUILD_UPGRADE_COSTS) expect(wiki).toContain(cost.toLocaleString('pt-BR'));
  for (const permission of GUILD_PERMISSIONS) expect(wiki).toContain(permission);
  for (const [, label] of GUILD_BONUS_TABLE) expect(wiki).toContain(label);
  expect(guildCapacity(1)).toBe(5); expect(guildCapacity(10)).toBe(14);
});
test('migração preserva níveis e doações existentes, inclusive nível acima de 10', async () => {
  const legacy = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'legacy.db')}` } } });
  try {
    await legacy.$executeRawUnsafe('CREATE TABLE Guild (id TEXT PRIMARY KEY, level INTEGER, xp INTEGER, totalDonated INTEGER)');
    await legacy.$executeRawUnsafe('CREATE TABLE Player (id TEXT PRIMARY KEY)');
    for (const level of [1, 2, 5, 10, 12]) await legacy.$executeRawUnsafe('INSERT INTO Guild VALUES (?, ?, ?, ?)', `QA_${level}`, level, 500 * (level - 1) ** 2, 12345);
    const sql = await Bun.file(path.join(process.cwd(), 'prisma/migrations/20260918120000_guild_management/migration.sql')).text();
    for (const statement of splitSqlStatements(sql)) await legacy.$executeRawUnsafe(statement);
    const rows = await legacy.$queryRawUnsafe<Array<{ level: number; xp: number; totalDonated: number }>>('SELECT level, xp, totalDonated FROM Guild ORDER BY level');
    expect(rows.map(r => Number(r.level))).toEqual([1, 2, 5, 10, 12]);
    for (const row of rows) { expect(Number(row.xp)).toBe(guildThreshold(Number(row.level))); expect(Number(row.totalDonated)).toBe(12345); }
  } finally { await legacy.$disconnect(); }
});
