import { db } from '@/lib/db';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { requireAuth, requirePlayer } from '@/lib/auth';
import { LIMITS, rateLimit } from '@/lib/rate-limit';
import { trackEvent } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =====================================================================
// DELETE /api/game/character/[playerId] — exclusão de personagem
// ---------------------------------------------------------------------
// Proteção de contas existentes:
//  * Sessão obrigatória (401) + posse central via requirePlayer (403 se o
//    personagem pertence a outra conta — playerId nunca autoriza nada);
//  * v0.6: QUALQUER personagem pode ser excluído — inclusive o último.
//    A CONTA em si nunca é apagada; sem personagens, o jogador é levado
//    direto à criação de um novo guerreiro;
//  * Guilda: se era líder com outros membros → liderança transferida ao
//    membro mais antigo; se estava sozinho → guilda dissolvida;
//  * Tabelas dependentes caem em CASCATA dentro da transação
//    (ledger, quests, conquistas, dano de boss, ranking de temporada,
//    doações, dedup) — o banco nunca fica inconsistente.
// =====================================================================

export async function DELETE(request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  try {
    const auth = await requireAuth();

    const rl = rateLimit(`delete-char:${auth.session.id}`, LIMITS.deleteCharacter.limit, LIMITS.deleteCharacter.windowMs);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas exclusões em sequência. Aguarde um minuto.');

    const { playerId } = await params;

    // AUTORIZAÇÃO CENTRAL: personagem precisa pertencer à conta da sessão.
    // 404 se não existe (ou é bot), 403 se é de outro jogador.
    const player = await requirePlayer(auth, playerId);

    await db.$transaction(
      async (tx) => {
        // ===== Guilda: transferência de liderança ou dissolução =====
        if (player.guildId) {
          const guild = await tx.guild.findUnique({
            where: { id: player.guildId },
            include: { members: { orderBy: { createdAt: 'asc' } } },
          });
          if (guild) {
            const others = guild.members.filter((m) => m.id !== player.id);
            if (others.length === 0) {
              await tx.guild.delete({ where: { id: guild.id } });
            } else if (guild.leaderId === player.id) {
              await tx.guild.update({ where: { id: guild.id }, data: { leaderId: others[0].id } });
            }
          }
        }

        // ===== Personagem ativo da conta apontava para este? =====
        if (auth.account.activePlayerId === player.id) {
          await tx.account.update({
            where: { id: auth.account.id },
            data: { activePlayerId: null },
          });
        }

        // ===== Exclusão (dependentes em cascata pelo schema) =====
        await tx.player.delete({ where: { id: player.id } });

        await trackEvent('character_deleted', {
          accountId: auth.account.id,
          metadata: { name: player.name, level: player.level },
        }, tx);
      },
      { timeout: 15_000, maxWait: 5_000 }
    );

    return ok({ message: 'Personagem deletado.' });
  } catch (error) {
    return toErrorResponse(error);
  }
}
