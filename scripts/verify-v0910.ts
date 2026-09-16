// =====================================================================
// VERIFICAÇÃO v0.9.10 EM BANCO REAL (dev: db/custom.db)
//  1. grantXp com level-up: vida restaura, energia NÃO
//  2. performServerReset: backup VACUUM INTO → wipe → marcador → bots
//  3. Guarda anti-ressurreição: seed pré-reset NÃO vence o banco vivo
// Rodar: bunx tsx scripts/verify-v0910.ts  (ou bun run)
// =====================================================================
import { db } from '../src/lib/db';
import { grantXp } from '../src/lib/economy';
import { performServerReset } from '../src/lib/game/serverReset';
import { snapshotDbCounts } from '../src/lib/game/persistence';
import { xpToNextLevel } from '../src/lib/game/constants';

let pass = 0;
let fail = 0;
const ok = (m: string) => { pass++; console.log(`  ✓ ${m}`); };
const bad = (m: string) => { fail++; console.log(`  ✗ ${m}`); };

async function main() {
  console.log('=== 1. Level-up NÃO restaura energia (grantXp real) ===');
  const now = new Date();
  const player = await db.player.create({
    data: {
      name: 'V0910 Teste Energia',
      race: 'humano',
      level: 1,
      xp: 0,
      zeni: 0,
      crystals: 0,
      hp: 30,             // vida baixa
      energy: 33,         // energia abaixo do máximo (100)
      strength: 10,
      defense: 10,
      speed: 10,
      ki: 10,
      lastRegen: now,
      lastRegenHp: now,
      isBot: false,
    },
  });
  try {
    const need = xpToNextLevel(1) + xpToNextLevel(2) + 5; // sobe 2 níveis e sobra xp
    const res = await grantXp(db, player.id, need, { type: 'reward', source: 'verify' });
    const fresh = await db.player.findUniqueOrThrow({ where: { id: player.id } });

    if (res.levelsGained === 2 && fresh.level === 3) ok(`level-up aplicado: nível ${fresh.level} (ganhos: ${res.levelsGained})`);
    else bad(`level-up não aplicado como esperado: nível ${fresh.level}, ganhos ${res.levelsGained}`);

    const expectedMaxHp = 80 + fresh.level * 15 + fresh.defense * 5;
    if (fresh.hp === expectedMaxHp) ok(`vida restaurada ao novo máximo: ${fresh.hp}`);
    else bad(`vida deveria ser ${expectedMaxHp}, veio ${fresh.hp}`);

    if (fresh.energy === 33) ok(`energia INTACTA: ${fresh.energy} (não restaurada) ✓ Mudança 1`);
    else bad(`energia mexeu: ${fresh.energy} (esperado 33)`);

    // energia acima do máximo continua sendo normalizada para baixo (clampVitals) — comportamento pré-existente
  } finally {
    await db.player.delete({ where: { id: player.id } }).catch(() => undefined);
  }

  console.log('=== 2. RESET GERAL (performServerReset no banco dev) ===');
  const preCounts = {
    contas: await db.account.count(),
    personagens: await db.player.count({ where: { isBot: false } }),
    bots: await db.player.count({ where: { isBot: true } }),
    boss: await db.worldBoss.count(),
  };
  console.log(`  pré-reset: ${JSON.stringify(preCounts)}`);

  const report = await performServerReset('RESET');
  if (report.ok) ok(`reset concluído — backup: ${report.backupPath} (${(report.backupBytes / 1024).toFixed(0)} KB)`);

  const post = {
    contas: await db.account.count(),
    personagens: await db.player.count({ where: { isBot: false } }),
    guildas: await db.guild.count(),
    quests: await db.questProgress.count(),
    conquistas: await db.achievementState.count(),
    boss: await db.worldBoss.count(),
    danos: await db.worldBossDamage.count(),
    ledger: await db.walletTransaction.count(),
    analytics: await db.analyticsEvent.count(),
    temporadas: await db.season.count(),
  };
  const expectZero = ['contas', 'personagens', 'guildas', 'quests', 'conquistas', 'boss', 'danos', 'ledger'];
  for (const k of expectZero) {
    if ((post as Record<string, number>)[k] === 0) ok(`${k} = 0`);
    else bad(`${k} = ${(post as Record<string, number>)[k]} (deveria ser 0)`);
  }
  // analytics guarda EXATAMENTE o evento de auditoria do reset
  if (post.analytics === 1) ok('analytics = 1 (só o evento de auditoria do reset)');
  else bad(`analytics = ${post.analytics} (esperado 1)`);

  if (report.botsReseeded > 0 && (await db.player.count({ where: { isBot: true } })) === report.botsReseeded) {
    ok(`bots de PvP re-semeados: ${report.botsReseeded}`);
  } else bad('bots não foram re-semeados');

  const season = await db.season.findFirst({ where: { status: 'active' } });
  if (season && season.number === 1 && season.name === 'Temporada 1') ok(`temporada nova: ${season.name} (numeração reiniciada)`);
  else bad(`temporada inesperada: ${season?.name}`);

  const marker = await db.gameMeta.findUnique({ where: { key: 'serverResetAt' } });
  if (marker?.value) ok(`GameMeta.serverResetAt = ${marker.value}`);
  else bad('marcador serverResetAt ausente');

  if (await db.gameMeta.findUnique({ where: { key: 'balanceVersion' } })) {
    ok('GameMeta.balanceVersion PRESERVADO (configuração mantida)');
  } else {
    console.log('  (nota: dev não tinha balanceVersion — ok)');
  }

  console.log('=== 3. Guarda anti-ressurreição (seed antigo perde do reset) ===');
  const live = await snapshotDbCounts(process.env.DATABASE_URL?.replace(/^file:/, '') ?? 'db/custom.db');
  const backupCounts = await snapshotDbCounts(report.backupPath);
  // MESMA expressão da guarda real (persistence.ts — reconcileDataOnBoot):
  // seed/backup SEM marcador OU com marcador MAIS ANTIGO que o banco vivo
  // → recusado. Segunda+ execução do reset: o backup novo carrega o marcador
  // do reset ANTERIOR (mais antigo) — também deve ser recusado.
  const seedIsPreReset =
    !!live?.serverResetAt &&
    (!backupCounts?.serverResetAt || backupCounts.serverResetAt < live.serverResetAt);
  if (seedIsPreReset) {
    ok('backup pré-reset (sem marcador ou marcador mais antigo) seria RECUSADO pelo boot — reset permanente ✓');
  } else {
    bad(`marcadores inesperados: live=${live?.serverResetAt} backup=${backupCounts?.serverResetAt}`);
  }

  console.log(`\nRESULTADO: ${pass} ✓ / ${fail} ✗`);
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('ERRO FATAL:', err);
  await db.$disconnect();
  process.exit(1);
});
