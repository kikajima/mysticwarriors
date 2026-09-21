// =====================================================================
// Supabase — configuração pública
// ---------------------------------------------------------------------
// Usa SOMENTE as credenciais PUBLICÁVEIS do cliente Supabase.
// Nunca mantenha service_role, chaves privadas ou segredos aqui.
//
// As variáveis NEXT_PUBLIC_* são inlined no bundle em build time.
// Em produção/dev elas são obrigatórias: não existe fallback para um
// projeto real, evitando acoplamento e exposição acidental.
// =====================================================================

function requiredPublicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  // Testes unitários e a fase de build não precisam tocar no Supabase.
  // Use placeholders neutros, nunca credenciais/projeto reais.
  if (process.env.NODE_ENV === 'test' || process.env.MW_BUILD_PHASE === '1') {
    return name === 'NEXT_PUBLIC_SUPABASE_URL'
      ? 'https://example.supabase.co'
      : 'test-publishable-placeholder';
  }

  throw new Error(`Variável obrigatória ausente: ${name}`);
}

export const SUPABASE_URL = requiredPublicEnv('NEXT_PUBLIC_SUPABASE_URL');

export const SUPABASE_PUBLISHABLE_KEY = requiredPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

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
