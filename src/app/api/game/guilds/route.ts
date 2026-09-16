import { db } from '@/lib/db';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { getAuth, requirePlayer } from '@/lib/auth';
import { computeDerived } from '@/lib/game/engine';
import { guildLevelFromXp, guildXpToNext } from '@/lib/game/actions';
import type { GuildDetail, GuildSummary, RaceId } from '@/lib/game/types';

// =====================================================================
// GET /api/game/guilds?page=1 — guildas PAGINADAS + detalhe da minha
// ---------------------------------------------------------------------
// Lista resumida via agregação (não carrega membros). Detalhe da minha
// guilda inclui membros ordenados por poder (limite 60).
//
// v0.15 — GUILDA DE SISTEMA EXTINTA (decisão do dono): NENHUMA seed é
// garantida nesta rota. O mundo começa com ZERO guildas — a tela abre
// limpa com o estado vazio ("Nenhuma guilda fundada ainda") e guildas
// passam a existir quando jogadores as fundarem. Nenhum bootstrap.
// =====================================================================

const PAGE_SIZE = 12;
const MAX_MEMBERS = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);

    // v0.15 — nada a "garantir": guildas de sistema não existem mais
    // (decisão do dono — ver DESIGN-DECISIONS.md)

    // agregação leve: contagem de membros por guilda
    const [total, guildRows] = await Promise.all([
      db.guild.count(),
      db.guild.findMany({
        orderBy: [{ level: 'desc' }, { totalDonated: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          description: true,
          level: true,
          totalDonated: true,
          leaderId: true,
        },
      }),
    ]);

    // contagem de membros por guilda (groupBy simples)
    const guildIds = guildRows.map((g) => g.id);
    const membersAgg = await db.player.groupBy({
      by: ['guildId'],
      where: { guildId: { in: guildIds } },
      _count: { _all: true },
    });
    const memberCounts = new Map(membersAgg.map((row) => [row.guildId, row._count._all]));

    // poder total por guilda (colunas necessárias apenas)
    const memberStats = await db.player.findMany({
      where: { guildId: { in: guildIds } },
      select: { guildId: true, level: true, strength: true, defense: true, speed: true, ki: true },
    });
    const powerByGuild = new Map<string, number>();
    for (const m of memberStats) {
      if (!m.guildId) continue;
      const power = quickPower(m);
      powerByGuild.set(m.guildId, (powerByGuild.get(m.guildId) ?? 0) + power);
    }

    // nomes dos líderes
    const leaderIds = guildRows.map((g) => g.leaderId);
    const leaders = await db.player.findMany({
      where: { id: { in: leaderIds } },
      select: { id: true, name: true },
    });
    const leaderNameById = new Map(leaders.map((l) => [l.id, l.name]));

    const summaries: GuildSummary[] = guildRows
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        memberCount: memberCounts.get(g.id) ?? 0,
        totalPower: powerByGuild.get(g.id) ?? 0,
        leaderName: leaderNameById.get(g.leaderId) ?? '—',
        level: g.level,
        totalDonated: g.totalDonated,
      }))
      .sort((a, b) => b.totalPower - a.totalPower);

    // detalhe da minha guilda (autorizado)
    let myGuild: GuildDetail | null = null;
    const auth = await getAuth();
    const playerId = searchParams.get('playerId');
    if (auth && playerId) {
      const player = await requirePlayer(auth, playerId);
      if (player.guildId) {
        const guild = await db.guild.findUnique({ where: { id: player.guildId } });
        if (guild) {
          const membersRaw = await db.player.findMany({
            where: { guildId: guild.id, isBot: false },
            select: { id: true, name: true, race: true, level: true, strength: true, defense: true, speed: true, ki: true },
            take: MAX_MEMBERS,
          });
          myGuild = {
            id: guild.id,
            name: guild.name,
            description: guild.description,
            leaderId: guild.leaderId,
            level: guild.level,
            xp: guild.xp,
            xpToNext: guildXpToNext(guild.level),
            totalDonated: guild.totalDonated,
            members: membersRaw
              .map((m) => ({
                id: m.id,
                name: m.name,
                race: m.race as RaceId,
                level: m.level,
                power: computeDerived(m as never).power,
                isLeader: m.id === guild.leaderId,
                isMe: m.id === player.id,
              }))
              .sort((a, b) => b.power - a.power),
          };
        }
      }
    }

    return ok({ guilds: summaries, myGuild, total, page, pageSize: PAGE_SIZE });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function quickPower(m: { level: number; strength: number; defense: number; speed: number; ki: number }): number {
  const atk = Math.round(m.strength * 2.2);
  const kiP = Math.round(m.ki * 2.4);
  const def = Math.round(m.defense * 1.8);
  const res = Math.round(m.defense * 1.1 + m.ki * 0.9);
  return Math.round(m.level * 15 + atk + kiP * 0.9 + def + res * 0.6 + m.speed * 2);
}
