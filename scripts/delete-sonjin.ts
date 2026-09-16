/**
 * Deleta o personagem de TESTE "Sonjin" (humano, órfão de conta desde a
 * reforma de segurança v0.2 — inacessível a qualquer sessão).
 *
 * Segurança:
 *  * roda em TRANSAÇÃO com cascata manual/defensiva (guilda, activePlayer);
 *  * só toca o player com name='Sonjin' AND isBot=false;
 *  * as tabelas dependentes (ledger, quests, conquistas, boss, temporada,
 *    doações, dedup) caem por ON DELETE CASCADE do schema;
 *  * backup prévio do banco já existe em /backups (regra absoluta).
 *
 * Uso: bun scripts/delete-sonjin.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const sonjin = await db.player.findFirst({
    where: { name: 'Sonjin', isBot: false },
    include: { guild: { include: { members: true } } },
  });

  if (!sonjin) {
    console.log('Sonjin não encontrado — nada a fazer (banco já está limpo).');
    return;
  }

  console.log(`Encontrado: ${sonjin.name} (lvl ${sonjin.level}, ${sonjin.battlesWon}V/${sonjin.battlesLost}D, ${sonjin.zeni} zeni)`);

  await db.$transaction(
    async (tx) => {
      // guilda defensiva: se fosse líder com membros, transfere; sozinho, dissolve
      if (sonjin.guildId && sonjin.guild) {
        const others = sonjin.guild.members.filter((m) => m.id !== sonjin.id);
        if (others.length === 0) {
          await tx.guild.delete({ where: { id: sonjin.guild.id } });
          console.log(`Guilda "${sonjin.guild.name}" dissolvida (estava vazia).`);
        } else if (sonjin.guild.leaderId === sonjin.id) {
          await tx.guild.update({ where: { id: sonjin.guild.id }, data: { leaderId: others[0].id } });
          console.log(`Liderança de "${sonjin.guild.name}" transferida para ${others[0].name}.`);
        }
      }

      // limpa referência de personagem ativo (defensivo — Sonjin é órfão)
      await tx.account.updateMany({
        where: { activePlayerId: sonjin.id },
        data: { activePlayerId: null },
      });

      // exclusão com cascata (WalletTransaction, QuestProgress, AchievementState,
      // WorldBossDamage, SeasonRankEntry, GuildDonation, RequestDedup)
      await tx.player.delete({ where: { id: sonjin.id } });
      console.log('✓ Sonjin deletado (cascata aplicada).');
    },
    { timeout: 15_000 }
  );

  const bots = await db.player.count({ where: { isBot: true } });
  const humans = await db.player.count({ where: { isBot: false } });
  console.log(`\nContagem final: ${bots} bots, ${humans} humano(s).`);
  console.log(bots === 15 ? '✓ Banco contém exatamente os 15 bots.' : `⚠ Esperado 15 bots, encontrado ${bots}.`);
}

main()
  .catch((e) => {
    console.error('FALHA:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
