import { db } from '@/lib/db';

async function main() {
  const guilds = await db.guild.findMany({ include: { _count: { select: { members: true } } } });
  console.log('=== GUILDS ===');
  for (const g of guilds) {
    console.log(JSON.stringify({ id: g.id, name: g.name, level: g.level, leaderId: g.leaderId, totalDonated: g.totalDonated, members: g._count.members }));
  }
  const kame = await db.player.findUnique({ where: { name: 'Mestre Kame' } });
  console.log('=== MESTRE KAME ===', kame ? JSON.stringify({ id: kame.id, guildId: kame.guildId, isBot: kame.isBot, level: kame.level }) : 'NOT FOUND');
  const guildDonations = await db.guildDonation.groupBy({ by: ['guildId'], _count: { _all: true }, _sum: { amount: true } });
  console.log('=== GUILD DONATIONS by guild ===', JSON.stringify(guildDonations));
  const logs = await db.adminActionLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  console.log('=== ADMIN ACTION LOG (last 20) ===');
  for (const l of logs) {
    console.log(JSON.stringify({ at: l.createdAt.toISOString(), action: l.action, target: l.targetName, result: l.result, layers: l.layers, details: (l.details ?? '').slice(0, 400) }));
  }
  const players = await db.player.count();
  const humans = await db.player.count({ where: { isBot: false } });
  const accounts = await db.account.findMany({ select: { id: true, username: true, supabaseUserId: true, activePlayerId: true, _count: { select: { players: true } } } });
  console.log('=== PLAYERS ===', JSON.stringify({ total: players, humans, bots: players - humans }));
  console.log('=== ACCOUNTS ===');
  for (const a of accounts) console.log(JSON.stringify({ username: a.username, supabaseUserId: a.supabaseUserId, activePlayerId: a.activePlayerId, players: a._count.players }));
  const sessions = await db.session.count();
  console.log('=== SESSIONS ===', sessions);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
