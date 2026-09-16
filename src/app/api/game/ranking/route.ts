import { db } from '@/lib/db';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { getAuth, requirePlayer } from '@/lib/auth';
import { PVP_LEVEL_RANGE } from '@/lib/game/content/world';
import { RACES } from '@/lib/game/content/races';
import { fetchCloudRanking } from '@/lib/supabase/ranking';
import type { RaceId, RankingEntry, RankingPage } from '@/lib/game/types';

// =====================================================================
// GET /api/game/ranking?page=1&pageSize=20 — ranking PAGINADO
// ---------------------------------------------------------------------
// v0.9.5 — A LISTA VEM DA NUVEM: a RPC ranking_nuvem lê TODOS os
// personagens salvos no Supabase (de todas as contas, logadas ou não,
// sem nenhum filtro de sessão/login) e calcula as posições na hora.
//
// O banco local só entra para COMPLEMENTAR o que a nuvem não tem:
//  * o id local do personagem — necessário para o botão "Atacar"
//    (o duelo roda contra a linha do servidor; personagens salvos por
//    contas que nunca jogaram NESTE servidor ficam sem botão);
//  * raça/vitórias/derrotas quando a RPC antiga (sem o SQL v2) responde;
//  * o clã do personagem (dado que só existe no servidor).
// O casamento é pelo NOME — que é único no servidor do jogo.
//
// Se a nuvem falhar (logado no console, nunca silencioso), a rota cai
// no ranking local de antes — o jogo nunca fica sem ranking.
//
// v0.9.24 (A2) — FIM DO "FORA DE ALCANCE" GENÉRICO:
//  * `attackable` obedece à regra publicada (±5 NÍVEIS, por nível de
//    personagem — igual ao backend de actionStartPvp);
//  * impedimentos têm MOTIVO ESPECÍFICO em `blockReason`:
//      - 'level'  → diferença de nível acima do range;
//      - 'remote' → personagem existe só na NUVEM (salvo por outro
//        servidor — não há linha local para o duelo acontecer);
//  * `sparring`: bots locais dentro do range ±5 do jogador — DENSIDADE
//    GARANTIDA (sempre há adversário elegível no começo do jogo).
// =====================================================================

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
              battlesWon: true,
              battlesLost: true,
              guild: { select: { name: true } },
            },
          })
        : [];
      const byName = new Map(localRows.map((r) => [r.name, r]));

      const entries = cloud.entries.map((e) => {
        const local = byName.get(e.nome);
        const isMe = !!me && !!local && local.id === me.id;
        // v0.9.24 (A2): regra REAL (±5 níveis) separada do impedimento
        // logístico (linha local inexistente) — cada um com seu motivo.
        const inRange = !!me && Math.abs(e.nivel - me.level) <= PVP_LEVEL_RANGE;
        const hasLocal = !!local;
        const attackable = !!me && !isMe && inRange && hasLocal;
        const blockReason: RankingEntry['blockReason'] = isMe || !me
          ? null
          : !inRange
            ? 'level'
            : !hasLocal
              ? 'remote'
              : null;
        // raça: nuvem (SQL v2) → linha local → desconhecida (vazio)
        const raceRaw = e.raca ?? local?.race ?? '';
        const race = (Object.keys(RACES) as string[]).includes(raceRaw)
          ? (raceRaw as RaceId)
          : ('' as RaceId);
        return {
          id: local?.id ?? `cloud-${e.posicao}-${e.nome}`,
          name: e.nome,
          race,
          level: e.nivel,
          power: e.poder,
          battlesWon: e.vitorias ?? local?.battlesWon ?? 0,
          battlesLost: e.derrotas ?? local?.battlesLost ?? 0,
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
        sparring: await sparringPartners(me),
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
      sparring: await sparringPartners(me),
    };
    return ok({ ranking: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * v0.9.24 (A2) — bots SPARRING dentro do range ±5 do jogador: densidade
 * garantida de adversários elegíveis (o começo do jogo nunca fica sem
 * ninguém para desafiar). São lutadores de verdade (stats reais, o
 * actionStartPvp os aceita) — marcados com isBot para a UI sinalizar.
 */
async function sparringPartners(me: { id: string; level: number } | null): Promise<RankingEntry[]> {
  if (!me) return [];
  const bots = await db.player.findMany({
    where: {
      isBot: true,
      level: { gte: me.level - PVP_LEVEL_RANGE, lte: me.level + PVP_LEVEL_RANGE },
    },
    orderBy: { level: 'asc' },
    take: 6,
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
    },
  });
  return bots.map((b, i) => ({
    id: b.id,
    name: b.name,
    race: b.race as RaceId,
    level: b.level,
    power: scouterPower(b),
    battlesWon: b.battlesWon,
    battlesLost: b.battlesLost,
    isMe: false,
    isBot: true,
    attackable: true,
    blockReason: null,
    guildName: null,
    position: i + 1,
  }));
}

/** Poder aproximado calculado a partir das colunas selecionadas (sem carregar JSONs). */
function scouterPower(p: { level: number; strength: number; defense: number; speed: number; ki: number }): number {
  const atk = Math.round(p.strength * 2.2);
  const kiP = Math.round(p.ki * 2.4);
  const def = Math.round(p.defense * 1.8);
  const res = Math.round(p.defense * 1.1 + p.ki * 0.9);
  return Math.round(p.level * 15 + atk + kiP * 0.9 + def + res * 0.6 + p.speed * 2);
}
