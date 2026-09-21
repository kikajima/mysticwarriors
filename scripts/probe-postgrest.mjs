// =====================================================================
// PROBE SOMENTE-LEITURA — mapear o comportamento do PostgREST do
// Supabase do usuário (v0.9.10.2 diagnóstico complementar)
// ---------------------------------------------------------------------
// NÃO escreve NADA. Só chama:
//   1. RPC inexistente (anon)      → qual status? (esperado 404)
//   2. is_admin sem token (anon)   → revogada p/ anon (esperado 404)
//   3. ranking_nuvem c/ arg inválida (anon) → existe+exposta → erro de
//      execução (classe 22) → qual status? (esperado 400)
//   4. GET /rest/v1/admins (anon)  → tabela existe? (200/403 vs 404)
//   5. GET /rest/v1/personagens    → controle (deve existir)
// Objetivo: provar se "HTTP 400" no botão = função EXISTE e falhou
// dentro (vs. 404 = não instalada).
// =====================================================================
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no ambiente antes do probe.');
}

async function probe(label, path, init) {
  try {
    const res = await fetch(`${URL}${path}`, {
      ...init,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let body = text.slice(0, 300);
    try { body = JSON.stringify(JSON.parse(text)).slice(0, 300); } catch {}
    console.log(`[${label}] HTTP ${res.status} ${res.statusText} — ${body}`);
    return res.status;
  } catch (e) {
    console.log(`[${label}] FALHA DE REDE: ${e?.message ?? e}`);
    return -1;
  }
}

// 1. função INEXISTENTE — como o PostgREST responde?
await probe('1-funcao-inexistente', '/rest/v1/rpc/zzz_funcao_que_nao_existe', {
  method: 'POST',
  body: JSON.stringify({ p_confirm: 'RESET' }),
});

// 2. função existente mas REVOGADA para anon (is_admin)
await probe('2-revogada-do-anon', '/rest/v1/rpc/is_admin', {
  method: 'POST',
  body: JSON.stringify({}),
});

// 3. função existente + exposta + argumento inválido → erro de EXECUÇÃO
await probe('3-erro-de-execucao', '/rest/v1/rpc/ranking_nuvem', {
  method: 'POST',
  body: JSON.stringify({ p_limite: 'NaN-invalido' }),
});

// 4. tabela admins existe? (RLS sem políticas → 200 [] se existir)
await probe('4-tabela-admins', '/rest/v1/admins?select=*&limit=1', { method: 'GET' });

// 5. controle: tabela personagens existe?
await probe('5-tabela-personagens', '/rest/v1/personagens?select=id&limit=1', { method: 'GET' });

// 6. controle: tabela profiles existe?
await probe('6-tabela-profiles', '/rest/v1/profiles?select=id&limit=1', { method: 'GET' });

// 7. a própria RPC admin_reset_cloud com anon (revogada) — mesmo que 2?
await probe('7-admin-reset-cloud-anon', '/rest/v1/rpc/admin_reset_cloud', {
  method: 'POST',
  body: JSON.stringify({ p_confirm: 'RESET' }),
});
