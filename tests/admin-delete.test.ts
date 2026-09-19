import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { applyPendingMigrations } from '../src/lib/game/persistence';
import {
  deleteCharacterAdmin,
  deleteGuildAdmin,
  listGuildsForAdmin,
  listAuditLogs,
  type AdminCloudBackend,
} from '../src/lib/game/adminErasure';
import { countOrphans, summarizeOrphans } from '../src/lib/game/orphanCheck';
import { ApiError } from '../src/lib/api';

// =====================================================================
// v0.14 · v0.15 — EXCLUSÕES DESTRUTIVAS DO PAINEL ADMIN (herméticos)
// ---------------------------------------------------------------------
// Banco TEMPORÁRIO + cadeia REAL de migrations + backend de nuvem FAKE
// (DI). Prova AS DUAS CAMADAS e TODAS as proteções:
//  * erasure de personagem (cascade + ledger + doações do jogador);
//  * erasure de guilda (membros intactos + doações LIMPAS NA MÃO —
//    GuildDonation.guildId NÃO tem FK nesta base; a matriz vigia);
//  * auto-dissolução quando o alvo é LÍDER (+ aviso prévio na UI);
//  * proteções: bot · próprio personagem do admin · nome digitado
//    errado (v0.15: a proteção "guilda/líder de sistema" foi REMOVIDA
//    — guilda de sistema não existe mais, decisão do dono);
//  * v0.15: alvo só-NUVEM limpa a conta auth local ÓRFÃ (inerte);
//    listagem da nuvem indisponível → diagnóstico claro + audit failed;
//    alvo inexistente → audit failed (falha visível);
//  * ordem das camadas: nuvem primeiro — falha na nuvem = NADA morre;
//    falha local pós-nuvem = 'partial' reportado alto;
//  * auditoria: toda tentativa (ok/partial/failed/blocked) registrada;
//  * matriz anti-órfã pós-operação (inclui check LÓGICO de doações).
// =====================================================================

// Esta suíte cria bancos temporários e reaplica a cadeia completa de migrations.
// Em runners compartilhados do GitHub, 5 s é apertado e gerava flakes exatos
// em 5000 ms. Mantemos uma margem explícita apenas neste arquivo pesado.
setDefaultTimeout(15_000);

const ADMIN_EMAIL = 'alicomprasbbbb@gmail.com';
const ADMIN_UUID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_UUID = '00000000-0000-0000-0000-0000000000bb';

/** Backend de nuvem fake — registra chamadas para as asserções. */
function makeFakeCloud(opts?: {
  probe?: 'ready' | 'missing' | 'unreachable' | 'error';
  deleteOk?: boolean;
  /** false = a LISTAGEM da nuvem falha (RPC admin_list_personagens fora do ar). */
  listOk?: boolean;
  rows?: Array<{
    id: string;
    user_id: string;
    email: string | null;
    nick: string | null;
    nome: string;
    raca: string;
    nivel: number;
    poder: number;
    vitorias: number;
    derrotas: number;
    ativo: boolean;
    estado: unknown;
    criado_em: string | null;
  }>;
}) {
  const calls: { probe: number; delete: Array<{ id: string; name: string }> } = { probe: 0, delete: [] };
  const backend: AdminCloudBackend = {
    probe: async () => {
      calls.probe++;
      return opts?.probe ?? 'ready';
    },
    deleteCharacter: async (_token, id, name) => {
      calls.delete.push({ id, name });
      if (opts?.deleteOk === false) return { ok: false, error: 'HTTP 500 — simulado' };
      return { ok: true, report: { ok: true, personagens_apagados: 1, backup_personagens: 1 } };
    },
    listCharacters: async () => {
      if (opts?.listOk === false) return null;
      return opts?.rows ?? [];
    },
  };
  return { backend, calls };
}

async function makeTempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gm-admin-del-'));
  const client = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'custom.db')}` } } });
  const applied = await applyPendingMigrations(client);
  expect(applied).toBeGreaterThanOrEqual(1);
  return { client, dir };
}

/** Mundo de QA: contas, guilda com líder+membro+doações, vida completa. */
async function seedWorld(client: PrismaClient) {
  const adminAccount = await client.account.create({
    data: { username: 'qa_admin', usernameLower: 'qa_admin', supabaseUserId: ADMIN_UUID },
  });
  const ownerAccount = await client.account.create({
    data: { username: 'qa_owner', usernameLower: 'qa_owner', supabaseUserId: OTHER_UUID },
  });
  const lonerAccount = await client.account.create({ data: { username: 'qa_loner', usernameLower: 'qa_loner' } });

  const guild = await client.guild.create({
    data: { name: 'QA Guilda Alvo', description: 'QA', leaderId: 'pending', level: 3, totalDonated: 1500 },
  });
  const leader = await client.player.create({
    data: {
      name: 'QA Líder Alvo', race: 'saiyajin', accountId: ownerAccount.id, guildId: guild.id,
      level: 12, zeni: 900, guildDonated: 1000,
    },
  });
  const member = await client.player.create({
    data: { name: 'QA Membro', race: 'humano', accountId: ownerAccount.id, guildId: guild.id, level: 5 },
  });
  const loner = await client.player.create({
    data: { name: 'QA Solitário', race: 'namekuseijin', accountId: lonerAccount.id, level: 3 },
  });
  const adminPlayer = await client.player.create({
    data: { name: 'QA Char do Admin', race: 'androide', accountId: adminAccount.id, level: 2 },
  });
  await client.account.update({ where: { id: ownerAccount.id }, data: { activePlayerId: leader.id } });
  await client.guild.update({ where: { id: guild.id }, data: { leaderId: leader.id } });
  const bot = await client.player.create({
    data: { name: 'QA Bot', race: 'majin', isBot: true, level: 9 },
  });
  // v0.15 — SEM guilda de sistema no mundo de QA (decisão do dono:
  // o mundo começa com ZERO guildas; o mecanismo foi extinto).

  // vida completa do líder (todas as tabelas com FK no player)
  await client.session.create({
    data: { token: 'qa-tok-1', accountId: ownerAccount.id, expiresAt: new Date(Date.now() + 3600_000) },
  });
  await client.walletTransaction.create({
    data: { playerId: leader.id, accountId: ownerAccount.id, currency: 'zeni', amount: 100, type: 'earn', source: 'battle', balanceBefore: 0, balanceAfter: 100 },
  });
  await client.questProgress.create({ data: { playerId: leader.id, questId: 'daily_battle_1', kind: 'daily', period: '2026-09-15', target: 3 } });
  await client.achievementState.create({ data: { playerId: leader.id, achievementId: 'first_blood', progress: 1 } });
  const season = await client.season.create({ data: { name: 'Temporada QA', number: 1, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86400_000) } });
  await client.seasonRankEntry.create({ data: { seasonId: season.id, playerId: leader.id, points: 10, wins: 1 } });
  await client.requestDedup.create({ data: { playerId: leader.id, requestId: 'req-qa-1' } });
  await client.activity.create({ data: { playerId: leader.id, kind: 'train', endsAt: new Date(Date.now() + 60_000) } });
  // doações: do líder e do membro para a guilda
  await client.guildDonation.create({ data: { playerId: leader.id, guildId: guild.id, amount: 1000 } });
  await client.guildDonation.create({ data: { playerId: member.id, guildId: guild.id, amount: 500 } });

  return { adminAccount, ownerAccount, lonerAccount, guild, leader, member, loner, adminPlayer, bot, season };
}

async function expectCleanMatrix(client: PrismaClient) {
  const summary = summarizeOrphans(await countOrphans(client));
  if (!summary.clean) throw new Error(`matriz suja: ${summary.detail}`);
  return summary;
}

async function expectApiError(fn: () => Promise<unknown>, fragment: string) {
  let threw: unknown;
  try {
    await fn();
  } catch (err) {
    threw = err;
  }
  expect(threw).toBeInstanceOf(ApiError);
  const message = (threw as ApiError).message ?? '';
  expect(message.toLowerCase()).toContain(fragment.toLowerCase());
}

// =====================================================================
// EXCLUSÃO DE PERSONAGEM
// =====================================================================

describe('admin delete character — erasure nas duas camadas', () => {
  test('membro comum: cascade completo + nuvem + auditoria ok', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const { backend, calls } = makeFakeCloud();
      const report = await deleteCharacterAdmin({
        characterId: world.member.id,
        ownerId: OTHER_UUID,
        confirmName: 'QA Membro',
        adminEmail: ADMIN_EMAIL,
        adminSupabaseUserId: ADMIN_UUID,
        accessToken: 'tok',
        cloud: backend,
        client,
      });

      expect(report.status).toBe('ok');
      expect(report.layers).toEqual({ local: 'ok', cloud: 'ok' });
      expect(report.orphanCheck.clean).toBe(true);
      // nuvem foi chamada com id + nome digitado (validação na ponta)
      expect(calls.delete).toEqual([{ id: world.member.id, name: 'QA Membro' }]);
      // membro sumiu; doação DELE caiu com o player (FK Cascade playerId)
      expect(await client.player.findUnique({ where: { id: world.member.id } })).toBeNull();
      expect(await client.guildDonation.count({ where: { playerId: world.member.id } })).toBe(0);
      // a guilda SEGUE VIVA (líder intacto) — só perdeu o membro
      expect(await client.guild.findUnique({ where: { id: world.guild.id } })).not.toBeNull();
      // auditoria: UMA linha, ok, camadas corretas
      const logs = await listAuditLogs(10, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].result).toBe('ok');
      expect(logs[0].action).toBe('delete_character');
      expect(logs[0].targetName).toBe('QA Membro');
      expect(logs[0].adminEmail).toBe(ADMIN_EMAIL);
      expect(logs[0].layers).toEqual({ local: 'ok', cloud: 'ok' });
      await expectCleanMatrix(client);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('LÍDER de guilda: AUTO-DISSOLUÇÃO com erasure total (doações na mão) + 2 linhas de auditoria', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const { backend } = makeFakeCloud();
      const report = await deleteCharacterAdmin({
        characterId: world.leader.id,
        ownerId: OTHER_UUID,
        confirmName: 'QA Líder Alvo',
        adminEmail: ADMIN_EMAIL,
        adminSupabaseUserId: ADMIN_UUID,
        accessToken: 'tok',
        cloud: backend,
        client,
      });

      expect(report.status).toBe('ok');
      expect(report.guildDissolved).toEqual({ name: 'QA Guilda Alvo', members: 2 });
      // líder morto + TODA a sua vida (cascade)
      expect(await client.player.findUnique({ where: { id: world.leader.id } })).toBeNull();
      expect(await client.activity.count({ where: { playerId: world.leader.id } })).toBe(0);
      expect(await client.walletTransaction.count({ where: { playerId: world.leader.id } })).toBe(0);
      expect(await client.questProgress.count({ where: { playerId: world.leader.id } })).toBe(0);
      expect(await client.achievementState.count({ where: { playerId: world.leader.id } })).toBe(0);
      expect(await client.seasonRankEntry.count({ where: { playerId: world.leader.id } })).toBe(0);
      expect(await client.requestDedup.count({ where: { playerId: world.leader.id } })).toBe(0);
      // activePlayerId da conta dona NÃO ficou apontando para um morto
      const owner = await client.account.findUnique({ where: { id: world.ownerAccount.id } });
      expect(owner?.activePlayerId).toBeNull();
      // a guilda morreu JUNTO (erasure) — e as doações DELA foram limpas
      // NA MÃO (guildId não tem FK nesta base)
      expect(await client.guild.findUnique({ where: { id: world.guild.id } })).toBeNull();
      expect(await client.guildDonation.count({ where: { guildId: world.guild.id } })).toBe(0);
      // ex-membro: SEM guilda, ÍNTEGRO (conta, nome, nível)
      const member = await client.player.findUniqueOrThrow({ where: { id: world.member.id } });
      expect(member.guildId).toBeNull();
      expect(member.level).toBe(5);
      // nome da guilda LIBERADO (unique livre)
      expect(await client.guild.findUnique({ where: { name: 'QA Guilda Alvo' } })).toBeNull();
      // DUAS linhas de auditoria: personagem + guilda (gatilho = exclusão do líder)
      const logs = await listAuditLogs(10, client);
      expect(logs).toHaveLength(2);
      expect(logs[0].action).toBe('delete_guild');
      expect(logs[0].targetName).toBe('QA Guilda Alvo');
      expect(logs[0].layers).toEqual({ local: 'ok', cloud: 'not-mirrored' });
      expect(JSON.parse(logs[0].details ?? '{}').triggeredBy).toContain('QA Líder Alvo');
      expect(logs[1].action).toBe('delete_character');
      expect(logs[1].targetName).toBe('QA Líder Alvo');
      await expectCleanMatrix(client);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('personagem só-NUVEM: local skipped, nuvem ok + conta auth local ÓRFÃ limpa (v0.15)', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      // conta auth local ÓRFÃ do dono da nuvem: SEM personagens locais e
      // SEM ledger — linha inerte que a exclusão deve levar junto
      const ghostUuid = '00000000-0000-0000-0000-0000000000cc';
      const ghostAccount = await client.account.create({
        data: { username: 'qa_ghost_owner', usernameLower: 'qa_ghost_owner', supabaseUserId: ghostUuid },
      });
      await client.session.create({
        data: { token: 'qa-tok-ghost', accountId: ghostAccount.id, expiresAt: new Date(Date.now() + 3600_000) },
      });
      const { backend } = makeFakeCloud({
        rows: [{ id: 'cloud-only-1', user_id: ghostUuid, email: 'ghost@example.com', nick: 'ghost', nome: 'QA Só Nuvem', raca: 'majin', nivel: 7, poder: 700, vitorias: 0, derrotas: 0, ativo: true, estado: {}, criado_em: new Date().toISOString() }],
      });
      const report = await deleteCharacterAdmin({
        characterId: 'cloud-only-1',
        ownerId: ghostUuid,
        confirmName: 'QA Só Nuvem',
        adminEmail: ADMIN_EMAIL,
        adminSupabaseUserId: ADMIN_UUID,
        accessToken: 'tok',
        cloud: backend,
        client,
      });
      expect(report.status).toBe('ok');
      expect(report.layers).toEqual({ local: 'skipped', cloud: 'ok' });
      expect(report.message).toContain('apenas na nuvem');
      // a conta auth local órfã (inerte: 0 personagens, 0 ledger) sumiu
      // JUNTO — sessão dela caiu pelo FK Cascade de Session.accountId
      expect(await client.account.findUnique({ where: { id: ghostAccount.id } })).toBeNull();
      expect(await client.session.count({ where: { accountId: ghostAccount.id } })).toBe(0);
      // as OUTRAS contas permanecem intactas
      expect(await client.account.findUnique({ where: { id: world.ownerAccount.id } })).not.toBeNull();
      expect(await client.account.findUnique({ where: { id: world.adminAccount.id } })).not.toBeNull();
      const logs = await listAuditLogs(10, client);
      expect(logs[0].layers).toEqual({ local: 'skipped', cloud: 'ok' });
      expect(JSON.parse(logs[0].details ?? '{}').contaAuthLocal).toContain('limpa');
      await expectCleanMatrix(client);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('personagem só-NUVEM de dono com HISTÓRICO local: conta auth MANTIDA (ledger é accountability)', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      // conta local do dono com transações de carteira (histórico real):
      // mesmo sem personagens locais, o ledger preserva a linha
      const ledgerUuid = '00000000-0000-0000-0000-0000000000dd';
      const ledgerAccount = await client.account.create({
        data: { username: 'qa_ledger_owner', usernameLower: 'qa_ledger_owner', supabaseUserId: ledgerUuid },
      });
      await client.walletTransaction.create({
        data: { playerId: world.leader.id, accountId: ledgerAccount.id, currency: 'zeni', amount: 50, type: 'earn', source: 'battle', balanceBefore: 0, balanceAfter: 50 },
      });
      const { backend } = makeFakeCloud({
        rows: [{ id: 'cloud-only-2', user_id: ledgerUuid, email: 'ledger@example.com', nick: null, nome: 'QA Nuvem Com Ledger', raca: 'humano', nivel: 4, poder: 400, vitorias: 1, derrotas: 0, ativo: true, estado: {}, criado_em: new Date().toISOString() }],
      });
      const report = await deleteCharacterAdmin({
        characterId: 'cloud-only-2',
        ownerId: ledgerUuid,
        confirmName: 'QA Nuvem Com Ledger',
        adminEmail: ADMIN_EMAIL,
        adminSupabaseUserId: ADMIN_UUID,
        accessToken: 'tok',
        cloud: backend,
        client,
      });
      expect(report.status).toBe('ok');
      expect(report.message).toContain('mantida');
      expect(await client.account.findUnique({ where: { id: ledgerAccount.id } })).not.toBeNull();
      expect(await client.walletTransaction.count({ where: { accountId: ledgerAccount.id } })).toBe(1);
      const logs = await listAuditLogs(10, client);
      expect(JSON.parse(logs[0].details ?? '{}').contaAuthLocal).toContain('mantida');
      await expectCleanMatrix(client);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('v0.15 — alvo INEXISTENTE (nem local nem nuvem): audit failed + mensagem clara (falha visível)', async () => {
    const { client, dir } = await makeTempDb();
    try {
      await seedWorld(client);
      const { backend } = makeFakeCloud({ rows: [] });
      await expectApiError(
        () => deleteCharacterAdmin({
          characterId: 'id-que-nao-existe', ownerId: null, confirmName: 'Alguém',
          adminEmail: ADMIN_EMAIL, adminSupabaseUserId: ADMIN_UUID, accessToken: 'tok', cloud: backend, client,
        }),
        'não encontrado no servidor nem na nuvem'
      );
      // a TENTATIVA FALHA foi registrada (com motivo) — falha invisível
      // é como bug de exclusão vira mistério
      const logs = await listAuditLogs(10, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].result).toBe('failed');
      expect(JSON.parse(logs[0].details ?? '{}').motivo).toContain('não encontrado no servidor nem na nuvem');
      expect(logs[0].layers).toEqual({ local: 'na', cloud: 'na' });
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('v0.15 — LISTAGEM da nuvem indisponível: aborta com diagnóstico claro (não dá para afirmar que só é local)', async () => {
    const { client, dir } = await makeTempDb();
    try {
      await seedWorld(client);
      const { backend } = makeFakeCloud({ listOk: false });
      // id que NÃO existe localmente: sem a listagem da nuvem, a exclusão
      // NÃO pode afirmar "não existe" — aborta com o motivo na mensagem
      await expectApiError(
        () => deleteCharacterAdmin({
          characterId: 'talvez-so-nuvem', ownerId: null, confirmName: 'Alguém',
          adminEmail: ADMIN_EMAIL, adminSupabaseUserId: ADMIN_UUID, accessToken: 'tok', cloud: backend, client,
        }),
        'consultar a nuvem'
      );
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('failed');
      expect(logs[0].layers).toEqual({ local: 'na', cloud: 'unreachable' });
      expect(JSON.parse(logs[0].details ?? '{}').motivo).toContain('admin_list_personagens');
      // nada morreu
      expect(await client.player.count({ where: { isBot: false } })).toBeGreaterThan(0);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =====================================================================
// ORDEM DAS CAMADAS — nuvem primeiro, modos de falha
// =====================================================================

describe('admin delete character — modos de falha (nuvem primeiro)', () => {
  test('RPC de nuvem AUSENTE → precondition, NADA morre, audit failed', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const { backend } = makeFakeCloud({ probe: 'missing' });
      const report = await deleteCharacterAdmin({
        characterId: world.leader.id,
        ownerId: OTHER_UUID,
        confirmName: 'QA Líder Alvo',
        adminEmail: ADMIN_EMAIL,
        adminSupabaseUserId: ADMIN_UUID,
        accessToken: 'tok',
        cloud: backend,
        client,
      });
      expect(report.status).toBe('precondition');
      expect(report.message).toContain('NADA foi apagado');
      // personagem E guilda intocados
      expect(await client.player.findUnique({ where: { id: world.leader.id } })).not.toBeNull();
      expect(await client.guild.findUnique({ where: { id: world.guild.id } })).not.toBeNull();
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('failed');
      expect(logs[0].layers).toEqual({ local: 'na', cloud: 'failed' });
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('nuvem FALHA no delete → NADA morre localmente, audit failed', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const { backend } = makeFakeCloud({ deleteOk: false });
      const report = await deleteCharacterAdmin({
        characterId: world.member.id,
        ownerId: OTHER_UUID,
        confirmName: 'QA Membro',
        adminEmail: ADMIN_EMAIL,
        adminSupabaseUserId: ADMIN_UUID,
        accessToken: 'tok',
        cloud: backend,
        client,
      });
      expect(report.status).toBe('failed');
      expect(await client.player.findUnique({ where: { id: world.member.id } })).not.toBeNull();
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('failed');
      expect(logs[0].layers).toEqual({ local: 'skipped', cloud: 'failed' });
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('nuvem OK + local FALHA → partial reportado ALTO (nunca silêncio)', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const { backend } = makeFakeCloud();
      // sabotar a transação local DEPOIS da nuvem
      (client as unknown as { $transaction: unknown }).$transaction = async () => {
        throw new Error('boom-local-simulado');
      };
      const report = await deleteCharacterAdmin({
        characterId: world.member.id,
        ownerId: OTHER_UUID,
        confirmName: 'QA Membro',
        adminEmail: ADMIN_EMAIL,
        adminSupabaseUserId: ADMIN_UUID,
        accessToken: 'tok',
        cloud: backend,
        client,
      });
      expect(report.status).toBe('partial');
      expect(report.message).toContain('EXCLUSÃO PARCIAL');
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('partial');
      expect(logs[0].layers).toEqual({ local: 'failed', cloud: 'ok' });
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =====================================================================
// PROTEÇÕES (todas auditadas como 'blocked')
// =====================================================================

describe('admin delete character — proteções', () => {
  test('BOT não é excluível', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const { backend } = makeFakeCloud();
      await expectApiError(
        () => deleteCharacterAdmin({
          characterId: world.bot.id, ownerId: null, confirmName: 'QA Bot',
          adminEmail: ADMIN_EMAIL, adminSupabaseUserId: ADMIN_UUID, accessToken: 'tok', cloud: backend, client,
        }),
        'BOT'
      );
      expect(await client.player.findUnique({ where: { id: world.bot.id } })).not.toBeNull();
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('blocked');
      expect(logs[0].layers).toEqual({ local: 'na', cloud: 'na' });
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('PRÓPRIO personagem do admin não é excluível', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const { backend } = makeFakeCloud();
      await expectApiError(
        () => deleteCharacterAdmin({
          characterId: world.adminPlayer.id, ownerId: ADMIN_UUID, confirmName: 'QA Char do Admin',
          adminEmail: ADMIN_EMAIL, adminSupabaseUserId: ADMIN_UUID, accessToken: 'tok', cloud: backend, client,
        }),
        'SEU personagem'
      );
      expect(await client.player.findUnique({ where: { id: world.adminPlayer.id } })).not.toBeNull();
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('blocked');
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('nome digitado errado → recusa auditada', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const { backend } = makeFakeCloud();
      await expectApiError(
        () => deleteCharacterAdmin({
          characterId: world.member.id, ownerId: OTHER_UUID, confirmName: 'QA Membro ERRADO',
          adminEmail: ADMIN_EMAIL, adminSupabaseUserId: ADMIN_UUID, accessToken: 'tok', cloud: backend, client,
        }),
        'não confere'
      );
      expect(await client.player.findUnique({ where: { id: world.member.id } })).not.toBeNull();
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('blocked');
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =====================================================================
// EXCLUSÃO DE GUILDA
// =====================================================================

describe('admin delete guild — erasure total', () => {
  test('guilda com membros e doações: tudo guild-scoped morre, ex-membros íntegros, nome livre', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const report = await deleteGuildAdmin({
        guildId: world.guild.id,
        confirmName: 'QA Guilda Alvo',
        adminEmail: ADMIN_EMAIL,
        client,
      });
      expect(report.status).toBe('ok');
      expect(report.layers).toEqual({ local: 'ok', cloud: 'not-mirrored' });
      // guilda + doações dela: MORTAS (limpeza manual — sem FK de guildId)
      expect(await client.guild.findUnique({ where: { id: world.guild.id } })).toBeNull();
      expect(await client.guildDonation.count({ where: { guildId: world.guild.id } })).toBe(0);
      // ex-membros: SEM guilda, ÍNTEGROS
      const leader = await client.player.findUniqueOrThrow({ where: { id: world.leader.id } });
      const member = await client.player.findUniqueOrThrow({ where: { id: world.member.id } });
      expect(leader.guildId).toBeNull();
      expect(member.guildId).toBeNull();
      expect(leader.name).toBe('QA Líder Alvo');
      expect(member.level).toBe(5);
      // nome liberado
      expect(await client.guild.findUnique({ where: { name: 'QA Guilda Alvo' } })).toBeNull();
      // auditoria com inventário
      const logs = await listAuditLogs(10, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('delete_guild');
      const details = JSON.parse(logs[0].details ?? '{}');
      expect(details.totalDonated).toBe(1500);
      expect(details.registrosDeDoacao).toBe(2);
      expect(details.guilda.membros).toBe(2);
      await expectCleanMatrix(client);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('v0.15 — TODA guilda é excluível (proteção de sistema OBSOLETA): guilda com líder BOT morre como qualquer outra', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      // sobrante hipotético de base antiga: guilda liderada por BOT (a
      // extinta "Tropa da Tartaruga" era exatamente isso). Sem a proteção
      // de sistema (removida na v0.15), o painel DEVE conseguir apagá-la.
      const legacy = await client.guild.create({
        data: { name: 'Tropa da Tartaruga', leaderId: world.bot.id, level: 1 },
      });
      await client.player.update({ where: { id: world.bot.id }, data: { guildId: legacy.id } });
      await client.guildDonation.create({ data: { playerId: world.leader.id, guildId: legacy.id, amount: 250 } });

      const report = await deleteGuildAdmin({
        guildId: legacy.id,
        confirmName: 'Tropa da Tartaruga',
        adminEmail: ADMIN_EMAIL,
        client,
      });
      expect(report.status).toBe('ok');
      // guilda + doações dela: MORTAS; o bot SOBREVIVE sem guilda
      expect(await client.guild.findUnique({ where: { id: legacy.id } })).toBeNull();
      expect(await client.guildDonation.count({ where: { guildId: legacy.id } })).toBe(0);
      const bot = await client.player.findUniqueOrThrow({ where: { id: world.bot.id } });
      expect(bot.guildId).toBeNull();
      expect(bot.isBot).toBe(true);
      // e o NOME ficou LIVRE (qualquer jogador pode fundar a própria)
      expect(await client.guild.findUnique({ where: { name: 'Tropa da Tartaruga' } })).toBeNull();
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('ok');
      expect(logs[0].action).toBe('delete_guild');
      await expectCleanMatrix(client);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('nome da guilda digitado errado → recusa auditada', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      await expectApiError(
        () => deleteGuildAdmin({ guildId: world.guild.id, confirmName: 'Errada', adminEmail: ADMIN_EMAIL, client }),
        'não confere'
      );
      expect(await client.guild.findUnique({ where: { id: world.guild.id } })).not.toBeNull();
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('listGuildsForAdmin traz o inventário completo (líder, membros, doações)', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      const guilds = await listGuildsForAdmin(client);
      const alvo = guilds.find((g) => g.name === 'QA Guilda Alvo');
      expect(alvo).toBeDefined();
      expect(alvo!.leaderName).toBe('QA Líder Alvo');
      expect(alvo!.memberCount).toBe(2);
      expect(alvo!.memberNames).toContain('QA Membro');
      expect(alvo!.totalDonated).toBe(1500);
      expect(alvo!.donationCount).toBe(2);
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// =====================================================================
// VIGILÂNCIA — a matriz pega doação órfã de guilda (check LÓGICO)
// =====================================================================

describe('matriz anti-órfã — vigilância de GuildDonation.guildId (sem FK)', () => {
  test('doação apontando para guilda morta é detectada como órfã LÓGICA', async () => {
    const { client, dir } = await makeTempDb();
    try {
      const world = await seedWorld(client);
      // simula o bug de classe pré-FK: doação para guilda que não existe
      await client.guildDonation.create({ data: { playerId: world.member.id, guildId: 'guilda-morta-id', amount: 10 } });
      const summary = summarizeOrphans(await countOrphans(client));
      expect(summary.clean).toBe(false);
      expect(summary.detail).toContain('GuildDonation.guildId');
      // a exclusão de guilda CORRETA limpa só as DELA — mas a órfã manual
      // (pré-existente) faz a OPERAÇÃO reportar falha (comportamento por
      // design: a verificação pós-operação grita QUALQUER órfão, mesmo
      // que não seja dela — conservador e alto, nunca silencioso)
      const report = await deleteGuildAdmin({ guildId: world.guild.id, confirmName: 'QA Guilda Alvo', adminEmail: ADMIN_EMAIL, client });
      expect(report.status).toBe('failed');
      expect(report.orphanCheck.detail).toContain('GuildDonation.guildId');
      const summary2 = summarizeOrphans(await countOrphans(client));
      expect(summary2.clean).toBe(false);
      expect(summary2.detail).toContain('GuildDonation.guildId');
      // a auditoria registrou o fracasso com o estado parcial
      const logs = await listAuditLogs(10, client);
      expect(logs[0].result).toBe('failed');
    } finally {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
