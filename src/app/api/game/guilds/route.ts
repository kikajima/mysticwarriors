import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { getAuth, requirePlayer } from '@/lib/auth';
import { guildCapacity, guildThreshold, GUILD_PERMISSIONS, type GuildPermission } from '@/lib/game/guildRules';
import { isOnline } from '@/lib/game/presence';
import { computeDerived } from '@/lib/game/engine';
import type { GuildDetail, GuildSummary, RaceId } from '@/lib/game/types';

const PAGE_SIZE = 50;

function parsePermissions(raw: string): GuildPermission[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((permission): permission is GuildPermission =>
          GUILD_PERMISSIONS.includes(permission as GuildPermission))
      : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const auth = await getAuth();
    const playerId = params.get('playerId');
    const player = auth && playerId ? await requirePlayer(auth, playerId) : null;
    const page = Math.max(1, Number(params.get('page')) || 1);

    const [rows, total] = await Promise.all([
      db.guild.findMany({
        where: { disbandedAt: null },
        orderBy: [{ level: 'desc' }, { totalDonated: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { members: true },
      }),
      db.guild.count({ where: { disbandedAt: null } }),
    ]);

    const guilds: GuildSummary[] = rows.map((guild) => ({
      id: guild.id,
      name: guild.name,
      description: guild.description,
      level: guild.level,
      memberCount: guild.members.length,
      totalPower: guild.members.reduce((sum, member) => sum + computeDerived(member).power, 0),
      totalDonated: guild.totalDonated,
      leaderName: guild.members.find((member) => member.id === guild.leaderId)?.name ?? '—',
    }));

    const detail = async (id: string): Promise<GuildDetail | null> => {
      const guild = await db.guild.findUnique({
        where: { id },
        include: {
          members: true,
          roles: { include: { assignments: true } },
        },
      });
      if (!guild || guild.disbandedAt) return null;

      const isMember = player?.guildId === id;
      const actorRole = isMember
        ? guild.roles.find((role) => role.assignments.some((assignment) => assignment.playerId === player!.id))
        : undefined;
      const isLeader = isMember && guild.leaderId === player!.id;
      const permissions: GuildPermission[] = isLeader
        ? [...GUILD_PERMISSIONS]
        : actorRole
          ? parsePermissions(actorRole.permissions)
          : [];
      const myRank = isLeader ? 100 : actorRole?.rank ?? 0;

      const donationTotals = await db.guildDonation.groupBy({
        by: ['playerId'],
        where: { guildId: id },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      });
      const donorPlayers = donationTotals.length
        ? await db.player.findMany({
            where: { id: { in: donationTotals.map((row) => row.playerId) } },
            select: { id: true, name: true },
          })
        : [];
      const donorNames = new Map(donorPlayers.map((donor) => [donor.id, donor.name]));
      const donatedByPlayer = new Map(donationTotals.map((row) => [row.playerId, row._sum.amount ?? 0]));

      const pendingInvites =
        isMember && permissions.includes('convidar')
          ? await db.guildInvitation.findMany({
              where: { guildId: id, expiresAt: { gt: new Date() } },
              orderBy: { createdAt: 'desc' },
            })
          : [];
      const invitees = pendingInvites.length
        ? await db.player.findMany({
            where: { id: { in: pendingInvites.map((invite) => invite.playerId) } },
            select: { id: true, name: true },
          })
        : [];
      const inviteeNames = new Map(invitees.map((invitee) => [invitee.id, invitee.name]));

      return {
        id: guild.id,
        name: guild.name,
        description: guild.description,
        leaderId: guild.leaderId,
        level: guild.level,
        xp: guild.xp,
        xpToNext: guildThreshold(Math.min(10, guild.level + 1)),
        totalDonated: guild.totalDonated,
        capacity: guildCapacity(guild.level),
        motd: isMember ? guild.motd : undefined,
        permissions,
        myRank,
        roles: isMember
          ? guild.roles
              .map((role) => ({
                id: role.id,
                name: role.name,
                rank: role.rank,
                permissions: parsePermissions(role.permissions),
              }))
              .sort((a, b) => b.rank - a.rank)
          : [],
        donors: isMember
          ? donationTotals.map((row) => ({
              id: row.playerId,
              name: donorNames.get(row.playerId) ?? 'Guerreiro removido',
              total: row._sum.amount ?? 0,
            }))
          : [],
        invitations: pendingInvites.map((invite) => ({
          id: invite.id,
          name: inviteeNames.get(invite.playerId) ?? 'Guerreiro',
          expiresAt: invite.expiresAt.toISOString(),
        })),
        members: guild.members
          .map((member) => {
            const role = guild.roles.find((candidate) =>
              candidate.assignments.some((assignment) => assignment.playerId === member.id));
            return {
              id: member.id,
              name: member.name,
              race: member.race as RaceId,
              level: member.level,
              power: computeDerived(member).power,
              isLeader: guild.leaderId === member.id,
              isMe: member.id === player?.id,
              online: isOnline(member.id),
              donated: donatedByPlayer.get(member.id) ?? 0,
              roleId: role?.id ?? null,
              roleName: guild.leaderId === member.id ? 'Líder' : role?.name ?? 'Membro',
              rank: guild.leaderId === member.id ? 100 : role?.rank ?? 0,
            };
          })
          .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || b.rank - a.rank || b.power - a.power),
      };
    };

    const invitations = player
      ? await db.guildInvitation.findMany({
          where: {
            playerId: player.id,
            expiresAt: { gt: new Date() },
            guild: { disbandedAt: null },
          },
          include: { guild: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const publicGuildId = params.get('guildId');

    return ok({
      guilds,
      myGuild: player?.guildId ? await detail(player.guildId) : null,
      publicGuild: publicGuildId ? await detail(publicGuildId) : null,
      invitations: invitations.map((invite) => ({
        id: invite.id,
        guildId: invite.guildId,
        name: invite.guild.name,
        expiresAt: invite.expiresAt.toISOString(),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
