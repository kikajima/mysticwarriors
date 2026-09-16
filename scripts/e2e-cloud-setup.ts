/**
 * E2E nuvem (v0.8) — setup/teardown da conta de teste vinculada.
 * Cria conta com supabaseUserId fake + sessão com token conhecido para
 * exercitar /api/game/cloud-restore e /api/game/cloud-snapshot via curl.
 *
 * Uso: bun scripts/e2e-cloud-setup.ts create|cleanup
 */
import { db } from '../src/lib/db';

const TOKEN = 'e2e-token-cloud-123';
const SB_USER = 'e2e-cloud-user-0001';

async function create() {
  const existing = await db.account.findFirst({ where: { supabaseUserId: SB_USER } });
  if (existing) {
    console.log('SETUP já existe — account:', existing.id);
    return;
  }
  const account = await db.account.create({
    data: {
      supabaseUserId: SB_USER,
      username: 'E2ENuvem',
      usernameLower: 'e2enuvem',
      passwordHash: 'x',
      isGuest: false,
    },
  });
  await db.session.create({
    data: {
      token: TOKEN,
      accountId: account.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  console.log('SETUP OK — account:', account.id, '| cookie: gm_session=' + TOKEN);
}

async function cleanup() {
  const account = await db.account.findFirst({ where: { supabaseUserId: SB_USER } });
  if (!account) {
    console.log('CLEANUP: nada para limpar');
    return;
  }
  const players = await db.player.findMany({ where: { accountId: account.id } });
  for (const p of players) {
    await db.session.deleteMany({ where: { accountId: account.id } }).catch(() => undefined);
  }
  // remove entidades dependentes dos players e os próprios
  await db.activity.deleteMany({ where: { playerId: { in: players.map((p) => p.id) } } }).catch(() => undefined);
  await db.requestDedup.deleteMany({ where: { playerId: { in: players.map((p) => p.id) } } }).catch(() => undefined);
  await db.questProgress.deleteMany({ where: { playerId: { in: players.map((p) => p.id) } } }).catch(() => undefined);
  await db.achievementState.deleteMany({ where: { playerId: { in: players.map((p) => p.id) } } }).catch(() => undefined);
  await db.walletTransaction.deleteMany({ where: { playerId: { in: players.map((p) => p.id) } } }).catch(() => undefined);
  await db.player.deleteMany({ where: { accountId: account.id } });
  await db.session.deleteMany({ where: { accountId: account.id } });
  await db.cosmeticOwned.deleteMany({ where: { accountId: account.id } });
  await db.account.delete({ where: { id: account.id } });
  console.log('CLEANUP OK — conta de teste e dependentes removidos');
}

const mode = process.argv[2] ?? 'create';
(mode === 'cleanup' ? cleanup() : create())
  .catch((e) => {
    console.error('FALHA:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
