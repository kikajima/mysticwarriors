import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { getAuth, requirePlayer } from '@/lib/auth';
import { RACES } from '@/lib/game/content/races';
import { getItem } from '@/lib/game/content/world';
import { computeDerived, parseItems } from '@/lib/game/engine';
import {
  GUILD_RANKING_CATEGORIES,
  PLAYER_RANKING_CATEGORIES,
  sortGuildRankingEntries,
  sortPlayerRankingEntries,
} from '@/lib/game/ranking';
import type {
  GuildRankingCategory,
  GuildRankingEntry,
  PlayerRankingCategory,
  RaceId,
  RankingEntry,
  RankingPage,
} from '@/lib/game/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PAGE_SIZE = 50;

function playerCategory(raw: string | null): PlayerRankingCategory {
  return PLAYER_RANKING_CATEGORIES.some((item) => item.id === raw)
    ? (raw as PlayerRankingCategory)
    : 'power';
}

function guildCategory(raw: string | null): GuildRankingCategory {
  return GUILD_RANKING_CATEGORIES.some((item) => item.id === raw)
    ? (raw as GuildRankingCategory)
    : 'guild_power';
}

function raceFilter(raw: string | null): RaceId | 'all' {
  return raw && Object.prototype.hasOwnProperty.call(RACES, raw) ? (raw as RaceId) : 'all';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(5, Number(searchParams.get('pageSize') ?? 20) || 20));
    const playerId = searchParams.get('playerId');
    const mode = searchParams.get('mode') === 'guilds' ? 'guilds' : 'players';
    const race = mode === 'players' ? raceFilter(searchParams.get('race')) : 'all';
    const category = mode === 'guilds'
      ? guildCategory(searchParams.get('category'))
      : playerCategory(searchParams.get('category'));

    let me: { id: string; guildId: string | null; hasRadar: boolean } | null = null;
    const auth = await getAuth();
    if (auth && playerId) {
      try {
        const player = await requirePlayer(auth, playerId);
        const items = parseItems(player.items);
        me = {
          id: player.id,
          guildId: player.guildId,
          hasRadar: [items.accessory, items.accessory2].some((id) => getItem(id ?? '')?.id === 'radar_esferas'),
        };
      } catch {
        me = null;
      }
    }

    const damageRows = await db.worldBossDamage.groupBy({
      by: ['playerId'],
      _sum: { damage: true },
    });
    const damageByPlayer = new Map(damageRows.map((row) => [row.playerId, row._sum.damage ?? 0]));

    const players = await db.player.findMany({
      where: {
        isBot: false,
        ...(mode === 'players' && race !== 'all' ? { race } : {}),
      },
      include: {
        guild: { select: { id: true, name: true } },
        dragonBallPossessions: { select: { star: true }, orderBy: { star: 'asc' } },
      },
    });

    const playerEntries: RankingEntry[] = players.map((p) => ({
      id: p.id,
      name: p.name,
      race: p.race as RaceId,
      level: p.level,
      power: computeDerived(p).power,
      battlesWon: p.battlesWon,
      battlesLost: p.battlesLost,
      tournamentWins: p.tournamentRoundWins,
      tournamentTitles: p.tournamentTitles,
      totalBossDamage: damageByPlayer.get(p.id) ?? 0,
      isMe: me?.id === p.id,
      isBot: false,
      attackable: !!me && me.id !== p.id,
      blockReason: null,
      guildName: p.guild?.name ?? null,
      dragonBallStars: me?.hasRadar ? p.dragonBallPossessions.map((ball) => ball.star) : null,
    }));

    if (mode === 'players') {
      const sorted = sortPlayerRankingEntries(playerEntries, category as PlayerRankingCategory)
        .map((entry, index) => ({ ...entry, position: index + 1 }));
      const total = sorted.length;
      const start = (page - 1) * pageSize;
      const entries = sorted.slice(start, start + pageSize);
      const myPosition = me ? sorted.find((entry) => entry.id === me!.id)?.position ?? null : null;
      const result: RankingPage = {
        mode,
        category,
        race,
        entries,
        guildEntries: [],
        total,
        page,
        pageSize,
        myPosition,
        source: 'local',
      };
      return ok({ ranking: result });
    }

    const guilds = await db.guild.findMany({
      where: { disbandedAt: null },
      select: { id: true, name: true, level: true, xp: true },
    });
    const playersByGuild = new Map<string, RankingEntry[]>();
    for (const entry of playerEntries) {
      const original = players.find((p) => p.id === entry.id);
      const guildId = original?.guildId;
      if (!guildId) continue;
      const list = playersByGuild.get(guildId) ?? [];
      list.push(entry);
      playersByGuild.set(guildId, list);
    }

    const guildEntries: GuildRankingEntry[] = guilds.map((guild) => {
      const members = playersByGuild.get(guild.id) ?? [];
      const totalPower = members.reduce((sum, member) => sum + member.power, 0);
      return {
        id: guild.id,
        name: guild.name,
        level: guild.level,
        xp: guild.xp,
        totalPower,
        averagePower: members.length ? Math.round(totalPower / members.length) : 0,
        memberCount: members.length,
        tournamentWins: members.reduce((sum, member) => sum + member.tournamentWins, 0),
        tournamentTitles: members.reduce((sum, member) => sum + member.tournamentTitles, 0),
        totalBossDamage: members.reduce((sum, member) => sum + member.totalBossDamage, 0),
        isMine: me?.guildId === guild.id,
      };
    });

    const sortedGuilds = sortGuildRankingEntries(guildEntries, category as GuildRankingCategory)
      .map((entry, index) => ({ ...entry, position: index + 1 }));
    const total = sortedGuilds.length;
    const start = (page - 1) * pageSize;
    const result: RankingPage = {
      mode,
      category,
      race: 'all',
      entries: [],
      guildEntries: sortedGuilds.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      myPosition: me?.guildId ? sortedGuilds.find((entry) => entry.id === me!.guildId)?.position ?? null : null,
      source: 'local',
    };
    return ok({ ranking: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
