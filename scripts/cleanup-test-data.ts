import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// Limpa dados de teste, preservando: bots + personagens reais (convidados com progresso)
const KEEP_PLAYERS = ['Sonjin']; // personagem de teste do USUÁRIO (não apagar!)

async function main() {
  // personagens de teste (ligados a contas de teste)
  const testAccounts = await db.account.findMany({
    where: { username: { in: ['teste_guerreiro', 'heroi_teste'] } },
  });
  const accountIds = testAccounts.map((a) => a.id);

  const testPlayers = await db.player.findMany({
    where: { accountId: { in: accountIds } },
  });
  const testPlayerIds = testPlayers.map((p) => p.id);
  console.log('contas de teste:', testAccounts.map((a) => a.username));
  console.log('personagens de teste:', testPlayers.map((p) => p.name));

  // remove personagens de teste das guildas, depois apaga guildas de teste
  await db.player.updateMany({
    where: { id: { in: testPlayerIds } },
    data: { guildId: null },
  });
  const delGuilds = await db.guild.deleteMany({});
  console.log('guildas removidas:', delGuilds.count);

  // apaga personagens de teste
  const delPlayers = await db.player.deleteMany({
    where: { id: { in: testPlayerIds } },
  });
  console.log('personagens de teste removidos:', delPlayers.count);

  // apaga contas de teste
  const delAccounts = await db.account.deleteMany({
    where: { id: { in: accountIds } },
  });
  console.log('contas removidas:', delAccounts.count);

  // sanity check
  const remaining = await db.player.findMany({ where: { isBot: false } });
  console.log('personagens restantes (reais):', remaining.map((p) => `${p.name} (nv ${p.level})`));
  const bots = await db.player.count({ where: { isBot: true } });
  console.log('bots preservados:', bots);
  void KEEP_PLAYERS;
}

main().finally(() => db.$disconnect());
