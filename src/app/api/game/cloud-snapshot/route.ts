import { db } from '@/lib/db';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { ApiError, toErrorResponse, ok } from '@/lib/api';
import { serializeCharacterForCloud } from '@/lib/supabase/progress';
import { collectCharacterExtras } from '@/lib/supabase/progress-server';
import { computeDerived } from '@/lib/game/engine';
import { syncAuthoritativeCloudCharacters } from '@/lib/supabase/serverCloud';

// =====================================================================
// GET /api/game/cloud-snapshot[?playerId=...] — personagens para a nuvem
// ---------------------------------------------------------------------
// v0.9.6 (Mudança 3): produz UMA LINHA POR PERSONAGEM para a tabela
// `personagens` do Supabase (id = id do personagem no servidor do jogo,
// user_id = dono, estado = snapshot v3 completo, colunas espelhadas para
// o ranking público). O cliente apenas TRANSPORTA estas linhas com a
// própria sessão (RLS: só as próprias linhas podem ser gravadas).
//
// playerId é OPCIONAL: sem ele, a lista da CONTA inteira é devolvida —
// usado p/ sincronizar após EXCLUIR um personagem (a tela de seleção não
// tem personagem ativo, mas a nuvem precisa esquecer a linha excluída).
//
// A CONTA (profiles) deixou de carregar progresso — nada de valor de jogo
// pertence a ela desde a v0.9.6.
// =====================================================================

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') ?? '';
    // posse validada SOMENTE quando um personagem específico é pedido
    if (playerId) await requirePlayer(auth, playerId);

    if (!auth.account.supabaseUserId) {
      throw new ApiError('FORBIDDEN', 'Esta conta ainda não está vinculada à nuvem.');
    }

    const characters = await db.player.findMany({
      where: { accountId: auth.account.id, isBot: false },
      orderBy: { createdAt: 'asc' },
    });

    // v0.9.4 — quests do período atual + conquistas coletadas de cada
    // personagem (o que antes morria com o banco local agora viaja na nuvem)
    const extras = await collectCharacterExtras(characters.map((c) => c.id));

    const rows = characters.map((p) => {
      const derived = computeDerived(p);
      return {
        id: p.id,
        nome: p.name,
        raca: p.race,
        nivel: p.level,
        // poder oficial do Visor de Fluxo (mesma fórmula da ficha do jogador)
        poder: derived.power,
        vitorias: p.battlesWon,
        derrotas: p.battlesLost,
        ativo: p.id === auth.account.activePlayerId,
        estado: serializeCharacterForCloud(p, extras.get(p.id)),
      };
    });

    const cloudSynced = await syncAuthoritativeCloudCharacters(auth.account.supabaseUserId, rows);
    if (!cloudSynced) {
      throw new ApiError('PRECONDITION_FAILED', 'Sincronização autoritativa da nuvem indisponível neste ambiente.');
    }

    return ok({
      cloudSynced: true,
      // exibição apenas — o ativo da conta (ou o primeiro) serve de rosto
      nick: auth.account.username ?? characters[0]?.name ?? 'guerreiro',
      nivel: characters[0]?.level ?? 1,
      xp: characters[0]?.xp ?? 0,
      personagens: rows,
      // contagem incluída para o cliente decidir se precisa restaurar
      characterCount: rows.length,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
