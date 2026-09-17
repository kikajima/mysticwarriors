import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { getAuth, requirePlayer } from '@/lib/auth';
import { PVP_LEVEL_RANGE } from '@/lib/game/content/world';
import { RACES } from '@/lib/game/content/races';
import { fetchCloudRanking } from '@/lib/supabase/ranking';
import type { RaceId, RankingEntry, RankingPage } from '@/lib/game/types';

// One shared world: cloud-only characters can be restored for offline duels.

const MAX_PAGE_SIZE = 50;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(5, Number(searchParams.get('pageSize') ?? 20) || 20));
    const playerId = searchParams.get('playerId');

    // contexto opcional (para attackable/isMe/posição global)
    let me: { id: string; level: number; name: string } | null = null;
    const auth = await getAuth();
    if (auth && playerId) {
      try {
        const player = await requirePlayer(auth, playerId);
        me = { id: player.id, level: player.level, name: player.name };
      } catch {
        me = null; // personagem inválido → ranking público
      }
    }

    // ===== 1) NUVEM PRIMEIRO: todos os personagens salvos no Supabase =====
    const cloud = await fetchCloudRanking(pageSize, (page - 1) * pageSize, me?.name ?? undefined);
    if (cloud) {
      // busca as linhas locais APENAS dos nomes desta página (para atacar)
      const names = [...new Set(cloud.entries.map((e) => e.nome))];
      const localRows = names.length
        ? await db.player.findMany({
            where: { isBot: false, name: { in: names } },
            select: {
              id: true,
              name: true,
              race: true,
              level: true,
              battlesWon: true,
              battlesLost: true,
              guild: { select: { name: true } },
            },
          })
        : [];
      const byName = new Map(localRows.map((r) => [r.name, r]));

      const entries = cloud.entries.map((e) => {
        const local = byName.get(e.nome);
        const isMe = !!me && (local?.id === me.id || e.nome === me.name);
        const inRange = !!me && Math.abs((local?.level ?? e.nivel) - me.level) <= PVP_LEVEL_RANGE;
        const attackable = !!me && !isMe && inRange;
        const blockReason: RankingEntry['blockReason'] = !me || isMe || inRange ? null : 'level';
        // raça: nuvem (SQL v2) → linha local → desconhecida (vazio)
        const raceRaw = e.raca ?? local?.race ?? '';
        const race = (Object.keys(RACES) as string[]).includes(raceRaw)
          ? (raceRaw as RaceId)
          : ('' as RaceId);
        return {
          id: local?.id ?? `cloud:${encodeURIComponent(e.nome)}`,
          name: e.nome,
          race,
          level: local?.level ?? e.nivel,
          power: e.poder,
          battlesWon: local?.battlesWon ?? e.vitorias ?? 0,
          battlesLost: local?.battlesLost ?? e.derrotas ?? 0,
          isMe,
          isBot: false,
          attackable,
          blockReason,
          guildName: local?.guild?.name ?? null,
          position: e.posicao,
        };
      });

      const result: RankingPage & { source: 'cloud' | 'local' } = {
        entries,
        total: cloud.total,
        page,
        pageSize,
        myPosition: cloud.myPosition,
        source: 'cloud',
      };
      return ok({ ranking: result });
    }

    // ===== 2) RESERVA: banco do servidor (nuvem indisponível — já logada) =====
    const where = { isBot: false };

    const [total, rows] = await Promise.all([
      db.player.count({ where }),
      db.player.findMany({
        where,
        orderBy: [{ level: 'desc' }, { battlesWon: 'desc' }, { xp: 'desc' }],
        select: {
          id: true,
          name: true,
          race: true,
          level: true,
          strength: true,
          defense: true,
          speed: true,
          ki: true,
          battlesWon: true,
          battlesLost: true,
          guild: { select: { name: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    let myPosition: number | null = null;
    if (me) {
      const mine = await db.player.findUniqueOrThrow({
        where: { id: me.id },
        select: { level: true, battlesWon: true, xp: true },
      });
      const ahead = await db.player.count({
        where: {
          isBot: false,
          OR: [
            { level: { gt: mine.level } },
            { level: mine.level, battlesWon: { gt: mine.battlesWon } },
            { level: mine.level, battlesWon: mine.battlesWon, xp: { gt: mine.xp } },
          ],
        },
      });
      myPosition = ahead + 1;
    }

    const entries = rows.map((p, i) => ({
      id: p.id,
      name: p.name,
      race: p.race as RaceId,
      level: p.level,
      power: scouterPower(p),
      battlesWon: p.battlesWon,
      battlesLost: p.battlesLost,
      isMe: me?.id === p.id,
      isBot: false,
      attackable: !!me && me.id !== p.id && Math.abs(p.level - me.level) <= PVP_LEVEL_RANGE,
      blockReason: !me || me.id === p.id ? null : Math.abs(p.level - me.level) > PVP_LEVEL_RANGE ? ('level' as const) : null,
      guildName: p.guild?.name ?? null,
      position: (page - 1) * pageSize + i + 1,
    }));

    const result: RankingPage & { source: 'cloud' | 'local' } = {
      entries,
      total,
      page,
      pageSize,
      myPosition,
      source: 'local',
    };
    return ok({ ranking: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Poder aproximado calculado a partir das colunas selecionadas (sem carregar JSONs). */
function scouterPower(p: { level: number; strength: number; defense: number; speed: number; ki: number }): number {
  const atk = Math.round(p.strength * 2.2);
  const kiP = Math.round(p.ki * 2.4);
  const def = Math.round(p.defense * 1.8);
  const res = Math.round(p.defense * 1.1 + p.ki * 0.9);
  return Math.round(p.level * 15 + atk + kiP * 0.9 + def + res * 0.6 + p.speed * 2);
}
