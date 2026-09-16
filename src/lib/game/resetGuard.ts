// =====================================================================
// GUARDA ANTI-RESSURREIÇÃO PÓS-RESET — checagem de timestamps (v0.9.10.1)
// ---------------------------------------------------------------------
// O reset geral do servidor apaga o banco SQLite, mas cada personagem
// também vive como UMA LINHA da tabela `personagens` do Supabase (espelho
// da nuvem usado pelo cloud-restore e pelo ranking público). A linha
// carrega a coluna `atualizado_em` (timestamptz, mantida por trigger).
//
// REGRA: depois de um reset geral (GameMeta.serverResetAt definido), um
// snapshot da nuvem cujo `atualizado_em` seja ANTERIOR ao marcador é
// PRÉ-RESET — jamais pode ressuscitar um personagem no servidor limpo.
// Sem marcador (banco nunca resetado) tudo segue como antes.
//
// Funções PURAS (sem banco, sem fetch) — testadas em tests/reset-cloud.test.ts
// e usadas pelo /api/game/cloud-restore.
// =====================================================================

/** Linha mínima que participa do filtro de staleness. */
export interface TimestampedCloudRow {
  atualizadoEm: unknown;
}

/**
 * Uma linha da nuvem está "velha" (pré-reset)?
 *  - sem marcador de reset no servidor → NUNCA (comportamento normal);
 *  - com marcador: sem timestamp, timestamp inválido ou anterior ao
 *    marcador → VELHA (descartada); igual/posterior ao marcador → ok.
 */
export function isStaleAfterReset(atualizadoEm: unknown, serverResetAt: string | null | undefined): boolean {
  if (!serverResetAt) return false;
  if (typeof atualizadoEm !== 'string' || atualizadoEm.length === 0) return true;
  const rowTime = Date.parse(atualizadoEm);
  const resetTime = Date.parse(serverResetAt);
  if (Number.isNaN(rowTime) || Number.isNaN(resetTime)) return true;
  // estritamente anterior ao reset = pré-reset (igual ao ms do reset é aceito — caso extremo inofensivo)
  return rowTime < resetTime;
}

/**
 * Filtra as linhas válidas após um eventual reset. Devolve as que
 * sobrevivem e quantas foram descartadas (para o log — nada some em
 * silêncio).
 */
export function filterStaleRows<T extends TimestampedCloudRow>(
  rows: T[],
  serverResetAt: string | null | undefined
): { kept: T[]; dropped: number } {
  if (!serverResetAt) return { kept: rows, dropped: 0 };
  const kept = rows.filter((r) => !isStaleAfterReset(r.atualizadoEm, serverResetAt));
  return { kept, dropped: rows.length - kept.length };
}
