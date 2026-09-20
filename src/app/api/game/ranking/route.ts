import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { getAuth, requirePlayer } from '@/lib/auth';
import { RACES } from '@/lib/game/content/races';
import { getItem } from '@/lib/game/content/world';
import { parseItems } from '@/lib/game/engine';
import type {
  GuildRankingEntry,
  GuildRankingPage,
  GuildRankingSort,
  RaceId,
  RankingEntry,
  RankingPage,
  RankingSort,
} from '@/lib/game/types';

const MAX_PAGE_SIZE = 50;
const PLAYER_SORTS: RankingSort[] = ['level', 'power', 'wins', 'tournament', 'worldboss'];
const GUILD_SORTS: GuildRankingSort[] = ['power', 'level'];

function scouterPower(p: { level: number; strength: number; defense: number; speed: number; ki: number }): number {
  const atk = Math.round(p.strength * 2.2);
  const kiP = Math.round(p.ki * 2.4);
  const def = Math.round(p.defense * 1.8);
  const res = Math.round(p.defense * 1.1 + p.ki * 0.9);
  return Math.round(p.level * 15 + atk + kiP * 0.9 + def + res * 0.6 + p.speed * 2);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(5, Number(searchParams.get('pageSize') ?? 20) || 20));
    const playerId = searchParams.get('playerId');
    const scope = searchParams.get('scope') === 'guilds' ? 'guilds' : 'players';

    if (scope === 'guilds') {
      const requested = searchParams.get('sort') as GuildRankingSort | null;
      const sort: GuildRankingSort = requested && GUILD_SORTS.includes(requested) ? requested : 'power';
      const guilds = await db.guild.findMany({
        where: { disbandedAt: null },
        select: {
          id: true,
          name: true,
          level: true,
          leaderId: true,
          totalDonated: true,
          members: {
            select: { id: true, name: true, level: true, strength: true, defense: true, speed: true, ki: true },
          },
        },
      });

      const rows: GuildRankingEntry[] = guilds.map((guild) => {
        const leader = guild.members.find((m) => m.id === guild.leaderId);
        return {
          id: guild.id,
          name: guild.name,
          level: guild.level,
          totalPower: guild.members.reduce((sum, member) => sum + scouterPower(member), 0),
          memberCount: guild.members.length,
          leaderName: leader?.name ?? '—',
          totalDonated: guild.totalDonated,
          position: 0,
        };
      });
      rows.sort((a, b) =>
        sort === 'level'
          ? b.level - a.level || b.totalPower - a.totalPower || a.name.localeCompare(b.name)
          : b.totalPower - a.totalPower || b.level - a.level || a.name.localeCompare(b.name)
      );
      rows.forEach((entry, index) => { entry.position = index + 1; });
      const start = (page - 1) * pageSize;
      const result: GuildRankingPage = {
        entries: rows.slice(start, start + pageSize),
        total: rows.length,
        page,
        pageSize,
        sort,
      };
      return ok({ scope: 'guilds', ranking: result });
    }

    const requestedSort = searchParams.get('sort') as RankingSort | null;
    const sort: RankingSort = requestedSort && PLAYER_SORTS.includes(requestedSort) ? requestedSort : 'power';
    const raceParam = searchParams.get('race') ?? 'all';
    const race: RaceId | 'all' = raceParam === 'all' || Object.prototype.hasOwnProperty.call(RACES, raceParam)
      ? (raceParam as RaceId | 'all')
      : 'all';

    let me: { id: string; hasRadar: boolean } | null = null;
    const auth = await getAuth();
    if (auth && playerId) {
      try {
        const player = await requirePlayer(auth, playerId);
        const items = parseItems(player.items);
        me = {
          id: player.id,
          hasRadar: [items.accessory, items.accessory2].some((id) => getItem(id ?? '')?.id === 'radar_esferas'),
        };
      } catch {
        me = null;
      }
    }

    const [players, bossTotals] = await Promise.all([
      db.player.findMany({
        where: {
          isBot: false,
          ...(race === 'all' ? {} : { race }),
        },
        select: {
          id: true,
          name: true,
          race: true,
          level: true,
          xp: true,
          strength: true,
          defense: true,
          speed: true,
          ki: true,
          battlesWon: true,
          battlesLost: true,
          tournamentRoundWins: true,
          tournamentTitles: true,
          dragonBallPossessions: { select: { star: true }, orderBy: { star: 'asc' } },
          guild: { select: { name: true } },
        },
      }),
      db.worldBossDamage.groupBy({
        by: ['playerId'],
        _sum: { damage: true },
      }),
    ]);

    const damageByPlayer = new Map(bossTotals.map((row) => [row.playerId, row._sum.damage ?? 0]));
    const rows: RankingEntry[] = players.map((p) => ({
      id: p.id,
      name: p.name,
      race: p.race as RaceId,
      level: p.level,
      power: scouterPower(p),
      battlesWon: p.battlesWon,
      battlesLost: p.battlesLost,
      tournamentWins: p.tournamentRoundWins,
      tournamentTitles: p.tournamentTitles,
      worldBossDamage: damageByPlayer.get(p.id) ?? 0,
      isMe: me?.id === p.id,
      isBot: false,
      attackable: !!me && me.id !== p.id,
      blockReason: null,
      guildName: p.guild?.name ?? null,
      dragonBallStars: me?.hasRadar ? p.dragonBallPossessions.map((ball) => ball.star) : null,
      position: 0,
    }));

    rows.sort((a, b) => {
      if (sort === 'level') return b.level - a.level || b.power - a.power || b.battlesWon - a.battlesWon;
      if (sort === 'wins') return b.battlesWon - a.battlesWon || b.power - a.power;
      if (sort === 'tournament') return b.tournamentWins - a.tournamentWins || b.tournamentTitles - a.tournamentTitles || b.power - a.power;
      if (sort === 'worldboss') return b.worldBossDamage - a.worldBossDamage || b.power - a.power;
      return b.power - a.power || b.level - a.level;
    });
    rows.forEach((entry, index) => { entry.position = index + 1; });

    const myPosition = me ? (rows.findIndex((entry) => entry.id === me!.id) + 1 || null) : null;
    const start = (page - 1) * pageSize;
    const result: RankingPage = {
      entries: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
      myPosition,
      source: 'local',
      sort,
      race,
    };
    return ok({ scope: 'players', ranking: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
