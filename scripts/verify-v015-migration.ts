import { db } from '@/lib/db';
async function main() {
  const cols = await db.$queryRawUnsafe("PRAGMA table_info('Guild');") as Array<{ name: string }>;
  console.log('Guild columns:', cols.map((c) => c.name).join(', '));
  console.log('guilds:', await db.guild.count());
  const kame = await db.player.findUnique({ where: { name: 'Mestre Kame' }, select: { id: true, guildId: true, isBot: true } });
  console.log('Mestre Kame:', JSON.stringify(kame));
  const { countOrphans, summarizeOrphans } = await import('@/lib/game/orphanCheck');
  const summary = summarizeOrphans(await countOrphans(db));
  console.log('matriz anti-órfã:', summary.clean ? `LIMPA — ${summary.detail}` : `SUJA — ${summary.detail}`);
  await db.$disconnect();
}
main();
