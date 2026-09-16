// =====================================================================
// SUPABASE-MOCK — mini-serviço para E2E do painel admin (v0.14)
// ---------------------------------------------------------------------
// POR QUE EXISTE: o sandbox NÃO tem as credenciais da conta admin real
// (alicomprasbbbb@gmail.com) nem a RPC admin_delete_personagem instalada
// na nuvem de produção. Para provar o fluxo COMPLETO no navegador
// (login → painel → exclusão nas DUAS camadas → ranking → auditoria),
// o dev server é temporariamente apontado para ESTE mock via
// NEXT_PUBLIC_SUPABASE_URL=http://localhost:4010 durante o E2E — e
// devolvido à URL real imediatamente depois.
//
// O QUE ELE EMULA (só o que o jogo usa):
//  * Auth: POST /auth/v1/token (password + refresh), GET /auth/v1/user;
//  * RPCs: is_admin · admin_list_personagens · admin_delete_personagem
//    (com a MESMA semântica do supabase-admin-delete.sql: probe 22023,
//    validação do nome NA PONTA, backup, apaga SÓ o alvo) ·
//    ranking_nuvem (ordenado por nível desc);
//  * PostgREST mínimo de personagens/profiles (select/upsert/delete
//    do sync do cliente);
//  * GET /__dump — estado vivo (verificação E2E: "sumiu da NUVEM").
//
// Usuários semeados (password única "qa-e2e-password"):
//  * alicomprasbbbb@gmail.com  (ADMIN — bate com a tabela admins)
//  * qa-jogador@example.com    (jogador comum)
//  * qa-lider@example.com      (jogador comum)
//
// Nada aqui toca o Supabase real — é um servidor local isolado.
// =====================================================================

const PORT = 4010;

// ===== estado em memória =====

interface MockUser {
  id: string;
  email: string;
  password: string;
  isAdmin: boolean;
  createdAt: string;
}

interface MockPersonagem {
  id: string;
  user_id: string;
  nome: string;
  raca: string;
  nivel: number;
  poder: number;
  vitorias: number;
  derrotas: number;
  ativo: boolean;
  estado: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
}

const users: MockUser[] = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'alicomprasbbbb@gmail.com', password: 'qa-e2e-password', isAdmin: true, createdAt: new Date().toISOString() },
  { id: '22222222-2222-2222-2222-222222222222', email: 'qa-jogador@example.com', password: 'qa-e2e-password', isAdmin: false, createdAt: new Date().toISOString() },
  { id: '33333333-3333-3333-3333-333333333333', email: 'qa-lider@example.com', password: 'qa-e2e-password', isAdmin: false, createdAt: new Date().toISOString() },
];

/** personagens espelhadas (o sync do cliente cria via POST; deletes removem) */
const personagens: MockPersonagem[] = [];

/** backup das linhas apagadas pela RPC admin_delete_personagem */
const backupPersonagens: MockPersonagem[] = [];

/**
 * v0.15 — A RPC admin_delete_personagem pode ser "desinstalada" em
 * runtime (GET /__rpc_delete?installed=false). É o estado REAL da nuvem
 * de produção hoje (o dono ainda não rodou supabase-admin-delete.sql):
 * o E2E usa isso para REPRODUZIR a falha relatada ("NADA foi apagado")
 * e depois reinstalá-la para provar a correção — sem tocar o Supabase
 * real.
 */
let deleteRpcInstalled = true;

/** log de chamadas (para asserções E2E) */
const calls: Array<{ at: string; method: string; path: string; body?: unknown }> = [];

function newTokenFor(user: MockUser): { token: string; refreshToken: string } {
  // DETERMINÍSTICOS (mock-access-<uuid>): sobrevivem a hot-reload do
  // serviço — um Map de tokens se perde e invalidaria a sessão do
  // navegador no meio do E2E (aconteceu: is_admin → false após reload).
  const token = `mock-access-${user.id}`;
  const refreshToken = `mock-refresh-${user.id}`;
  return { token, refreshToken };
}

function userOfToken(authHeader: string | null): MockUser | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const m = token.match(/^mock-(?:access|refresh)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return users.find((u) => u.id === (m?.[1]?.toLowerCase() ?? '')) ?? null;
}

function json(res: Response | undefined, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
}

// ===== autenticação (formato que o supabase-js espera) =====

function sessionBody(user: MockUser) {
  const { token, refreshToken } = newTokenFor(user);
  const expiresIn = 3600 * 24 * 7; // 7 dias — sem refresh no meio do E2E
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: user.createdAt,
      phone: '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: user.createdAt,
      updated_at: user.createdAt,
    },
  };
}

// ===== RPCs =====

function rpcIsAdmin(user: MockUser | null): Response {
  return json(undefined, 200, user?.isAdmin === true);
}

function rpcAdminListPersonagens(user: MockUser | null): Response {
  if (!user?.isAdmin) {
    return json(undefined, 403, { code: '42501', message: 'Não autorizado.', details: null, hint: null });
  }
  const rows = personagens.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    email: users.find((u) => u.id === p.user_id)?.email ?? null,
    nick: users.find((u) => u.id === p.user_id)?.email?.split('@')[0] ?? null,
    nome: p.nome,
    raca: p.raca,
    nivel: p.nivel,
    poder: p.poder,
    vitorias: p.vitorias,
    derrotas: p.derrotas,
    ativo: p.ativo,
    estado: p.estado,
    criado_em: p.criado_em,
  }));
  return json(undefined, 200, rows);
}

/**
 * admin_delete_personagem — a MESMA semântica do supabase-admin-delete.sql:
 *  * não-admin → 42501 (403);
 *  * sem p_confirm_nome → 22023 (400) [é o que o PROBE do jogo detecta];
 *  * nome digitado ≠ nome da linha → 22023 (400);
 *  * sucesso: backup da linha → apaga SÓ o alvo → relatório com contagens.
 */
function rpcAdminDeletePersonagem(user: MockUser | null, args: { p_personagem_id?: string; p_confirm_nome?: string | null }): Response {
  if (!user?.isAdmin) {
    return json(undefined, 403, { code: '42501', message: 'Não autorizado.', details: null, hint: null });
  }
  const confirm = typeof args.p_confirm_nome === 'string' ? args.p_confirm_nome.trim() : '';
  if (!confirm) {
    return json(undefined, 400, {
      code: '22023',
      message: 'Confirmação ausente — envie o nome do personagem para confirmar.',
      details: null,
      hint: null,
    });
  }
  const id = args.p_personagem_id ?? '';
  const row = personagens.find((p) => p.id === id);
  if (!row) {
    return json(undefined, 200, {
      ok: true,
      personagens_apagados: 0,
      backup_personagens: 0,
      observacao: 'linha não encontrada na nuvem (nada a apagar)',
    });
  }
  if (row.nome !== confirm) {
    return json(undefined, 400, {
      code: '22023',
      message: `Nome digitado não confere com o personagem da linha (${row.nome}).`,
      details: null,
      hint: null,
    });
  }
  backupPersonagens.push(row);
  personagens.splice(personagens.indexOf(row), 1);
  return json(undefined, 200, {
    ok: true,
    personagens_apagados: 1,
    backup_personagens: 1,
    nome: row.nome,
  });
}

/** ranking_nuvem — nível desc, campos que o jogo lê (v2 do SQL). */
function rpcRankingNuvem(args: { p_nome?: string | null }): Response {
  const sorted = [...personagens].sort((a, b) => b.nivel - a.nivel || b.poder - a.poder);
  const total = sorted.length;
  let minhaPos: number | null = null;
  const rows = sorted.map((p, i) => ({
    posicao: i + 1,
    nome: p.nome,
    raca: p.raca,
    nivel: p.nivel,
    poder: p.poder,
    vitorias: p.vitorias,
    derrotas: p.derrotas,
    total,
    minha_posicao: args.p_nome && p.nome === args.p_nome ? i + 1 : null,
  }));
  if (minhaPos === null && args.p_nome) {
    minhaPos = rows.find((r) => r.nome === args.p_nome)?.posicao ?? null;
  }
  return json(undefined, 200, rows);
}

// ===== PostgREST mínimo (tabelas personagens / profiles) =====

function handleTableGet(url: URL, user: MockUser | null, table: 'personagens' | 'profiles'): Response {
  if (!user) return json(undefined, 401, { code: '401', message: 'não autenticado', details: null, hint: null });
  if (table === 'personagens') {
    let rows: Array<Record<string, unknown>> = personagens
      .filter((p) => p.user_id === user.id)
      .map((p) => ({ ...p }));
    // filtros simples user_id=eq.X (RLS simulada)
    const userIdFilter = url.searchParams.get('user_id');
    if (userIdFilter?.startsWith('eq.')) rows = rows.filter((r) => r.user_id === userIdFilter.slice(3));
    return json(undefined, 200, rows);
  }
  // profiles: linha única do próprio usuário
  return json(undefined, 200, [
    { id: user.id, nick: user.email.split('@')[0], nivel: 1, xp: 0, progresso: { version: 3, characters: [], cosmeticsOwned: [] } },
  ]);
}

function handlePersonagensPost(url: URL, user: MockUser | null, body: unknown): Response {
  if (!user) return json(undefined, 401, { code: '401', message: 'não autenticado', details: null, hint: null });
  const rows = Array.isArray(body) ? body : [body];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.nome !== 'string') continue;
    const now = new Date().toISOString();
    const existing = personagens.find((p) => p.id === r.id);
    const row: MockPersonagem = {
      id: r.id,
      user_id: typeof r.user_id === 'string' ? r.user_id : user.id,
      nome: r.nome,
      raca: typeof r.raca === 'string' ? r.raca : 'humano',
      nivel: Number(r.nivel) || 1,
      poder: Number(r.poder) || 0,
      vitorias: Number(r.vitorias) || 0,
      derrotas: Number(r.derrotas) || 0,
      ativo: r.ativo !== false,
      estado: (r.estado as Record<string, unknown>) ?? {},
      criado_em: existing?.criado_em ?? now,
      atualizado_em: now,
    };
    const idx = personagens.indexOf(existing ?? row);
    if (existing && idx >= 0) personagens[idx] = row;
    else personagens.push(row);
  }
  return new Response(null, { status: 201, headers: { 'Access-Control-Allow-Origin': '*' } });
}

function handlePersonagensDelete(url: URL, user: MockUser | null): Response {
  if (!user) return json(undefined, 401, { code: '401', message: 'não autenticado', details: null, hint: null });
  // user_id=eq.X [& id=not.in.(a,b)] — o deleteStaleCloudCharacters do jogo
  const userIdFilter = url.searchParams.get('user_id');
  if (userIdFilter?.startsWith('eq.')) {
    const uid = userIdFilter.slice(3);
    const notIn = url.searchParams.get('id');
    const keep = notIn?.match(/not\.in\.\((.*)\)/)?.[1]?.split(',').filter(Boolean) ?? [];
    for (let i = personagens.length - 1; i >= 0; i--) {
      const p = personagens[i];
      if (p.user_id === uid && !keep.includes(p.id)) personagens.splice(i, 1);
    }
  }
  return noContent();
}

// ===== servidor =====

const server = Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const auth = req.headers.get('authorization');
    calls.push({ at: new Date().toISOString(), method: req.method, path });

    // CORS preflight (o fetch do navegador manda OPTIONS nas mutações)
    if (req.method === 'OPTIONS') {
      const requested = req.headers.get('access-control-request-headers') ?? '(nenhum)';
      calls.push({ at: new Date().toISOString(), method: 'PREFLIGHT', path: `${path} [${requested}]` });
      // ecoa DE VOLTA exatamente os headers pedidos — a lista fechada
      // travava chamadas do supabase-js (headers além do previsto)
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': requested,
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // ===== estado vivo (verificação E2E) =====
    if (path === '/__dump' && req.method === 'GET') {
      return json(undefined, 200, {
        users: users.map((u) => ({ id: u.id, email: u.email, isAdmin: u.isAdmin })),
        personagens: personagens.map((p) => ({ id: p.id, user_id: p.user_id, nome: p.nome, nivel: p.nivel })),
        backupPersonagens: backupPersonagens.map((p) => ({ id: p.id, nome: p.nome })),
        deleteRpcInstalled,
        calls: calls.slice(-60),
      });
    }

    // ===== v0.15 — toggle da RPC de exclusão (reproduz a produção) =====
    if (path === '/__rpc_delete' && req.method === 'GET') {
      const want = url.searchParams.get('installed');
      if (want === 'false' || want === 'true') {
        deleteRpcInstalled = want === 'true';
      }
      return json(undefined, 200, { installed: deleteRpcInstalled });
    }

    // ===== AUTH =====
    if (path === '/auth/v1/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string; refresh_token?: string };
      if (grant === 'password') {
        const user = users.find((u) => u.email === (body.email ?? '').trim().toLowerCase());
        if (!user || user.password !== body.password) {
          return json(undefined, 400, { code: 'invalid_credentials', message: 'Invalid login credentials' });
        }
        return json(undefined, 200, sessionBody(user));
      }
      if (grant === 'refresh_token') {
        const user = userOfToken(`Bearer ${body.refresh_token ?? ''}`);
        if (!user) return json(undefined, 400, { code: 'refresh_token_not_found', message: 'Invalid refresh token' });
        return json(undefined, 200, sessionBody(user));
      }
      return json(undefined, 400, { code: 'unsupported', message: 'grant_type inválido' });
    }

    if (path === '/auth/v1/user' && req.method === 'GET') {
      const user = userOfToken(auth);
      if (!user) return json(undefined, 401, { code: '401', message: 'token inválido' });
      return json(undefined, 200, {
        id: user.id,
        email: user.email,
        aud: 'authenticated',
        role: 'authenticated',
        user_metadata: {},
        app_metadata: { provider: 'email', providers: ['email'] },
        created_at: user.createdAt,
      });
    }

    if (path === '/auth/v1/logout' && req.method === 'POST') {
      return json(undefined, 200, {});
    }

    // ===== RPCs =====
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.slice('/rest/v1/rpc/'.length);
      const user = userOfToken(auth);
      const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      calls.push({ at: new Date().toISOString(), method: 'RPC', path: fn, body: args });
      switch (fn) {
        case 'is_admin':
          return rpcIsAdmin(user);
        case 'admin_list_personagens':
          return rpcAdminListPersonagens(user);
        case 'admin_delete_personagem':
          // v0.15 — desinstalada? PostgREST devolve 404 PGRST202 — é o
          // estado da produção sem o supabase-admin-delete.sql rodado
          if (!deleteRpcInstalled) {
            return json(undefined, 404, { code: 'PGRST202', message: 'função admin_delete_personagem não existe', details: null, hint: null });
          }
          return rpcAdminDeletePersonagem(user, args as { p_personagem_id?: string; p_confirm_nome?: string | null });
        case 'ranking_nuvem':
          return rpcRankingNuvem(args as { p_nome?: string | null });
        case 'admin_reset_cloud':
          // probe do jogo: sem confirm → 22023 (400) [função "instalada"]
          if (args.p_confirm !== 'RESET') {
            return json(undefined, 400, {
              code: '22023',
              message: 'Confirmação ausente — envie RESET para confirmar.',
              details: null,
              hint: null,
            });
          }
          return json(undefined, 200, { ok: true, personagens_apagados: personagens.length, perfis_limpos: 0, backup_personagens: 0, backup_perfis: 0, resetado_em: new Date().toISOString() });
        default:
          return json(undefined, 404, { code: 'PGRST202', message: `função ${fn} não existe`, details: null, hint: null });
      }
    }

    // ===== tabelas (PostgREST mínimo) =====
    if (path === '/rest/v1/personagens') {
      const user = userOfToken(auth);
      if (req.method === 'GET') return handleTableGet(url, user, 'personagens');
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const body = await req.json().catch(() => null);
        return handlePersonagensPost(url, user, body);
      }
      if (req.method === 'DELETE') return handlePersonagensDelete(url, user);
    }
    if (path === '/rest/v1/profiles') {
      const user = userOfToken(auth);
      if (req.method === 'GET') return handleTableGet(url, user, 'profiles');
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        return new Response(null, { status: 201, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
    }

    return json(undefined, 404, { code: 'PGRST205', message: `rota não mockada: ${req.method} ${path}`, details: null, hint: null });
  },
});

console.log(`[supabase-mock] ouvindo em http://localhost:${server.port} — admin: alicomprasbbbb@gmail.com / qa-e2e-password`);
console.log('[supabase-mock] estado vivo em GET /__dump');
