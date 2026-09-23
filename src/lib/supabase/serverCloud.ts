import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import { isPostgresDatabase } from '@/lib/game/persistence';
import { SUPABASE_PUBLISHABLE_KEY, supabaseUserEndpoint } from '@/lib/supabase/config';
import type { CloudCharacterSnapshot } from '@/lib/supabase/progress';

// =====================================================================
// NUVEM AUTORITATIVA — escrita/leitura SERVER-SIDE
// ---------------------------------------------------------------------
// Segurança:
// * o navegador NUNCA grava estado de jogo em public.personagens;
// * o snapshot nasce do Player autoritativo e é persistido pela conexão
//   PostgreSQL do servidor (DATABASE_URL), não pela sessão do usuário;
// * restauração lê as linhas diretamente do banco filtrando pelo
//   supabaseUserId já vinculado à conta local;
// * o access token Supabase apresentado na restauração é validado contra
//   /auth/v1/user e precisa pertencer ao MESMO supabaseUserId.
//
// Assim, possuir um token/RLS válido não permite fabricar atributos,
// moedas, itens ou progresso e depois "restaurá-los" no jogo.
// =====================================================================

export interface AuthoritativeCloudRow {
  id: string;
  nome: string;
  raca: string;
  nivel: number;
  poder: number;
  vitorias: number;
  derrotas: number;
  ativo: boolean;
  estado: CloudCharacterSnapshot;
}

export interface AuthoritativeCloudReadRow extends AuthoritativeCloudRow {
  criado_em: string | null;
  atualizado_em: string | null;
}

function assertSupabaseUserId(userId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new ApiError('FORBIDDEN', 'Conta de nuvem inválida.');
  }
}

export async function verifySupabaseIdentity(accessToken: string, expectedUserId: string): Promise<void> {
  assertSupabaseUserId(expectedUserId);
  if (!accessToken || accessToken.length < 20 || accessToken.length > 4096) {
    throw new ApiError('UNAUTHORIZED', 'Sessão da nuvem ausente ou inválida.');
  }

  let res: Response;
  try {
    res = await fetch(supabaseUserEndpoint(), {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError('UNAUTHORIZED', 'Não foi possível validar sua sessão da nuvem.');
  }

  if (!res.ok) throw new ApiError('UNAUTHORIZED', 'Sua sessão da nuvem expirou. Entre novamente.');

  const user = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!user?.id || user.id !== expectedUserId) {
    throw new ApiError('FORBIDDEN', 'A sessão da nuvem não pertence a esta conta.');
  }
}

export async function syncAuthoritativeCloudCharacters(
  userId: string,
  rows: AuthoritativeCloudRow[]
): Promise<boolean> {
  assertSupabaseUserId(userId);
  if (!isPostgresDatabase()) return false;

  await db.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string; user_id: string }>>`
      SELECT id, user_id::text AS user_id
      FROM public.personagens
      WHERE user_id = ${userId}::uuid
    `;

    for (const row of rows) {
      const owner = await tx.$queryRaw<Array<{ user_id: string }>>`
        SELECT user_id::text AS user_id
        FROM public.personagens
        WHERE id = ${row.id}
        LIMIT 1
      `;
      if (owner[0] && owner[0].user_id !== userId) {
        throw new ApiError('CONFLICT', 'Conflito de identidade no espelho da nuvem.');
      }

      const estado = JSON.stringify(row.estado);
      await tx.$executeRaw`
        INSERT INTO public.personagens
          (id, user_id, nome, raca, nivel, poder, vitorias, derrotas, ativo, estado, atualizado_em)
        VALUES
          (
            ${row.id},
            ${userId}::uuid,
            ${row.nome},
            ${row.raca},
            ${row.nivel},
            ${row.poder},
            ${row.vitorias},
            ${row.derrotas},
            ${row.ativo},
            ${estado}::jsonb,
            now()
          )
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          raca = EXCLUDED.raca,
          nivel = EXCLUDED.nivel,
          poder = EXCLUDED.poder,
          vitorias = EXCLUDED.vitorias,
          derrotas = EXCLUDED.derrotas,
          ativo = EXCLUDED.ativo,
          estado = EXCLUDED.estado,
          atualizado_em = now()
        WHERE public.personagens.user_id = EXCLUDED.user_id
      `;
    }

    const keep = new Set(rows.map((row) => row.id));
    for (const old of existing) {
      if (keep.has(old.id)) continue;
      await tx.$executeRaw`
        DELETE FROM public.personagens
        WHERE id = ${old.id}
          AND user_id = ${userId}::uuid
      `;
    }
  }, { timeout: 20_000, maxWait: 10_000 });

  return true;
}

export async function loadAuthoritativeCloudCharacters(
  userId: string
): Promise<AuthoritativeCloudReadRow[] | null> {
  assertSupabaseUserId(userId);
  if (!isPostgresDatabase()) return null;

  const rows = await db.$queryRaw<
    Array<{
      id: string;
      nome: string;
      raca: string;
      nivel: number;
      poder: bigint | number;
      vitorias: number;
      derrotas: number;
      ativo: boolean;
      estado: unknown;
      criado_em: Date | string | null;
      atualizado_em: Date | string | null;
    }>
  >`
    SELECT
      id, nome, raca, nivel, poder, vitorias, derrotas, ativo, estado,
      criado_em, atualizado_em
    FROM public.personagens
    WHERE user_id = ${userId}::uuid
    ORDER BY criado_em ASC
    LIMIT 10
  `;

  return rows.map((row) => ({
    id: row.id,
    nome: row.nome,
    raca: row.raca,
    nivel: Number(row.nivel),
    poder: Number(row.poder),
    vitorias: Number(row.vitorias),
    derrotas: Number(row.derrotas),
    ativo: row.ativo,
    estado: row.estado as CloudCharacterSnapshot,
    criado_em:
      row.criado_em instanceof Date ? row.criado_em.toISOString() : row.criado_em,
    atualizado_em:
      row.atualizado_em instanceof Date ? row.atualizado_em.toISOString() : row.atualizado_em,
  }));
}
