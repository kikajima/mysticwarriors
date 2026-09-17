// =====================================================================
// Supabase — configuração (CONTAS NA NUVEM, v0.8)
// ---------------------------------------------------------------------
// SEGURANÇA: usa APENAS a chave PUBLICÁVEL (publishable/anon). A chave
// secreta (service_role) NÃO existe neste projeto por decisão de
// arquitetura — o servidor valida tokens de usuário chamando o endpoint
// público /auth/v1/user do Supabase, sem precisar de segredo algum.
//
// As variáveis NEXT_PUBLIC_* são inlined no bundle em build time. Os
// fallbacks garantem que o jogo funcione mesmo que o .env não acompanhe
// o ambiente de build (chave publicável é, por design, pública).
//
// 2026 — NOVA BASE (a pedido do dono, para não misturar com o projeto
// antigo): zkocvbovcwhwdmhwruja. O schema desta base nasce do script
// supabase-instalacao-nova-base.sql (instalação única no SQL Editor).
// =====================================================================

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://zkocvbovcwhwdmhwruja.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_SqnRASBW52AGDQsQgjSa2A_cztQn02n';

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
