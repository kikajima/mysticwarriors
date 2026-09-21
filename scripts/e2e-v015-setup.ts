// =====================================================================
// E2E v0.15 — SETUP (guildas-zero + fantasmas só-nuvem para o painel)
// ---------------------------------------------------------------------
// Prepara o mundo que o ADMIN vai destruir PELO NAVEGADOR:
//   * "Admin QA E2E"    (admin)      — personagem do admin com 20.000
//     Zeni (funda a guilda do ciclo criar→dissolver→nada-reaparece);
//   * "QA Local Alvo"   (qa-lider)   — espelhado local+nuvem (prova o
//     cascade NAS DUAS camadas — regressão do caminho que funcionava);
//   * "QA Só Nuvem E2E" (qa-jogador) — NASCE local, é espelhado na
//     nuvem e a linha LOCAL morre (é exatamente como os fantasmas reais
//     nasceram: servidor perdeu dados, nuvem manteve). Fica SÓ-NUVEM;
//   * "Príncipe QA"     (qa-jogador) — fantasma só-nuvem criado direto
//     na nuvem com ACENTO no nome (teste: digitar com/sem acento).
//
// Uso: bun scripts/e2e-v015-setup.ts (dev server :3000 + mock :4010;
// dev server com NEXT_PUBLIC_SUPABASE_URL=http://localhost:4010)
// =====================================================================

import { db } from '@/lib/db';

const GAME = 'http://localhost:3000';
const MOCK = 'http://localhost:4010';
const PASSWORD = 'qa-e2e-password';

interface Ctx {
  cookie: string;
  token: string;
  playerId: string | null;
  characters?: Array<{ id: string; name: string }>;
}

async function mockLogin(email: string): Promise<string> {
  const res = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'x' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login mock falhou para ${email}: ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

async function bridgeLogin(email: string): Promise<Ctx> {
  const token = await mockLogin(email);
  const res = await fetch(`${GAME}/api/auth/supabase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: token }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  if (!res.ok || !cookie) throw new Error(`ponte falhou para ${email}: ${res.status}`);
  const data = (await res.json()) as { activePlayerId?: string | null; characters?: Array<{ id: string; name: string }> };
  return { cookie, token, playerId: data.activePlayerId ?? null, characters: data.characters ?? [] };
}

async function api(ctx: Ctx, path: string, body?: unknown, method = 'POST') {
  const res = await fetch(`${GAME}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: ctx.cookie,
      ...(ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.success === false) {
    throw new Error(`${path} falhou: HTTP ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

async function createCharacter(ctx: Ctx, name: string, race: string) {
  const existing = ctx.characters?.find((c) => c.name === name);
  if (existing) {
    ctx.playerId = existing.id;
    return existing.id;
  }
  await api(ctx, '/api/game/create', { name, race, gender: 'male' });
  const res = await fetch(`${GAME}/api/auth/session`, { headers: { Cookie: ctx.cookie } });
  const data = (await res.json()) as { activePlayerId?: string | null };
  ctx.playerId = data.activePlayerId ?? ctx.playerId;
  return ctx.playerId!;
}

/** Espelha um personagem local na nuvem-mock (o MESMO formato do sync do cliente). */
async function mirrorToCloud(token: string, row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${MOCK}/rest/v1/personagens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'x', Authorization: `Bearer ${token}` },
    body: JSON.stringify([row]),
  });
  if (!res.ok && res.status !== 201) throw new Error(`espelho na nuvem falhou: ${res.status}`);
}

async function main() {
  console.log('=== setup E2E v0.15 — mundo com ZERO guildas + fantasmas ===');

  // ===== pré-condição: a guilda de sistema NÃO pode existir em lugar algum =====
  const localGuilds = await db.guild.count();
  if (localGuilds !== 0) throw new Error(`banco local deveria ter 0 guildas, tem ${localGuilds}`);

  // ===== 1) ADMIN: personagem + zeni para fundar a guilda do ciclo =====
  const admin = await bridgeLogin('admin@example.test');
  const adminPlayerId = await createCharacter(admin, 'Admin QA E2E', 'humano');
  console.log('✓ Admin QA E2E:', adminPlayerId);
  await api(admin, '/api/admin/action', { characterId: adminPlayerId, ownerId: null, action: 'grant', zeniDelta: 20000 });
  console.log('✓ 20.000 Zeni concedidos (para fundar a guilda do ciclo no navegador)');

  // ===== 2) QA LOCAL ALVO (local + nuvem — regressão do cascade) =====
  const lider = await bridgeLogin('qa-lider@example.com');
  const localAlvoId = await createCharacter(lider, 'QA Local Alvo', 'namekuseijin');
  console.log('✓ QA Local Alvo (local):', localAlvoId);
  const localAlvo = await db.player.findUniqueOrThrow({ where: { id: localAlvoId }, include: { account: true } });
  await mirrorToCloud(lider.token, {
    id: localAlvo.id,
    user_id: localAlvo.account!.supabaseUserId,
    nome: localAlvo.name,
    raca: localAlvo.race,
    nivel: localAlvo.level,
    poder: 900,
    vitorias: localAlvo.battlesWon,
    derrotas: localAlvo.battlesLost,
    ativo: true,
    estado: { zeni: localAlvo.zeni },
  });
  console.log('✓ QA Local Alvo espelhado na nuvem (ambas as camadas)');

  // ===== 3) QA SÓ NUVEM E2E (nasce local → espelha → linha local morre) =====
  const jogador = await bridgeLogin('qa-jogador@example.com');
  const ghostId = await createCharacter(jogador, 'QA Só Nuvem E2E', 'majin');
  const ghost = await db.player.findUniqueOrThrow({ where: { id: ghostId }, include: { account: true } });
  await mirrorToCloud(jogador.token, {
    id: ghost.id,
    user_id: ghost.account!.supabaseUserId,
    nome: ghost.name,
    raca: ghost.race,
    nivel: ghost.level,
    poder: 700,
    vitorias: ghost.battlesWon,
    derrotas: ghost.battlesLost,
    ativo: true,
    estado: { zeni: ghost.zeni },
  });
  // a linha LOCAL morre — exatamente como os fantasmas reais nasceram
  // (o servidor perdeu dados; a nuvem manteve o espelho). A conta auth
  // local FICA (órfã de personagens) — é a hipótese h4 do dono.
  await db.account.updateMany({ where: { activePlayerId: ghost.id }, data: { activePlayerId: null } });
  await db.player.delete({ where: { id: ghost.id } });
  console.log('✓ QA Só Nuvem E2E: linha local APAGADA — o personagem vive SÓ na nuvem (fantasma)');

  // ===== 4) PRÍNCIPE QA (só-nuvem com ACENTO — direto na nuvem) =====
  await mirrorToCloud(jogador.token, {
    id: '99999999-9999-9999-9999-999999999999',
    user_id: '22222222-2222-2222-2222-222222222222',
    nome: 'Príncipe QA',
    raca: 'saiyajin',
    nivel: 5,
    poder: 500,
    vitorias: 2,
    derrotas: 1,
    ativo: true,
    estado: {},
  });
  console.log('✓ Príncipe QA: fantasma só-nuvem com ACENTO no nome (teste de digitação)');

  // ===== estado final =====
  const dump = (await (await fetch(`${MOCK}/__dump`)).json()) as { personagens: Array<{ nome: string }> };
  console.log('\n=== nuvem-mock (personagens) ===');
  for (const p of dump.personagens) console.log(`  ☁ ${p.nome}`);
  const players = await db.player.findMany({ where: { isBot: false }, select: { name: true } });
  console.log('=== servidor local (humanos) ===');
  for (const p of players) console.log(`  🖥 ${p.name}`);
  console.log('guildas:', await db.guild.count(), '(zero — o mundo começa sem nenhuma)');
  await db.$disconnect();
  console.log('setup concluído.');
}

main().catch(async (err) => {
  console.error('FALHA NO SETUP:', err.message);
  await db.$disconnect();
  process.exit(1);
});
