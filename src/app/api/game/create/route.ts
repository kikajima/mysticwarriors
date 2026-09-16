import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { getAuth } from '@/lib/auth';
import { MAX_CHARACTERS_PER_ACCOUNT, RACES } from '@/lib/game/constants';
import { ensureSeed, playerToView } from '@/lib/game/engine';
import { initialPlayerData } from '@/lib/game/characterInitial';
import { trackEvent } from '@/lib/analytics';

// =====================================================================
// POST /api/game/create — criação de personagem
// ---------------------------------------------------------------------
// O personagem é SEMPRE vinculado à conta da sessão (real ou convidado).
// Sem sessão → 401 (convidados têm sua própria conta de convidado).
// =====================================================================

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome precisa ter pelo menos 2 caracteres')
    .max(20, 'O nome pode ter no máximo 20 caracteres')
    .regex(/^[\p{L}\p{N} _-]+$/u, 'Use apenas letras, números, espaços, hífen ou underline'),
  race: z.enum(['saiyajin', 'humano', 'namekuseijin', 'androide', 'majin']),
  // v0.16 — gênero REMOVIDO da criação (decisão definitiva, DESIGN-DECISIONS.md).
  // O corpo atual não tem campo algum além de nome/raça; campos legados
  // extras são descartados pelo zod (strip) — clientes antigos não quebram.
});

export async function POST(request: Request) {
  try {
    const auth = await getAuth();
    if (!auth) {
      throw new ApiError('UNAUTHORIZED', 'Inicie uma sessão primeiro (conta ou convidado).');
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Dados inválidos');
    }

    const { name, race } = parsed.data;
    const normalizedName = name.trim();

    await ensureSeed();

    if (!RACES[race]) {
      throw new ApiError('VALIDATION_ERROR', 'Raça inválida.');
    }

    // LIMITE DE PERSONAGENS à prova de concorrência: count + create
    // DENTRO da mesma transação. Duas requisições simultâneas que criariam
    // um personagem além do limite: a transação serializada impede.
    const player = await db.$transaction(async (tx) => {
      const count = await tx.player.count({ where: { accountId: auth.account.id, isBot: false } });
      if (count >= MAX_CHARACTERS_PER_ACCOUNT) {
        throw new ApiError('CHARACTER_LIMIT_REACHED', `Limite atingido: cada conta pode ter até ${MAX_CHARACTERS_PER_ACCOUNT} personagens.`);
      }
      const existing = await tx.player.findFirst({ where: { name: { equals: normalizedName } }, select: { id: true } });
      if (existing) {
        throw new ApiError('CONFLICT', 'Este nome de guerreiro já está em uso. Escolha outro!');
      }
      const created = await tx.player.create({
        data: {
          // v0.9.11: estado inicial vem do serviço ÚNICO — a criação e o
          // reset de personagem usam a MESMA fonte (characterInitial.ts),
          // então nunca mais divergem.
          ...initialPlayerData(),
          name: normalizedName,
          race,
          accountId: auth.account.id,
        },
      });
      // o personagem recém-criado entra em jogo direto: registra como
      // ativo na conta (o cliente NÃO persiste playerId em storage)
      await tx.account.update({
        where: { id: auth.account.id },
        data: { activePlayerId: created.id },
      });
      return created;
    });

    await trackEvent('character_created', { playerId: player.id, accountId: auth.account.id, metadata: { race } });

    // inclui cosméticos da CONTA (2º personagem herda a coleção visual)
    const withCosmetics = await db.player.findUnique({
      where: { id: player.id },
    });

    return ok({ player: playerToView(withCosmetics ?? player) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
