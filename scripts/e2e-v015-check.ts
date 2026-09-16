import { db } from '@/lib/db';
import { countOrphans, summarizeOrphans } from '@/lib/game/orphanCheck';
async function main() {
  const guilds = await db.guild.count();
  const donations = await db.guildDonation.count();
  const summary = summarizeOrphans(await countOrphans(db));
  const kame = await db.player.findUnique({ where: { name: 'Mestre Kame' }, select: { guildId: true, isBot: true } });
  console.log(JSON.stringify({
    guildas: guilds,
    doacoes: donations,
    matriz: summary.detail,
    limpa: summary.clean,
    mestreKame: kame ? 'bot sem guilda ✓' : 'ausente',
  }));
  await db.$disconnect();
}
main();
