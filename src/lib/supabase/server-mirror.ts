import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isPostgresDatabase } from '@/lib/game/persistence';
import type { CloudCharacterSnapshot } from './progress';

export interface ServerCloudCharacterRow {
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

export interface ServerCloudCharacterReadRow extends ServerCloudCharacterRow {
  criado_em: string | null;
  atualizado_em: string | null;
}

interface RawMirrorRow {
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
}

interface OfflineMirrorRow {
  id: string;
  nome: string;
  estado: unknown;
  atualizado_em: Date | string;
  ativo: boolean;
}

export interface ServerOfflineOpponent {
  user_id: string;
  personagens: Array<{
    id: string;
    nome: string;
    estado: unknown;
    atualizado_em: string;
    ativo: boolean;
  }>;
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Espelha o estado AUTORITATIVO do schema game no schema public.
 * O navegador nunca recebe permissão de INSERT/UPDATE/DELETE em personagens.
 */
export async function syncServerCloudCharacters(
  userId: string,
  rows: ServerCloudCharacterRow[]
): Promise<boolean> {
  if (!isPostgresDatabase() || !validUuid(userId)) return false;
  if (rows.some((row) => !row.id || row.id.length > 64)) return false;

  try {
    await db.$transaction(async (tx) => {
      if (rows.length > 0) {
        const ids = rows.map((row) => row.id);
        const collisions = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          select id
          from public.personagens
          where id in (${Prisma.join(ids)})
            and user_id <> cast(${userId} as uuid)
          limit 1
        `);
        if (collisions.length > 0) throw new Error('cloud mirror id collision');

        const values = rows.map((row) => Prisma.sql`(
          ${row.id},
          cast(${userId} as uuid),
          ${row.nome},
          ${row.raca},
          ${row.nivel},
          ${row.poder},
          ${row.vitorias},
          ${row.derrotas},
          ${row.ativo},
          cast(${JSON.stringify(row.estado)} as jsonb),
          true
        )`);

        const touched = await tx.$executeRaw(Prisma.sql`
          insert into public.personagens
            (id, user_id, nome, raca, nivel, poder, vitorias, derrotas, ativo, estado, server_verified)
          values ${Prisma.join(values)}
          on conflict (id) do update set
            nome = excluded.nome,
            raca = excluded.raca,
            nivel = excluded.nivel,
            poder = excluded.poder,
            vitorias = excluded.vitorias,
            derrotas = excluded.derrotas,
            ativo = excluded.ativo,
            estado = excluded.estado,
            server_verified = true,
            atualizado_em = now()
          where public.personagens.user_id = excluded.user_id
        `);
        if (touched !== rows.length) throw new Error('cloud mirror sync incomplete');

        await tx.$executeRaw(Prisma.sql`
          delete from public.personagens
          where user_id = cast(${userId} as uuid)
            and id not in (${Prisma.join(ids)})
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          delete from public.personagens
          where user_id = cast(${userId} as uuid)
        `);
      }
    });
    return true;
  } catch (error) {
    console.error('[cloud-mirror] falha ao sincronizar estado autoritativo:', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Lê somente snapshots que já foram reescritos pelo backend Stage 12. */
export async function loadServerCloudCharacters(
  userId: string
): Promise<ServerCloudCharacterReadRow[] | null> {
  if (!isPostgresDatabase() || !validUuid(userId)) return null;
  try {
    const rows = await db.$queryRaw<RawMirrorRow[]>(Prisma.sql`
      select id, nome, raca, nivel, poder, vitorias, derrotas, ativo,
             estado, criado_em, atualizado_em
      from public.personagens
      where user_id = cast(${userId} as uuid)
        and server_verified = true
      order by criado_em asc
    `);
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
      criado_em: iso(row.criado_em),
      atualizado_em: iso(row.atualizado_em),
    }));
  } catch (error) {
    console.error('[cloud-mirror] falha ao ler espelho autoritativo:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Busca adversário offline exclusivamente pelo backend. O antigo RPC público
 * entregava snapshots internos a qualquer usuário autenticado e foi revogado.
 */
export async function loadServerOfflineOpponent(name: string): Promise<ServerOfflineOpponent | null> {
  const normalized = name.trim();
  if (!isPostgresDatabase() || normalized.length < 1 || normalized.length > 20) return null;

  try {
    const owners = await db.$queryRaw<Array<{ user_id: string }>>(Prisma.sql`
      select user_id::text as user_id
      from public.personagens
      where nome = ${normalized}
        and server_verified = true
      limit 1
    `);
    const userId = owners[0]?.user_id;
    if (!userId || !validUuid(userId)) return null;

    const rows = await db.$queryRaw<OfflineMirrorRow[]>(Prisma.sql`
      select id, nome, estado, atualizado_em, ativo
      from public.personagens
      where user_id = cast(${userId} as uuid)
        and server_verified = true
      order by criado_em asc
    `);
    return {
      user_id: userId,
      personagens: rows.map((row) => ({
        id: row.id,
        nome: row.nome,
        estado: row.estado,
        atualizado_em: iso(row.atualizado_em) ?? new Date(0).toISOString(),
        ativo: row.ativo,
      })),
    };
  } catch (error) {
    console.error('[cloud-mirror] falha ao carregar adversário offline:', error instanceof Error ? error.message : error);
    return null;
  }
}
