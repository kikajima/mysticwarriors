// =====================================================================
// Supabase — configuração pública de Auth/Storage
// ---------------------------------------------------------------------
// SOMENTE URL e chave PUBLICÁVEL (anon/publishable) podem chegar ao bundle.
// Nunca use service_role, secret keys ou credenciais de banco em NEXT_PUBLIC_*.
//
// Em produção as variáveis são OBRIGATÓRIAS. Não existe fallback para um
// projeto real: um deploy mal configurado falha alto em vez de apontar
// silenciosamente para outra base.
// =====================================================================

function publicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[config] ${name} é obrigatório em produção.`);
  }

  return name === 'NEXT_PUBLIC_SUPABASE_URL'
    ? 'http://127.0.0.1:54321'
    : 'local-dev-publishable-key';
}

export const SUPABASE_URL = publicEnv('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_PUBLISHABLE_KEY = publicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

/**
 * Versão do contrato de progresso na nuvem.
 * Vive aqui (módulo neutro, sem imports do jogo) para poder ser importado
 * tanto pelo servidor quanto pelo bundle do navegador.
 *
 * v2 (v0.9.4): personagens carregam missionId/missionEndsAt (turno em
 * andamento), quests[] do período atual, achievementsClaimed[] e os
 * relógios de regeneração. Snapshots v1 continuam restaurando normalmente
 * (campos ausentes viram valores padrão na sanitização).
 *
 * v3 (v0.9.6 — Mudança 3): cada personagem é uma LINHA própria na tabela
 * `personagens` do Supabase (coluna estado = CloudCharacterSnapshot) e
 * carrega o próprio `id` + a própria lista `cosmeticsOwned` — a CONTA
 * deixou de ser dona de qualquer valor de jogo. Snapshots v2 (formato
 * antigo, cosméticos no nível da conta) continuam restaurando: a lista
 * da conta é DUPLICADA para cada personagem, como na migração SQL.
 */
export const CLOUD_PROGRESS_VERSION = 3;

/** Endpoint de validação de token de usuário (chave publicável apenas). */
export function supabaseUserEndpoint(): string {
  return `${SUPABASE_URL}/auth/v1/user`;
}
