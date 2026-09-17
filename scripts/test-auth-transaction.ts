// Execute isoladamente: bun scripts/test-auth-transaction.ts
// O mock de cookies fica restrito a este processo; SQLite/Prisma são reais.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'mw-auth-tx-'));
const file = path.join(dir, 'test.db');
writeFileSync(file, '');
process.env.DATABASE_URL = `file:${file}`;
let cookieToken: string | undefined;
mock.module('next/headers', () => ({
  cookies: async () => ({ get: () => cookieToken ? { value: cookieToken } : undefined }),
}));

const { db } = await import('../src/lib/db');
const originalFetch = globalThis.fetch;
let userId = 'auth-tx-user';
globalThis.fetch = Object.assign(
  async () => Response.json({ id: userId, email: 'transaction@example.test' }),
  { preconnect: originalFetch.preconnect },
);
try {
  const { applyPendingMigrations } = await import('../src/lib/game/persistence');
  await applyPendingMigrations(db);
  const { POST } = await import('../src/app/api/auth/supabase/route');
  const { createSession } = await import('../src/lib/auth');
  const guest = await db.account.create({ data: { isGuest: true } });
  const session = await createSession(guest.id);
  cookieToken = session.token;

  async function login() {
    const response = await POST(new Request('http://localhost/api/auth/supabase', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'test-token-for-local-verification', nick: 'TransactionTest' }),
    }));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.match(response.headers.get('set-cookie') ?? '', /gm_session=/);
  }

  await login();
  const promoted = await db.account.findUniqueOrThrow({ where: { id: guest.id } });
  assert.equal(promoted.supabaseUserId, userId);
  assert.equal(promoted.isGuest, false);
  await login();
  assert.equal(await db.account.count(), 1, 'login repetido preserva a conta');

  // Uma sessão revogada não pode ser promovida; cria conta separada.
  const anotherGuest = await db.account.create({ data: { isGuest: true } });
  const revoked = await createSession(anotherGuest.id);
  await db.session.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } });
  cookieToken = revoked.token;
  userId = 'auth-tx-other-user';
  await login();
  assert.equal((await db.account.findUniqueOrThrow({ where: { id: anotherGuest.id } })).isGuest, true);
  assert.notEqual((await db.account.findUniqueOrThrow({ where: { supabaseUserId: userId } })).id, anotherGuest.id);
  console.log('PASS: promoção, login repetido e sessão revogada com pool de uma conexão');
} finally {
  globalThis.fetch = originalFetch;
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
}
