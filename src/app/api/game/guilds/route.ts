import { db } from '@/lib/db';
import { ok, toErrorResponse } from '@/lib/api';
import { getAuth, requirePlayer } from '@/lib/auth';
import { guildAuthority } from '@/lib/game/guilds';
import { guildCapacity, guildThreshold } from '@/lib/game/guildRules';
import { isOnline } from '@/lib/game/presence';
import { computeDerived } from '@/lib/game/engine';
import type { GuildDetail, GuildSummary, RaceId } from '@/lib/game/types';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const auth = await getAuth();
    const playerId = params.get('playerId');
    const player = auth && playerId ? await requirePlayer(auth, playerId) : null;
    const page = Math.max(1, Number(params.get('page')) || 1);
    const rows = await db.guild.findMany({ where: { disbandedAt: null }, orderBy: [{ level: 'desc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50,
      include: { members: true } });
    const guilds: GuildSummary[] = rows.map(g => ({ id: g.id, name: g.name, description: g.description, level: g.level,
      memberCount: g.members.length, totalPower: g.members.reduce((sum, m) => sum + computeDerived(m).power, 0),
      totalDonated: g.totalDonated, leaderName: g.members.find(m => m.id === g.leaderId)?.name ?? '—' }));
    const detail = async (id: string): Promise<GuildDetail | null> => {
      const g = await db.guild.findUnique({ where: { id }, include: { members: true, roles: { include: { assignments: true } } } });
      if (!g || g.disbandedAt) return null;
      const member = player?.guildId === id;
      const authority = member ? await guildAuthority(db, player!) : null;
      const totals = await db.guildDonation.groupBy({ by: ['playerId'], where: { guildId: id }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } } });
      const donors = await db.player.findMany({ where: { id: { in: totals.map(t => t.playerId) } }, select: { id: true, name: true } });
      const donorNames = new Map(donors.map(d => [d.id, d.name]));
      const donations = new Map(totals.map(t => [t.playerId, t._sum.amount ?? 0]));
      const invites = authority?.permissions.includes('convidar') ? await db.guildInvitation.findMany({ where: { guildId: id, expiresAt: { gt: new Date() } } }) : [];
      const invitees = await db.player.findMany({ where: { id: { in: invites.map(i => i.playerId) } }, select: { id: true, name: true } });
      return { id: g.id, name: g.name, description: g.description, leaderId: g.leaderId, level: g.level, xp: g.xp,
        xpToNext: guildThreshold(Math.min(10, g.level + 1)), totalDonated: g.totalDonated, capacity: guildCapacity(g.level),
        motd: member ? g.motd : undefined, permissions: authority?.permissions ?? [], myRank: authority?.rank ?? -1,
        roles: member ? g.roles.map(r => ({ id: r.id, name: r.name, rank: r.rank, permissions: JSON.parse(r.permissions) })) : [],
        donors: member ? totals.map(t => ({ id: t.playerId, name: donorNames.get(t.playerId) ?? 'Guerreiro removido', total: t._sum.amount ?? 0 })) : [],
        invitations: invites.map(i => ({ id: i.id, name: invitees.find(p => p.id === i.playerId)?.name ?? 'Guerreiro', expiresAt: i.expiresAt.toISOString() })),
        members: g.members.map(m => {
          const role = g.roles.find(r => r.assignments.some(a => a.playerId === m.id));
          return { id: m.id, name: m.name, race: m.race as RaceId, level: m.level, power: computeDerived(m).power,
            isLeader: g.leaderId === m.id, isMe: m.id === player?.id, online: isOnline(m.id), donated: donations.get(m.id) ?? 0,
            roleId: role?.id ?? null, roleName: g.leaderId === m.id ? 'Líder' : role?.name ?? 'Membro', rank: g.leaderId === m.id ? 100 : role?.rank ?? 0 };
        }) };
    };
    const invitations = player ? await db.guildInvitation.findMany({ where: { playerId: player.id, expiresAt: { gt: new Date() }, guild: { disbandedAt: null } }, include: { guild: { select: { name: true } } } }) : [];
    return ok({ guilds, myGuild: player?.guildId ? await detail(player.guildId) : null,
      publicGuild: params.get('guildId') ? await detail(params.get('guildId')!) : null,
      invitations: invitations.map(i => ({ id: i.id, guildId: i.guildId, name: i.guild.name, expiresAt: i.expiresAt.toISOString() })),
      total: await db.guild.count({ where: { disbandedAt: null } }), page, pageSize: 50 });
  } catch (error) { return toErrorResponse(error); }
}
