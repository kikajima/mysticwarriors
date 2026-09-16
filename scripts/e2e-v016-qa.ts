// =====================================================================
// E2E v0.16 — helpers de QA (setup/verificação/aceleração/cleanup)
// ---------------------------------------------------------------------
// Manipula DIRETAMENTE o banco de dev APENAS dados marcados como QA
// (personagem/guilda com prefixo "QA " criados pelo próprio E2E). O
// personagem real do dono (ex.: Rei Taurion) NUNCA é tocado.
// =====================================================================
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const QA_NAME = process.argv[3] ?? 'QA Matriz V016';
const cmd = process.argv[2] ?? '';

async function main() {
  if (cmd === 'grant') {
    // zeni para fundar guilda (5000) + compras de loja + doações
    const p = await db.player.update({
      where: { name: QA_NAME },
      data: { zeni: { increment: 20000 } },
    });
    console.log(JSON.stringify({ ok: true, player: p.name, zeni: p.zeni }));
  } else if (cmd === 'state') {
    const p = await db.player.findUnique({
      where: { name: QA_NAME },
      select: {
        id: true, name: true, zeni: true, crystals: true, hp: true, energy: true,
        level: true, xp: true, battlesWon: true, missionId: true, missionEndsAt: true,
        guildId: true, professions: true, missionsDone: true,
      },
    });
    if (!p) {
      console.log(JSON.stringify({ ok: false, error: 'player não existe' }));
    } else {
      const guild = p.guildId ? await db.guild.findUnique({ where: { id: p.guildId }, select: { name: true, level: true, totalDonated: true } }) : null;
      const donations = p.guildId ? await db.guildDonation.count({ where: { guildId: p.guildId } }) : 0;
      const activity = await db.activity.findFirst({ where: { playerId: p.id, completedAt: null }, orderBy: { endsAt: 'desc' }, select: { id: true, kind: true, endsAt: true } });
      console.log(JSON.stringify({ ok: true, ...p, guild, donations, runningActivity: activity }));
    }
  } else if (cmd === 'accelerate-mission') {
    // QA ONLY: vence o timer do trabalho AGORA (mantém missionId — a
    // recompensa integral é paga no claim; o horário ORIGINAL foi
    // verificado inalterado ANTES desta aceleração)
    const p = await db.player.findUnique({ where: { name: QA_NAME }, select: { id: true, missionEndsAt: true } });
    if (!p || !p.missionEndsAt) {
      console.log(JSON.stringify({ ok: false, error: 'sem trabalho em andamento' }));
    } else {
      const original = p.missionEndsAt.toISOString();
      await db.player.update({ where: { id: p.id }, data: { missionEndsAt: new Date(Date.now() - 60_000) } });
      console.log(JSON.stringify({ ok: true, originalEndsAt: original, acceleratedTo: new Date(Date.now() - 60_000).toISOString() }));
    }
  } else if (cmd === 'cleanup') {
    // remove SOMENTE dados de QA (prefixo QA) — nunca o dono
    const qaPlayers = await db.player.findMany({ where: { name: { startsWith: 'QA ' } }, select: { id: true, name: true, accountId: true, guildId: true } });
    const qaGuilds = await db.guild.findMany({ where: { name: { startsWith: 'QA ' } }, select: { id: true, name: true } });
    const guildIds = new Set<string>(qaGuilds.map((g) => g.id));
    for (const p of qaPlayers) if (p.guildId) guildIds.add(p.guildId);
    const report = { players: qaPlayers.length, guilds: guildIds.size, donations: 0, activities: 0, accounts: 0, sessions: 0 };
    for (const gid of guildIds) {
      report.donations += await db.guildDonation.deleteMany({ where: { guildId: gid } }).then((r) => r.count);
    }
    for (const p of qaPlayers) {
      report.activities += await db.activity.deleteMany({ where: { playerId: p.id } }).then((r) => r.count);
      if (p.accountId) {
        report.sessions += await db.session.deleteMany({ where: { accountId: p.accountId } }).then((r) => r.count);
        const acc = await db.account.findUnique({ where: { id: p.accountId }, select: { id: true, activePlayerId: true } });
        if (acc) {
          const humans = await db.player.count({ where: { accountId: acc.id, isBot: false } });
          if (humans <= qaPlayers.filter((qp) => qp.accountId === acc.id).length) {
            await db.account.delete({ where: { id: acc.id } }).catch(() => {});
            report.accounts++;
          }
        }
      }
      await db.player.delete({ where: { id: p.id } }).catch(() => {});
    }
    for (const gid of guildIds) {
      await db.guild.delete({ where: { id: gid } }).catch(() => {});
    }
    // contas órfãs de QA (fallback)
    console.log(JSON.stringify({ ok: true, ...report }));
  } else if (cmd === 'counts') {
    const accounts = await db.account.count();
    const humans = await db.player.count({ where: { isBot: false } });
    const bots = await db.player.count({ where: { isBot: true } });
    const guilds = await db.guild.count();
    const donations = await db.guildDonation.count();
    const sessions = await db.session.count();
    const orphanDonations = await db.$queryRawUnsafe(
      `SELECT COUNT(*) as c FROM GuildDonation d LEFT JOIN Guild g ON g.id = d.guildId WHERE d.guildId IS NOT NULL AND g.id IS NULL`
    ) as Array<{ c: number }>;
    console.log(JSON.stringify({ accounts, humans, bots, guilds, donations, sessions, orphanDonations: orphanDonations[0]?.c ?? 0 }));
  } else {
    console.log('uso: bun scripts/e2e-v016-qa.ts <grant|state|accelerate-mission|cleanup|counts> [nome]');
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
