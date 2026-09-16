import { ok, toErrorResponse } from '@/lib/api';
import { getPublicRanking } from '@/lib/supabase/ranking';

// =====================================================================
// GET /api/ranking/public — lista para a tabela viva da página /ranking
// ---------------------------------------------------------------------
// v0.9.5: alimenta a atualização automática do navegador (abertura +
// cada 60s). Sem login — devolve SOMENTE o que o ranking público pode
// expor: posição, nome, raça, nível, poder, vitórias e derrotas.
// Nuvem primeiro (todos os personagens salvos no Supabase); se a nuvem
// falhar, reserva do servidor (logada no console — nunca silenciosa).
// =====================================================================
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ranking = await getPublicRanking(25);
    return ok({ ranking });
  } catch (error) {
    return toErrorResponse(error);
  }
}
