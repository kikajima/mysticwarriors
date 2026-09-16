import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuth, accountToView } from '@/lib/auth';
import { playerToView } from '@/lib/game/engine';
import { ensureBalanceVersion } from '@/lib/game/balance';
import { maybeBeacon } from '@/lib/game/persistence';
import { toErrorResponse } from '@/lib/api';

/**
 * Valida a sessão (cookie HttpOnly) e devolve a conta + personagens.
 * Não retorna 401 quando não há sessão — devolve { success: true, account: null }
 * para o cliente ir direto à tela de login sem tratar erro.
 *
 * v0.3: inclui `activePlayerId` — o personagem em uso vive no SERVIDOR.
 * O cliente não persiste mais playerId em localStorage (anti-XSS).
 */
export async function GET(request: Request) {
  try {
    // boot: garante versão de balanceamento (barato — 1 consulta/processo)
    await ensureBalanceVersion();
    // persistência: beacon dirigido por tráfego (fire-and-forget; no-op no sandbox)
    maybeBeacon(request);

    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ success: true, account: null, characters: [] });
    }

    const characters = await db.player.findMany({
      where: { accountId: auth.account.id, isBot: false },
      orderBy: { createdAt: 'asc' },
    });

    // sanitiza referência morta (personagem ativo deletado, por exemplo)
    const activePlayerId =
      auth.account.activePlayerId && characters.some((p) => p.id === auth.account.activePlayerId)
        ? auth.account.activePlayerId
        : null;

    return NextResponse.json({
      success: true,
      account: accountToView(auth.account),
      characters: characters.map(playerToView),
      activePlayerId,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
