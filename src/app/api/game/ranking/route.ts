import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { getAuth, requirePlayer } from '@/lib/auth';
import { RACES } from '@/lib/game/content/races';
import { getItem } from '@/lib/game/content/world';
import { publicCosmeticsFromRaw } from '@/lib/game/content/cosmetics';
import { computeDerived, parseItems } from '@/lib/game/engine';
import {
  compareGuildRanking,
  compareWarriorRanking,
} from '@/lib/game/ranking';
import { fetchCloudRanking } from '@/lib/supabase/ranking';
import type {
  GuildRankingCategory,
  GuildRankingEntry,
  RaceId,
  RankingEntry,
  RankingPage,
  WarriorRankingCategory,
} from '@/lib/game/types';

// One shared world: cloud-only characters can be restored for offline duels.
// A chamada sem "kind/category/race" mantém o contrato legado nuvem-primeiro.
// A UI nova envia esses parâmetros e usa o banco autoritativo do mundo para
// métricas que não existem na RPC pública antiga (torneio, boss e guildas).

const MAX_PAGE_SIZE = 50;
const WARRIOR_CATEGORIES: WarriorRankingCategory[] = ['level', 'power', 'tournament', 'boss_damage'];
const GUILD_CATEGORIES: GuildRankingCategory[] = ['power', 'level'];

interface RankingViewer {
  id: string;
  level: number;
  name: string;
  guildId: string | null;
  hasRadar: boolean;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(5, Number(searchParams.get('pageSize') ?? 20) || 20));
    const playerId = searchParams.get('playerId');

    let me: RankingViewer | null = null;
    const auth = await getAuth();
    if (auth && playerId) {
      try {
        const player = await requirePlayer(auth, playerId);
        const items = parseItems(player.items);
        me = {
          id: player.id,
          level: player.level,
          name: player.name,
          guildId: player.guildId,
          hasRadar: [items.accessory, items.accessory2].some((id) => getItem(id ?? '')?.id === 'radar_esferas'),
        };
      } catch {
        me = null;
      }
    }

    const extended =
      searchParams.has('kind') ||
      searchParams.has('category') ||
      searchParams.has('race');

    if (!extended) {
      return ok({ ranking: await legacyRanking(page, pageSize, me) });
    }

    const kind = searchParams.get('kind') === 'guilds' ? 'guilds' : 'warriors';
    if (kind === 'guilds') {
      const rawCategory = searchParams.get('category') as GuildRankingCategory | null;
      const category = rawCategory && GUILD_CATEGORIES.includes(rawCategory) ? rawCategory : 'power';
      return ok({ ranking: await guildRanking(page, pageSize, me, category) });
    }

    const rawCategory = searchParams.get('category') as WarriorRankingCategory | null;
    const category = rawCategory && WARRIOR_CATEGORIES.includes(rawCategory) ? rawCategory : 'level';
    const raceParam = searchParams.get('race');
    const race =
      raceParam && (Object.keys(RACES) as string[]).includes(raceParam)
        ? (raceParam as RaceId)
        : null;

    return ok({ ranking: await warriorRanking(page, pageSize, me, category, race) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function warriorRanking(
  page: number,
  pageSize: number,
  me: RankingViewer | null,
  category: WarriorRankingCategory,
  race: RaceId | null
): Promise<RankingPage> {
  const where = race ? { isBot: false, race } : { isBot: false };
  const players = await db.player.findMany({
    where,
    include: {
      guild: { select: { name: true } },
      bossDamage: { select: { damage: true } },
      dragonBallPossessions: { select: { star: true }, orderBy: { star: 'asc' } },
    },
  });

  const ranked = players
    .map((player) => {
      const power = computeDerived(player).power;
      return {
        player,
        name: player.name,
        level: player.level,
        xp: player.xp,
        power,
        tournamentWins: player.tournamentRoundWins,
        tournamentTitles: player.tournamentTitles,
        bossDamage: player.bossDamage.reduce((sum, row) => sum + row.damage, 0),
      };
    })
    .sort((a, b) => compareWarriorRanking(a, b, category));

  const myIndex = me ? ranked.findIndex((row) => row.player.id === me.id) : -1;
  const start = (page - 1) * pageSize;
  const visible = ranked.slice(start, start + pageSize);

  const entries: RankingEntry[] = visible.map((row, index) => ({
    id: row.player.id,
    name: row.player.name,
    race: row.player.race as RaceId,
    avatarUrl: row.player.avatarUrl,
    cosmetics: publicCosmeticsFromRaw(row.player.cosmeticsEquipped),
    level: row.player.level,
    power: row.power,
    battlesWon: row.player.battlesWon,
    battlesLost: row.player.battlesLost,
    tournamentWins: row.tournamentWins,
    tournamentTitles: row.tournamentTitles,
    bossDamage: row.bossDamage,
    isMe: me?.id === row.player.id,
    isBot: false,
    attackable: !!me && me.id !== row.player.id,
    blockReason: null,
    guildName: row.player.guild?.name ?? null,
    dragonBallStars: me?.hasRadar ? row.player.dragonBallPossessions.map((ball) => ball.star) : null,
    position: start + index + 1,
  }));

  return {
    entries,
    guilds: [],
    total: ranked.length,
    page,
    pageSize,
    myPosition: myIndex >= 0 ? myIndex + 1 : null,
    kind: 'warriors',
    category,
    race,
    source: 'local',
  };
}

async function guildRanking(
  page: number,
  pageSize: number,
  me: RankingViewer | null,
  category: GuildRankingCategory
): Promise<RankingPage> {
  const rows = await db.guild.findMany({
    where: { disbandedAt: null },
    include: { members: true },
  });

  const ranked = rows
    .map((guild) => ({
      guild,
      name: guild.name,
      level: guild.level,
      xp: guild.xp,
      memberCount: guild.members.length,
      totalDonated: guild.totalDonated,
      totalPower: guild.members.reduce((sum, member) => sum + computeDerived(member).power, 0),
      leaderName: guild.members.find((member) => member.id === guild.leaderId)?.name ?? '—',
    }))
    .sort((a, b) => compareGuildRanking(a, b, category));

  const myIndex = me?.guildId ? ranked.findIndex((row) => row.guild.id === me.guildId) : -1;
  const start = (page - 1) * pageSize;
  const visible = ranked.slice(start, start + pageSize);

  const guilds: GuildRankingEntry[] = visible.map((row, index) => ({
    id: row.guild.id,
    name: row.guild.name,
    level: row.level,
    xp: row.xp,
    totalPower: row.totalPower,
    memberCount: row.memberCount,
    totalDonated: row.totalDonated,
    leaderName: row.leaderName,
    isMine: me?.guildId === row.guild.id,
    position: start + index + 1,
  }));

  return {
    entries: [],
    guilds,
    total: ranked.length,
    page,
    pageSize,
    myPosition: myIndex >= 0 ? myIndex + 1 : null,
    kind: 'guilds',
    category,
    race: null,
    source: 'local',
  };
}

/**
 * Contrato legado do ranking público/in-game anterior.
 * Mantido intacto para não remover personagens que existem apenas nos
 * snapshots do Supabase enquanto o restante do mundo termina a migração.
 */
async function legacyRanking(
  page: number,
  pageSize: number,
  me: RankingViewer | null
): Promise<RankingPage> {
  const cloud = await fetchCloudRanking(pageSize, (page - 1) * pageSize, me?.name ?? undefined);
  if (cloud) {
    const names = [...new Set(cloud.entries.map((entry) => entry.nome))];
    const localRows = names.length
      ? await db.player.findMany({
          where: { isBot: false, name: { in: names } },
          select: {
            id: true,
            name: true,
            race: true,
            level: true,
            avatarUrl: true,
            cosmeticsEquipped: true,
            battlesWon: true,
            battlesLost: true,
            tournamentRoundWins: true,
            tournamentTitles: true,
            bossDamage: { select: { damage: true } },
            dragonBallPossessions: { select: { star: true }, orderBy: { star: 'asc' } },
            guild: { select: { name: true } },
          },
        })
      : [];
    const byName = new Map(localRows.map((row) => [row.name, row]));

    const entries: RankingEntry[] = cloud.entries.map((entry) => {
      const local = byName.get(entry.nome);
      const isMe = !!me && (local?.id === me.id || entry.nome === me.name);
      const raceRaw = entry.raca ?? local?.race ?? '';
      const race = (Object.keys(RACES) as string[]).includes(raceRaw)
        ? (raceRaw as RaceId)
        : ('' as RaceId);

      return {
        id: local?.id ?? `cloud:${encodeURIComponent(entry.nome)}`,
        name: entry.nome,
        race,
        avatarUrl: local?.avatarUrl ?? null,
        cosmetics: publicCosmeticsFromRaw(local?.cosmeticsEquipped),
        level: local?.level ?? entry.nivel,
        power: entry.poder,
        battlesWon: local?.battlesWon ?? entry.vitorias ?? 0,
        battlesLost: local?.battlesLost ?? entry.derrotas ?? 0,
        tournamentWins: local?.tournamentRoundWins ?? 0,
        tournamentTitles: local?.tournamentTitles ?? 0,
        bossDamage: local?.bossDamage.reduce((sum, row) => sum + row.damage, 0) ?? 0,
        isMe,
        isBot: false,
        attackable: !!me && !isMe,
        blockReason: null,
        guildName: local?.guild?.name ?? null,
        dragonBallStars: me?.hasRadar ? (local?.dragonBallPossessions.map((ball) => ball.star) ?? []) : null,
        position: entry.posicao,
      };
    });

    return {
      entries,
      guilds: [],
      total: cloud.total,
      page,
      pageSize,
      myPosition: cloud.myPosition,
      kind: 'warriors',
      category: 'level',
      race: null,
      source: 'cloud',
    };
  }

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
        avatarUrl: true,
        cosmeticsEquipped: true,
        xp: true,
        strength: true,
        defense: true,
        speed: true,
        ki: true,
        battlesWon: true,
        battlesLost: true,
        tournamentRoundWins: true,
        tournamentTitles: true,
        bossDamage: { select: { damage: true } },
        dragonBallPossessions: { select: { star: true }, orderBy: { star: 'asc' } },
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

  const entries: RankingEntry[] = rows.map((player, index) => ({
    id: player.id,
    name: player.name,
    race: player.race as RaceId,
    avatarUrl: player.avatarUrl,
    cosmetics: publicCosmeticsFromRaw(player.cosmeticsEquipped),
    level: player.level,
    power: scouterPower(player),
    battlesWon: player.battlesWon,
    battlesLost: player.battlesLost,
    tournamentWins: player.tournamentRoundWins,
    tournamentTitles: player.tournamentTitles,
    bossDamage: player.bossDamage.reduce((sum, row) => sum + row.damage, 0),
    isMe: me?.id === player.id,
    isBot: false,
    attackable: !!me && me.id !== player.id,
    blockReason: null,
    guildName: player.guild?.name ?? null,
    dragonBallStars: me?.hasRadar ? player.dragonBallPossessions.map((ball) => ball.star) : null,
    position: (page - 1) * pageSize + index + 1,
  }));

  return {
    entries,
    guilds: [],
    total,
    page,
    pageSize,
    myPosition,
    kind: 'warriors',
    category: 'level',
    race: null,
    source: 'local',
  };
}

/** Poder aproximado do contrato legado, sem carregar o estado completo. */
function scouterPower(player: {
  level: number;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
}): number {
  const atk = Math.round(player.strength * 2.2);
  const kiPower = Math.round(player.ki * 2.4);
  const defense = Math.round(player.defense * 1.8);
  const resistance = Math.round(player.defense * 1.1 + player.ki * 0.9);
  return Math.round(
    player.level * 15 +
      atk +
      kiPower * 0.9 +
      defense +
      resistance * 0.6 +
      player.speed * 2
  );
}
