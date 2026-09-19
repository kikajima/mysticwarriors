// =====================================================================
// Supabase — ponte ADMIN (server-side, v0.9)
// ---------------------------------------------------------------------
// Chamadas às funções RPC do painel de administrador (ver supabase-admin.sql).
//
// SEGURANÇA (modelo de confiança):
//  * Nenhuma chave secreta/service_role — apenas a PUBLICÁVEL;
//  * toda chamada usa o ACCESS TOKEN do próprio usuário logado;
//  * a autorização administrativa tem FONTE ÚNICA no Supabase:
//    public.is_admin() cruza auth.uid() + auth.users.email + public.admins;
//  * não existe segunda lista de admins em variável de ambiente do Render.
// =====================================================================

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, supabaseUserEndpoint } from './config';

interface RpcResult<T> {
  ok: boolean;
  data: T | null;
  error?: string;
}

async function callRpc<T>(
  fn: string,
  accessToken: string,
  args: Record<string, unknown> = {}
): Promise<RpcResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(args),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, data: null, error: 'network' };
  }
  if (!res.ok) {
    // v0.9.10.5 — o CORPO do erro do PostgREST (code/message/details/hint)
    // passa a fazer parte da string de erro. O "HTTP 400" cego custou dois
    // diagnósticos inteiros: o 23502 (progresso NOT NULL) estava escrito no
    // corpo da resposta o tempo todo e o botão jogava tudo fora. Tolerante a
    // corpo vazio, não-JSON ou ilegível — nesses casos mantém só o status.
    let detail = '';
    try {
      const body = await res.text();
      if (body) {
        try {
          const parsed = JSON.parse(body) as {
            code?: string;
            message?: string;
            details?: string | null;
            hint?: string | null;
          };
          detail = [parsed.code, parsed.message, parsed.details, parsed.hint]
            .filter(Boolean)
            .join(' — ');
        } catch {
          detail = body.slice(0, 300); // corpo não-JSON (HTML de proxy etc.)
        }
      }
    } catch {
      // corpo ilegível — mantém apenas o status HTTP
    }
    return {
      ok: false,
      data: null,
      error: detail ? `HTTP ${res.status} — ${detail}` : `HTTP ${res.status}`,
    };
  }
  try {
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, data: null, error: 'bad-json' };
  }
}

/** Extrai o token "Bearer ..." do cabeçalho Authorization (ou null). */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header || !/^bearer\s+/i.test(header)) return null;
  const token = header.replace(/^bearer\s+/i, '').trim();
  return token.length >= 20 ? token : null;
}

/**
 * Valida no SUPABASE (via RPC is_admin, security definer) se o token
 * pertence à conta administradora. Qualquer falha → false (painel não
 * existe para quem não é admin).
 */
export async function verifySupabaseAdmin(accessToken: string | null): Promise<boolean> {
  if (!accessToken) return false;
  const res = await callRpc<boolean>('is_admin', accessToken);
  return res.ok && res.data === true;
}

// ===== Lista de jogadores (nuvem) =====

export interface CloudPlayerRow {
  user_id: string;
  email: string | null;
  nick: string | null;
  nivel: number | null;
  xp: number | null;
  progresso: unknown;
  created_at: string | null;
}

export async function adminListCloudPlayers(accessToken: string): Promise<CloudPlayerRow[] | null> {
  const res = await callRpc<CloudPlayerRow[]>('admin_list_players', accessToken);
  if (!res.ok || !Array.isArray(res.data)) return null;
  return res.data;
}

// ===== Progresso individual (nuvem) =====

export async function adminGetCloudProgress(accessToken: string, userId: string): Promise<unknown | null> {
  const res = await callRpc<unknown>('admin_get_progress', accessToken, { p_user_id: userId });
  if (!res.ok) return null;
  return res.data ?? null;
}

export async function adminUpdateCloudProgress(
  accessToken: string,
  userId: string,
  progresso: unknown
): Promise<boolean> {
  const res = await callRpc<boolean>('admin_update_progress', accessToken, {
    p_user_id: userId,
    p_progresso: progresso,
  });
  return res.ok && res.data === true;
}

// =====================================================================
// PERSONAGENS NA NUVEM (v0.9.6 — Mudança 4: painel opera sobre personagens)
// ---------------------------------------------------------------------
// RPCs novas (ver supabase-migration-v096.sql): a lista do painel é de
// PERSONAGENS (linha por linha na tabela `personagens`); as ações agem
// sobre o personagem escolhido e são espelhadas na própria linha dele.
// Todas verificam is_admin() internamente (security definer) — token de
// não-admin não vê nem altera nada.
// =====================================================================

/** Personagem da nuvem na lista do painel (com o e-mail do dono). */
export interface CloudCharacterAdminRow {
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
}

/** Lista TODOS os personagens salvos na nuvem (uma linha por guerreiro). */
export async function adminListCloudCharacters(accessToken: string): Promise<CloudCharacterAdminRow[] | null> {
  const res = await callRpc<CloudCharacterAdminRow[]>('admin_list_personagens', accessToken);
  if (!res.ok || !Array.isArray(res.data)) return null;
  return res.data;
}

/** Lê o estado (jsonb) de UM personagem da nuvem. */
export async function adminGetCloudCharacterState(accessToken: string, characterId: string): Promise<unknown | null> {
  const res = await callRpc<unknown>('admin_get_personagem_estado', accessToken, { p_personagem_id: characterId });
  if (!res.ok) return null;
  return res.data ?? null;
}

/**
 * Upsert de uma linha COMPLETA de personagem na nuvem (espelho do estado
 * do servidor do jogo após uma ação de admin local bem-sucedida).
 */
export async function adminUpsertCloudCharacter(
  accessToken: string,
  row: {
    id: string;
    user_id: string;
    nome: string;
    raca: string;
    nivel: number;
    poder: number;
    vitorias: number;
    derrotas: number;
    ativo: boolean;
    estado: unknown;
  }
): Promise<boolean> {
  const res = await callRpc<boolean>('admin_upsert_personagem', accessToken, { p_personagem: row });
  return res.ok && res.data === true;
}

/**
 * Substitui o `estado` de um personagem que só existe na nuvem (patch
 * aplicado diretamente — valerá quando o jogador entrar) e reespelha as
 * colunas de ranking a partir do novo estado.
 */
export async function adminUpdateCloudCharacterState(
  accessToken: string,
  characterId: string,
  estado: unknown
): Promise<boolean> {
  const res = await callRpc<boolean>('admin_update_personagem_estado', accessToken, {
    p_personagem_id: characterId,
    p_estado: estado,
  });
  return res.ok && res.data === true;
}

// =====================================================================
// RESET GERAL DA NUVEM (v0.9.10.1 — botão passa a limpar a nuvem também)
// ---------------------------------------------------------------------
// RPC admin_reset_cloud (ver supabase-reset-rpc.sql — instalação ÚNICA no
// SQL Editor): backup das tabelas de jogador → apaga TODAS as linhas de
// `personagens` → limpa progresso/nível/xp dos `profiles`, tudo numa
// transação só. Verifica is_admin() internamente (security definer) — o
// mesmo modelo de confiança das demais RPCs do painel; nenhuma chave
// secreta é usada, apenas o token do próprio admin.
// =====================================================================

/** Relatório devolvido pela RPC admin_reset_cloud. */
export interface CloudResetReport {
  ok: boolean;
  personagens_apagados: number;
  perfis_limpos: number;
  backup_personagens: number;
  backup_perfis: number;
  resetado_em: string;
}

/** Resultado da limpeza da nuvem (sucesso com relatório, ou erro rotulado). */
export type CloudResetResult =
  | { ok: true; report: CloudResetReport }
  | { ok: false; error: string };

/** Traduz o erro bruto do callRpc para uma instrução acionável. */
export function explainCloudResetError(error: string): string {
  // v0.9.10.5 — o callRpc agora ANEXA o corpo do erro do PostgREST ao
  // status ("HTTP 400 — 22023 — mensagem"), então a comparação é por
  // PREFIXO, nunca por igualdade exata.
  if (error.startsWith('HTTP 404')) {
    return (
      'a RPC admin_reset_cloud NÃO está instalada no Supabase — cole o conteúdo do arquivo ' +
      'supabase-reset-rpc.sql no SQL Editor do Supabase e clique em Run (só precisa fazer isso UMA vez).'
    );
  }
  if (error === 'network') {
    return 'falha de rede ao contatar o Supabase — confira a conexão e clique no botão de reset de novo.';
  }
  if (error === 'bad-json') {
    return 'o Supabase devolveu uma resposta inesperada para admin_reset_cloud — tente de novo.';
  }
  if (error.startsWith('HTTP 403')) {
    return 'o Supabase recusou a RPC (403) — verifique se o usuário logado é o administrador e se o supabase-reset-rpc.sql foi rodado por completo.';
  }
  return `falha ao limpar a nuvem (${error}) — rode o supabase-reset-rpc.sql (versão v3 ou superior, com snapshot vazio em vez de null) no SQL Editor e tente de novo.`;
}

/**
 * Executa o reset da NUVEM via RPC admin_reset_cloud. Sempre resolve
 * (nunca lança) — quem chama decide como reportar o fracasso.
 */
export async function adminResetCloud(accessToken: string, confirm: string): Promise<CloudResetResult> {
  const res = await callRpc<CloudResetReport>('admin_reset_cloud', accessToken, { p_confirm: confirm });
  if (!res.ok) return { ok: false, error: res.error ?? 'unknown' };
  if (!res.data || res.data.ok !== true) return { ok: false, error: 'resposta-inválida' };
  return { ok: true, report: res.data };
}

// =====================================================================
// PRÉ-CHEQUE DA RPC (v0.9.10.2)
// ---------------------------------------------------------------------
// O botão de reset só pode apagar ALGUMA coisa quando a RPC da nuvem
// está instalada — sem ela o reset sai PELA METADE (servidor limpo,
// nuvem suja: o ranking continua mostrando personagens antigos, como
// na regressão relatada pelo dono). O probe chama a RPC com uma
// confirmação INVÁLIDA de propósito: a resposta identifica o estado.
// =====================================================================

export type CloudResetRpcStatus = 'ready' | 'missing' | 'unreachable' | 'error';

/**
 * Classifica a resposta do probe (função PURA — testada em
 * tests/reset-cloud.test.ts):
 *  - 'HTTP 400*' → a função EXISTE e recusou a confirmação inválida
 *    (erro 22023 'Confirmação ausente' mapeado pelo PostgREST);
 *  - 'HTTP 404*' → função NÃO instalada (rodar supabase-reset-rpc.sql);
 *  - 'network'   → Supabase inacessível neste momento;
 *  - qualquer outra coisa (incluindo sucesso inesperado) → 'error'.
 *
 * Exige código 22023 e mensagem esperada; HTTP 400 genérico não prova prontidão.
 * O callRpc anexa o corpo do
 * erro do PostgREST ao status (ex.: "HTTP 400 — 22023 — Confirmação
 * ausente — envie RESET para confirmar.").
 */
export function classifyCloudResetProbe(error: string | null): CloudResetRpcStatus {
  if (error?.startsWith('HTTP 400') && /\b22023\b/.test(error) && error.includes('Confirmação ausente')) return 'ready';
  if (error?.startsWith('HTTP 404')) return 'missing';
  if (error === 'network') return 'unreachable';
  return 'error';
}

/**
 * Descobre SE a RPC admin_reset_cloud está instalada — sem executar o
 * reset. Sempre resolve; quem chama decide abortar ou prosseguir.
 */
export async function cloudResetRpcStatus(accessToken: string): Promise<CloudResetRpcStatus> {
  const res = await callRpc<unknown>('admin_reset_cloud', accessToken, { p_confirm: '__PROBE__' });
  if (res.ok) return 'error'; // sucesso com confirmação inválida = resposta inesperada
  return classifyCloudResetProbe(res.error ?? null);
}

/** Mensagem acionável para cada estado do pré-cheque (nada foi apagado). */
export function explainCloudResetProbe(status: CloudResetRpcStatus): string {
  switch (status) {
    case 'missing':
      return (
        'NADA foi apagado. A RPC admin_reset_cloud NÃO está instalada no Supabase — sem ela o reset ' +
        'sairia pela metade (servidor limpo, nuvem suja: o ranking continuaria mostrando personagens ' +
        'antigos). Cole o conteúdo do supabase-reset-rpc.sql no SQL Editor do Supabase, clique em Run ' +
        '(instalação única) e então clique no botão de reset de novo.'
      );
    case 'unreachable':
      return 'NADA foi apagado. O Supabase está inacessível agora (falha de rede) — confira a conexão e clique no botão de reset de novo.';
    default:
      return 'NADA foi apagado. Não foi possível confirmar a RPC admin_reset_cloud no Supabase — tente de novo em instantes.';
  }
}

// =====================================================================
// IDENTIDADE DA SESSÃO
// ---------------------------------------------------------------------
// O e-mail da sessão autenticada é resolvido consultando /auth/v1/user.
// A autorização já foi concluída por public.is_admin() no Supabase; aqui
// o e-mail serve apenas para auditoria das ações administrativas.
// =====================================================================

export interface SupabaseUserIdentity {
  id: string;
  email: string | null;
}

/** Resolve id + e-mail da conta dona do token (null em qualquer falha). */
export async function resolveSupabaseUser(accessToken: string): Promise<SupabaseUserIdentity | null> {
  let res: Response;
  try {
    res = await fetch(supabaseUserEndpoint(), {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const user = (await res.json()) as { id?: string; email?: string | null };
    if (!user?.id) return null;
    return { id: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}

// =====================================================================
// GUARDA DAS AÇÕES ADMINISTRATIVAS
// ---------------------------------------------------------------------
// Fonte única: public.is_admin() no Supabase, que valida o auth.uid() do
// Bearer token contra public.admins através de auth.users.
// Sem token → 404; token autenticado sem privilégio admin → 403.
// =====================================================================

export type PanelAdminGuard =
  | { ok: true; token: string; email: string; supabaseUserId: string }
  | { ok: false; status: 404 | 403; code: 'NOT_FOUND' | 'FORBIDDEN'; message: string };

/**
 * Valida as DUAS barreiras das ações destrutivas do painel. Nunca
 * lança — quem chama decide como responder (404/403).
 */
export async function requirePanelAdmin(request: Request): Promise<PanelAdminGuard> {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Não encontrado.' };
  }
  const isAdmin = await verifySupabaseAdmin(token);
  if (!isAdmin) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Ação administrativa restrita.' };
  }
  const user = await resolveSupabaseUser(token);
  if (!user || !user.email) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Não foi possível validar a identidade administrativa.' };
  }
  return { ok: true, token, email: user.email, supabaseUserId: user.id };
}

// =====================================================================
// EXCLUSÃO DE PERSONAGEM ÚNICO NA NUVEM (v0.14)
// ---------------------------------------------------------------------
// RPC admin_delete_personagem (ver supabase-admin-delete.sql —
// instalação ÚNICA no SQL Editor): backup do alvo em
// personagens_backup_reset (a MESMA tabela do admin_reset_cloud) →
// apaga SÓ a linha do alvo, JAMAIS a nuvem inteira. A confirmação
// (nome digitado pelo admin) é revalidada NA PONTA — o Postgres só
// apaga se o nome bater com o da linha.
// =====================================================================

/** Relatório devolvido pela RPC admin_delete_personagem. */
export interface CloudDeleteReport {
  ok: boolean;
  personagens_apagados: number;
  backup_personagens: number;
  nome?: string;
  observacao?: string;
}

export type CloudDeleteResult =
  | { ok: true; report: CloudDeleteReport }
  | { ok: false; error: string };

/**
 * Apaga na NUVEM o espelho de UM personagem (só o alvo, nunca tudo).
 * Sempre resolve (nunca lança) — quem chama decide como reportar.
 */
export async function adminDeleteCloudCharacter(
  accessToken: string,
  characterId: string,
  confirmName: string
): Promise<CloudDeleteResult> {
  const res = await callRpc<CloudDeleteReport>('admin_delete_personagem', accessToken, {
    p_personagem_id: characterId,
    p_confirm_nome: confirmName,
  });
  if (!res.ok) return { ok: false, error: res.error ?? 'unknown' };
  if (!res.data || res.data.ok !== true) return { ok: false, error: 'resposta-inválida' };
  return { ok: true, report: res.data };
}

/** Estado do pré-cheque da RPC de exclusão (o padrão do reset, reusado). */
export type CloudDeleteRpcStatus = 'ready' | 'missing' | 'unreachable' | 'error';

/**
 * Descobre SE a RPC admin_delete_personagem está instalada — sem apagar
 * nada. O probe omite a confirmação de propósito: função instalada →
 * HTTP 400 (22023 "Confirmação ausente"); função ausente → HTTP 404.
 */
export async function cloudDeleteRpcStatus(accessToken: string): Promise<CloudDeleteRpcStatus> {
  const res = await callRpc<unknown>('admin_delete_personagem', accessToken, {
    // Non-UUID string deliberately detects the obsolete UUID overload.
    p_personagem_id: '__probe_cuid_text__',
  });
  if (res.ok) return 'error'; // sucesso sem confirmação = resposta inesperada
  return classifyCloudResetProbe(res.error ?? null);
}

/** Instrução acionável quando o pré-cheque da exclusão falha (nada foi apagado). */
export function explainCloudDeleteProbe(status: CloudDeleteRpcStatus): string {
  switch (status) {
    case 'missing':
      return (
        'NADA foi apagado. A RPC admin_delete_personagem NÃO está instalada no Supabase — sem ela a ' +
        'exclusão sairia pela metade (personagem apagado no servidor, espelho vivo na nuvem: ele ' +
        'voltaria no próximo login do dono). Cole o conteúdo do supabase-admin-delete.sql no SQL ' +
        'Editor do Supabase, clique em Run (instalação única) e tente excluir de novo.'
      );
    case 'unreachable':
      return 'NADA foi apagado. O Supabase está inacessível agora (falha de rede) — confira a conexão e tente excluir de novo.';
    default:
      return 'NADA foi apagado. Não foi possível confirmar a RPC admin_delete_personagem no Supabase — tente de novo em instantes.';
  }
}
