// =====================================================================
// E2E v0.14 — SETUP DO MUNDE QA (guildas com líder/membro/doações)
// ---------------------------------------------------------------------
// Cria via APIs reais (login no SUPABASE-MOCK → ponte /api/auth/supabase
// → criação de personagem → ações do jogo) o cenário que o ADMIN vai
// destruir PELO NAVEGADOR:
//   * "QA Líder E2E"   (qa-lider)     — funda "QA Guilda E2E" (após
//     grant de Zeni pelo admin — o MESMO caminho do painel);
//   * "QA Membro E2E"  (qa-jogador)  — entra e doa 2× na guilda;
//   * "QA Membro Dois" (qa-lider, 2º personagem) — fica SEM guilda
//     (usado depois no cenário de exclusão de guilda com membros).
//
// O setup é SCRIPTADO (API) porque o que o E2E precisa provar no
// NAVEGADOR são os fluxos do ADMIN (botões, modais, confirmações,
// auditoria) — a mecânica de jogar já tem sua própria suíte.
//
// Uso: bun scripts/e2e-v014-setup.ts  (requer dev server na :3000 e
// supabase-mock na :4010 — o dev server deve estar com
// NEXT_PUBLIC_SUPABASE_URL=http://localhost:4010)
// =====================================================================

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

/** Login na ponte do jogo → cookie de sessão local. */
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
  // idempotente: se o personagem já existe (setup re-rodado), reusa
  const existing = ctx.characters?.find((c) => c.name === name);
  if (existing) {
    ctx.playerId = existing.id;
    return existing.id;
  }
  await api(ctx, '/api/game/create', { name, race });
  // criação define activePlayerId no servidor — relê a sessão
  const res = await fetch(`${GAME}/api/auth/session`, { headers: { Cookie: ctx.cookie } });
  const data = (await res.json()) as { activePlayerId?: string | null };
  ctx.playerId = data.activePlayerId ?? ctx.playerId;
  return ctx.playerId!;
}

async function act(ctx: Ctx, type: string, args: Record<string, unknown> = {}) {
  if (!ctx.playerId) throw new Error('sem playerId');
  return api(ctx, '/api/game/action', {
    playerId: ctx.playerId,
    type,
    requestId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...args,
  });
}

async function main() {
  console.log('=== setup E2E v0.14 — mundo QA de guildas ===');

  // 1) QA LÍDER: personagem + grant de Zeni (admin) + fundar guilda
  const lider = await bridgeLogin('qa-lider@example.com');
  const liderPlayerId = await createCharacter(lider, 'QA Líder E2E', 'saiyajin');
  console.log('✓ personagem QA Líder E2E criado:', liderPlayerId);

  const admin = await bridgeLogin('alicomprasbbbb@gmail.com');
  await api(admin, '/api/admin/action', {
    characterId: liderPlayerId,
    ownerId: null,
    action: 'grant',
    zeniDelta: 20000,
  });
  console.log('✓ admin concedeu 20.000 Zeni ao líder (painel/API)');

  // volta a logar o líder (a sessão admin substituiu nada — cada ctx tem cookie próprio)
  const fundada = await act(lider, 'create_guild', { guildName: 'QA Guilda E2E' });
  console.log('✓ guilda fundada:', (fundada as { message?: string }).message ?? '');

  // 2) QA MEMBRO: personagem (2º da conta qa-jogador) + entrar + doar 2×
  const membro = await bridgeLogin('qa-jogador@example.com');
  const membroPlayerId = await createCharacter(membro, 'QA Membro E2E', 'humano');
  console.log('✓ personagem QA Membro E2E criado:', membroPlayerId);

  // dá Zeni ao membro para as doações (admin)
  await api(admin, '/api/admin/action', {
    characterId: membroPlayerId,
    ownerId: null,
    action: 'grant',
    zeniDelta: 5000,
  });

  // acha o id da guilda pela listagem pública
  const guildsRes = await api(membro, '/api/game/guilds?page=1', undefined, 'GET') as {
    guilds?: Array<{ id: string; name: string }>;
  };
  const alvo = guildsRes.guilds?.find((g) => g.name === 'QA Guilda E2E');
  if (!alvo) throw new Error('guilda QA não encontrada na listagem');
  const entrada = await act(membro, 'join_guild', { targetId: alvo.id });
  console.log('✓ membro entrou:', (entrada as { message?: string }).message?.slice(0, 80));

  const doacao1 = await act(membro, 'donate_guild', { amount: 300 });
  const doacao2 = await act(membro, 'donate_guild', { amount: 200 });
  console.log('✓ doações: 300 + 200 Zeni —', (doacao2 as { message?: string }).message?.slice(0, 80));

  // 3) fundos para o cenário 4: QA Membro E2E fundará "QA Guilda Dois"
  //    DEPOIS da exclusão do líder (a auto-dissolução o deixa sem guilda).
  //    E "QA Membro Dois" (3º personagem da conta qa-lider) fica pronto
  //    para o teste mobile (390px).
  console.log('\n=== estado final do setup ===');
  const check = await fetch(`${GAME}/api/admin/players`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const players = ((await check.json()) as { characters?: Array<{ name: string; guildName: string | null; isGuildLeader: boolean }> }).characters ?? [];
  for (const c of players.filter((p) => p.name.startsWith('QA') || p.name.startsWith('Admin'))) {
    console.log(`  ${c.name}${c.guildName ? ` → ${c.guildName}${c.isGuildLeader ? ' (LÍDER)' : ''}` : ' → sem guilda'}`);
  }
  console.log('setup concluído.');
}

main().catch((err) => {
  console.error('FALHA NO SETUP:', err.message);
  process.exit(1);
});

export {};
