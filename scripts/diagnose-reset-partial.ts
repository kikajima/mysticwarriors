// Diagnóstico v0.9.10.1 — estado do banco local após o reset do usuário
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('=== GameMeta (marcadores de reset) ===');
  const metas = await db.gameMeta.findMany({ where: { key: { contains: 'serverReset' } } });
  for (const m of metas) console.log(`  ${m.key} = ${m.value} (updatedAt ${m.updatedAt.toISOString()})`);

  console.log('\n=== Players humanos (isBot=false) ===');
  const humans = await db.player.findMany({ where: { isBot: false }, orderBy: { createdAt: 'asc' } });
  if (humans.length === 0) console.log('  (nenhum — conta local limpa)');
  for (const p of humans) {
    console.log(
      `  ${p.name} | nível ${p.level} | xp ${p.xp} | criado ${p.createdAt.toISOString()} | accountId=${p.accountId ?? 'null'}`
    );
  }

  console.log('\n=== Bots (nível <= 10) ===');
  const bots = await db.player.findMany({ where: { isBot: true, level: { lte: 10 } }, orderBy: { level: 'asc' } });
  for (const b of bots) console.log(`  ${b.name} | nível ${b.level}`);

  console.log('\n=== Contas locais ===');
  const accounts = await db.account.findMany();
  for (const a of accounts) {
    console.log(
      `  ${a.username} | supabaseUserId=${a.supabaseUserId ?? 'null'} | activePlayerId=${a.activePlayerId ?? 'null'} | criada ${a.createdAt.toISOString()}`
    );
  }

  console.log('\n=== Analytics: server_reset (últimos 3) ===');
  const resets = await db.analyticsEvent.findMany({
    where: { name: 'server_reset' },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  if (resets.length === 0) console.log('  (nenhum reset registrado neste banco)');
  for (const r of resets) {
    const meta = JSON.parse(r.metadata ?? '{}');
    console.log(`  ${r.createdAt.toISOString()} — wiped: ${JSON.stringify(meta.wiped ?? null)}`);
  }

  console.log('\n=== Analytics: cloud_restore (últimos 5) ===');
  const restores = await db.analyticsEvent.findMany({
    where: { name: 'cloud_restore' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  if (restores.length === 0) console.log('  (nenhuma restauração registrada)');
  for (const r of restores) {
    console.log(`  ${r.createdAt.toISOString()} — ${r.metadata}`);
  }
}

main()
  .catch((e) => {
    console.error('ERRO:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
