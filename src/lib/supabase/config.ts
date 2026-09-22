// =====================================================================
// Supabase — configuração pública
// ---------------------------------------------------------------------
// Usa SOMENTE as credenciais PUBLICÁVEIS do cliente Supabase.
// Nunca mantenha service_role, chaves privadas ou segredos aqui.
//
// NEXT_PUBLIC_* é inlined no bundle do navegador durante `next build`.
// Por isso as referências abaixo precisam ser ESTÁTICAS
// (process.env.NEXT_PUBLIC_...), nunca process.env[name].
//
// Em produção/dev elas são obrigatórias e devem existir ANTES do build.
// Testes unitários usam placeholders neutros, nunca um projeto real.
// =====================================================================

function requiredPublicEnv(
  name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  value: string | undefined,
): string {
  const normalized = value?.trim();
  if (normalized) return normalized;

  if (process.env.NODE_ENV === 'test') {
    return name === 'NEXT_PUBLIC_SUPABASE_URL'
      ? 'https://example.supabase.co'
      : 'test-publishable-placeholder';
  }

  throw new Error(`Variável obrigatória ausente: ${name}`);
}

export const SUPABASE_URL = requiredPublicEnv(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_PUBLISHABLE_KEY = requiredPublicEnv(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

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
