// =====================================================================
// Supabase — cliente do navegador (v0.8)
// ---------------------------------------------------------------------
// Único ponto do front-end que fala com o Supabase. Todas as chamadas
// usam a sessão DO PRÓPRIO USUÁRIO (RLS respeitado): a leitura e a
// escrita em `profiles` só são possíveis para o dono da linha.
//
// O jogo em si continua 100% servido pelo backend Next.js (Prisma);
// este módulo cuida de: identidade (Auth), leitura do progresso salvo
// e upsert do snapshot produzido pelo servidor do jogo.
// =====================================================================

import { createClient, type SupabaseClient, type Session, type User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config';
import type { CloudCharacterSnapshot, CloudProgress } from './progress';

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'gm-supabase-auth',
      },
    });
  }
  return cached;
}

// ===== Sessão =====

export async function getSupabaseSession(): Promise<Session | null> {
  try {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function getSupabaseUser(): Promise<User | null> {
  const session = await getSupabaseSession();
  return session?.user ?? null;
}

// ===== Cadastro / login / logout =====

export interface SignUpInput {
  email: string;
  password: string;
  nick: string;
}

export type AuthOutcome =
  | { status: 'session'; session: Session }
  | { status: 'confirm-email' }
  | {
      status: 'error';
      message: string;
      /** O serviço de contas pediu espera (429) ou o endereço já existe. */
      kind?: 'rate-limit' | 'existing-account';
      /** Segundos sugeridos antes da próxima tentativa. */
      retryInSeconds?: number;
    };

/**
 * O Supabase exige ~60s entre pedidos de cadastro e limita o envio de
 * e-mails de confirmação por hora. Esta trava local espelha a primeira
 * regra: cliques/Enters repetidos jamais viram vários cadastros — o
 * jogador vê uma contagem regressiva em vez de um erro 429.
 */
const SIGNUP_MIN_INTERVAL_MS = 60_000;
const SIGNUP_COOLDOWN_KEY = 'gm-signup-last-at';

function lastSignUpAt(): number {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.localStorage.getItem(SIGNUP_COOLDOWN_KEY));
  return Number.isFinite(value) ? value : 0;
}

function markSignUpAttempt(): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(SIGNUP_COOLDOWN_KEY, String(Date.now()));
}

/**
 * Cadastro via supabase.auth.signUp() com o nick nos metadados.
 * Devolve 'confirm-email' quando o projeto exige confirmação de e-mail
 * (nenhuma sessão é devolvida até o usuário clicar no link recebido).
 */
export async function supabaseSignUp({ email, password, nick }: SignUpInput): Promise<AuthOutcome> {
  const now = Date.now();
  const elapsed = now - lastSignUpAt();
  if (elapsed < SIGNUP_MIN_INTERVAL_MS) {
    const wait = Math.max(1, Math.ceil((SIGNUP_MIN_INTERVAL_MS - elapsed) / 1000));
    return {
      status: 'error',
      message: `Calma, guerreiro! Aguarde ${wait} segundo(s) antes de tentar criar a conta de novo.`,
      kind: 'rate-limit',
      retryInSeconds: wait,
    };
  }

  try {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: { data: { nick } },
    });
    // o pedido realmente chegou ao Supabase — conta para a trava de 60s
    // (falhas de conexão acima não caem aqui e não travam novas tentativas)
    markSignUpAttempt();
    if (error) {
      const translated = translateSupabaseAuthError(error);
      return {
        status: 'error',
        message: translated.message,
        kind: translated.kind,
        retryInSeconds: translated.retryInSeconds,
      };
    }
    if (data.session) return { status: 'session', session: data.session };
    return { status: 'confirm-email' };
  } catch {
    return { status: 'error', message: 'Falha de conexão com o servidor de contas. Tente novamente.' };
  }
}

export async function supabaseSignIn(email: string, password: string): Promise<AuthOutcome> {
  try {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) {
      const translated = translateSupabaseAuthError(error);
      return {
        status: 'error',
        message: translated.message,
        kind: translated.kind,
        retryInSeconds: translated.retryInSeconds,
      };
    }
    if (data.session) return { status: 'session', session: data.session };
    return { status: 'error', message: 'Não foi possível entrar. Tente novamente.' };
  } catch {
    return { status: 'error', message: 'Falha de conexão com o servidor de contas. Tente novamente.' };
  }
}

export async function supabaseSignOut(): Promise<void> {
  try {
    await getSupabaseClient().auth.signOut();
  } catch {
    // segue o logout local mesmo se o servidor de contas não responder
  }
}

// ===== Admin (v0.9) =====

/**
 * Consulta o SUPABASE (RPC is_admin — security definer) se a conta logada
 * é a administradora. A comparação de e-mail acontece DENTRO do Supabase,
 * na tabela `admins` — o jogo não embute nenhum endereço no código.
 * Qualquer erro (função ainda não criada, rede, sessão ausente) → false:
 * para quem não é admin, o painel simplesmente não existe.
 */
export async function supabaseIsAdmin(): Promise<boolean> {
  // Duas tentativas: falhas de rede são transitórias (a resposta de admin
  // não pode se perder por um soluço de conexão). Erro definitivo do
  // Supabase — ex.: função inexistente porque o SQL do painel ainda não
  // foi instalado — retorna false na hora, sem retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await getSupabaseClient().rpc('is_admin');
      if (!error) return data === true;
      if (error.code === 'PGRST202' || error.code === '404') return false;
      // TEMPORÁRIO (diagnóstico v0.9.3): erro inesperado não passa em branco
      console.warn('[nuvem] falha ao verificar admin:', error.code, error.message);
    } catch {
      // rede instável → tenta de novo
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return false;
}

// ===== Avatar no Supabase Storage (v0.9.4) =====

/**
 * Envia a imagem do avatar DIRETO para o bucket público "avatars" do
 * Supabase (pasta exclusiva do usuário logado: "{userId}/avatar-....jpg")
 * e devolve a URL pública. A imagem passa a viver NA NUVEM — sobrevive a
 * qualquer limpeza do servidor do jogo — e a URL é gravada no personagem
 * (via /api/game/avatar, modo 'storage'), entrando no snapshot da conta.
 *
 * Requer sessão logada (convidados não usam Storage). Qualquer falha é
 * logada no console e devolve null — quem chama cai no upload antigo.
 */
export async function uploadAvatarToStorage(file: File): Promise<string | null> {
  const session = await getSupabaseSession();
  if (!session) return null;
  try {
    const ext =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await getSupabaseClient().storage.from('avatars').upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (error) {
      // TEMPORÁRIO (diagnóstico v0.9.4): nenhuma falha é silenciosa
      console.error(
        '[nuvem] FALHA no upload do avatar (Storage) —',
        JSON.stringify({ message: error.message })
      );
      return null;
    }
    const { data } = getSupabaseClient().storage.from('avatars').getPublicUrl(path);
    if (!data?.publicUrl) {
      console.error('[nuvem] FALHA no upload do avatar — URL pública indisponível');
      return null;
    }
    return data.publicUrl;
  } catch (err) {
    console.error('[nuvem] FALHA no upload do avatar (exceção) —', err);
    return null;
  }
}

// ===== Erros amigáveis (códigos reais do projeto Supabase) =====

export interface TranslatedAuthError {
  message: string;
  /** "rate-limit": o serviço de contas pediu espera (429). */
  kind?: 'rate-limit';
  /** Segundos sugeridos antes da próxima tentativa. */
  retryInSeconds?: number;
}

export function translateSupabaseAuthError(error: {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}): TranslatedAuthError {
  const code = error.code ?? '';
  const msg = error.message ?? '';

  switch (code) {
    case 'invalid_credentials':
      return { message: 'E-mail ou senha incorretos. Confira e tente de novo.' };
    case 'email_not_confirmed':
      return {
        message:
          'Seu e-mail ainda não foi confirmado. Abra o link que enviamos para você (procure também no spam) e depois entre.',
      };
    case 'user_already_registered':
      return {
        message: 'Este e-mail já tem uma conta. Vamos abrir a tela de login para você entrar.',
        kind: 'existing-account',
      };
    case 'weak_password':
      return { message: 'A senha precisa ter pelo menos 8 caracteres.' };
    case 'over_email_send_rate_limit':
      return {
        message:
          'Este cadastro já foi enviado ou o serviço de contas está temporariamente limitando novos e-mails. Confira sua caixa de entrada e, se a conta já existir, use "Entrar". Não é necessário cadastrar novamente.',
        kind: 'rate-limit',
        retryInSeconds: 300,
      };
    case 'over_request_rate_limit':
      return {
        message: 'Muitas tentativas em pouco tempo. Aguarde cerca de 1 minuto e tente de novo.',
        kind: 'rate-limit',
        retryInSeconds: 60,
      };
    case 'email_address_invalid':
      return { message: 'Este e-mail não parece válido. Confira o endereço digitado.' };
    case 'user_banned':
      return { message: 'Esta conta está bloqueada. Fale com o suporte.' };
    case 'validation_failed':
      return { message: 'Dados inválidos. Confira e-mail, senha e apelido.' };
    default:
      break;
  }

  // mensagens legadas (sem error_code)
  if (/already registered/i.test(msg))
    return { message: 'Este e-mail já tem conta. Use "Entrar" para acessar.' };
  if (/at least 6 characters/i.test(msg)) return { message: 'A senha precisa ter pelo menos 8 caracteres.' };
  if (/invalid login credentials/i.test(msg))
    return { message: 'E-mail ou senha incorretos. Confira e tente de novo.' };
  if (/email not confirmed/i.test(msg)) {
    return {
      message:
        'Seu e-mail ainda não foi confirmado. Abra o link que enviamos para você (procure também no spam) e depois entre.',
    };
  }
  if (/rate limit/i.test(msg) || error.status === 429) {
    return {
      message: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.',
      kind: 'rate-limit',
      retryInSeconds: 60,
    };
  }

  return { message: 'Não foi possível continuar agora. Tente novamente em instantes.' };
}

// ===== Perfil na nuvem (tabela `profiles`) =====

export interface CloudProfileRow {
  nick: string | null;
  nivel: number | null;
  xp: number | null;
  progresso: CloudProgress | null;
}

/** Lê o perfil do usuário logado (RLS garante que só o dono enxergue). */
export async function loadCloudProfile(): Promise<CloudProfileRow | null> {
  const session = await getSupabaseSession();
  if (!session) return null;
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('nick, nivel, xp, progresso')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) {
    // TEMPORÁRIO (diagnóstico v0.9.3): falha de leitura da nuvem JAMAIS é
    // silenciosa — código, mensagem e dica do Postgres vão par no console.
    console.error(
      '[nuvem] FALHA ao LER o perfil salvo na nuvem —',
      JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
    );
    return null;
  }
  if (!data) return null;
  return {
    nick: data.nick ?? null,
    nivel: data.nivel ?? null,
    xp: data.xp ?? null,
    progresso: (data.progresso as CloudProgress | null) ?? null,
  };
}

/**
 * Upsert do perfil (id do usuário logado). Falhas não interrompem o jogo:
 * o save é tentado novamente na próxima mudança relevante.
 *
 * v0.9.6: usado apenas para manter nick/nível de exibição da CONTA — o
 * progresso do jogo em si vive na tabela `personagens` (uma linha por
 * personagem, dono = user_id).
 */
export async function upsertCloudProfile(profile: {
  nick: string;
  nivel: number;
  xp: number;
  progresso: CloudProgress;
}): Promise<boolean> {
  const session = await getSupabaseSession();
  if (!session) return false;
  const { error } = await getSupabaseClient()
    .from('profiles')
    .upsert(
      {
        id: session.user.id,
        nick: profile.nick,
        nivel: profile.nivel,
        xp: profile.xp,
        progresso: profile.progresso,
      },
      { onConflict: 'id' }
    );
  if (error) {
    // TEMPORÁRIO (diagnóstico v0.9.3): o erro completo (código + dica do
    // Postgres) aparece no console — nenhuma gravação falha em silêncio.
    console.error(
      '[nuvem] FALHA ao SALVAR o progresso na nuvem —',
      JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
    );
    return false;
  }
  // confirmação visível para o teste de verificação do dono
  console.info(
    `[nuvem] progresso salvo \u2713 ${profile.progresso?.characters?.length ?? 0} guerreiro(s), nick "${profile.nick}", nível ${profile.nivel}`
  );
  return true;
}

// =====================================================================
// PERSONAGENS NA NUVEM (v0.9.6 — Mudança 3)
// ---------------------------------------------------------------------
// A CONTA (profiles) ficou apenas com o login. Cada PERSONAGEM é uma
// linha própria na tabela `personagens`:
//   id          = id do personagem no servidor do jogo (chave estável —
//                 o mesmo nas duas pontas; nunca duplica);
//   user_id     = dono (auth.uid()) — RLS só deixa tocar nas próprias;
//   estado      = snapshot completo DO personagem (CloudCharacterSnapshot
//                 v3, gerado pelo servidor do jogo);
//   nome/raca/nivel/poder/vitorias/derrotas = colunas espelhadas para o
//                 ranking público calcular direto no Postgres (RPC).
// =====================================================================

/** Linha de personagem pronta para upsert (o servidor do jogo constrói). */
export interface CloudCharacterRow {
  id: string;
  nome: string;
  raca: string;
  nivel: number;
  poder: number;
  vitorias: number;
  derrotas: number;
  ativo: boolean;
  estado: CloudCharacterSnapshot;
}

/** Linha de personagem lida da nuvem (mesma forma + datas). */
export interface CloudCharacterReadRow extends CloudCharacterRow {
  criado_em: string | null;
  atualizado_em: string | null;
}

function logCloudError(prefix: string, error: { code?: string; message?: string; details?: unknown; hint?: unknown }) {
  console.error(
    `${prefix} —`,
    JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint })
  );
}

/**
 * Lê TODOS os personagens da conta logada (RLS: user_id = auth.uid()).
 * Devolve:
 *  - { rows } em sucesso (pode ser lista vazia — conta nova);
 *  - { rows: null } quando a tabela ainda não existe (SQL v0.9.6 não
 *    aplicado) — quem chama cai no formato antigo (profiles.progresso);
 *  - { rows: [] } em outros erros, LOGADOS (nunca silenciosos).
 */
export async function loadCloudCharacters(): Promise<{ rows: CloudCharacterReadRow[] | null }> {
  const session = await getSupabaseSession();
  if (!session) return { rows: [] };
  const { data, error } = await getSupabaseClient()
    .from('personagens')
    .select('id, nome, raca, nivel, poder, vitorias, derrotas, ativo, estado, criado_em, atualizado_em')
    .eq('user_id', session.user.id)
    .order('criado_em', { ascending: true });
  if (error) {
    // 42P01 = tabela não existe; PGRST205 = schema/tabela não encontrada
    // na API → o dono ainda não colou o SQL da v0.9.6 (transição normal).
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.warn('[nuvem] tabela personagens ainda não existe (SQL v0.9.6 pendente) — usando formato antigo');
      return { rows: null };
    }
    logCloudError('[nuvem] FALHA ao LER os personagens da nuvem', error);
    return { rows: [] };
  }
  return { rows: (data as CloudCharacterReadRow[]) ?? [] };
}

/**
 * Salva (upsert) os personagens da conta — cada um na PRÓPRIA linha.
 * RLS garante que só as linhas do próprio usuário podem ser gravadas.
 * Falhas são logadas e devolvem false (o auto-save retenta depois).
 */
export async function upsertCloudCharacters(rows: CloudCharacterRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const session = await getSupabaseSession();
  if (!session) return false;
  const { error } = await getSupabaseClient()
    .from('personagens')
    .upsert(
      rows.map((r) => ({ ...r, user_id: session.user.id })),
      { onConflict: 'id' }
    );
  if (error) {
    logCloudError('[nuvem] FALHA ao SALVAR os personagens na nuvem', error);
    return false;
  }
  console.info(`[nuvem] personagens salvos \u2713 ${rows.length} guerreiro(s) — ${rows.map((r) => r.nome).join(', ')}`);
  return true;
}

/**
 * Remove da nuvem as linhas da própria conta que NÃO estão na lista de ids
 * atuais (personagem excluído no servidor, ou linha migrada de outro
 * formato na transição para a v0.9.6). Roda só DEPOIS de um upsert bem-
 * sucedido — a lista atual sempre existe no banco do jogo antes.
 */
export async function deleteStaleCloudCharacters(keepIds: string[]): Promise<boolean> {
  const session = await getSupabaseSession();
  if (!session) return false;
  const query = getSupabaseClient()
    .from('personagens')
    .delete()
    .eq('user_id', session.user.id);
  // lista vazia = todos os personagens locais sumiram → limpa tudo
  const filtered = keepIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 64);
  if (filtered.length > 0) {
    // sintaxe "not in" do PostgREST: valores entre parênteses e separados
    // por vírgula; ids são cuids do servidor (sem vírgulas/aspas)
    void query.not('id', 'in', `(${filtered.join(',')})`);
  }
  const { error } = await query;
  if (error) {
    logCloudError('[nuvem] FALHA ao LIMPAR personagens antigos da nuvem', error);
    return false;
  }
  return true;
}

/**
 * Garante que a CONTA tenha linha em `profiles` com o nick (login).
 * v0.9.6: o gatilho de cadastro já faz isso no Supabase — esta chamada é
 * a rede de segurança para contas criadas fora do fluxo padrão. Não grava
 * mais `progresso` (nada de jogo pertence à conta).
 */
export async function ensureCloudProfileNick(nick: string): Promise<boolean> {
  const session = await getSupabaseSession();
  if (!session) return false;
  const { error } = await getSupabaseClient()
    .from('profiles')
    .upsert({ id: session.user.id, nick }, { onConflict: 'id' });
  if (error) {
    logCloudError('[nuvem] FALHA ao gravar o nick do perfil', error);
    return false;
  }
  return true;
}
