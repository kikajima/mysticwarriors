// =====================================================================
// VERIFICAÇÃO E2E LOCAL — reset de personagem v0.9.11 (sem auth de rota:
// chama applyAdminActionLocal direto; a autorização do painel é camada
// separada já coberta pelo design da rota /api/admin/action).
// 1. cria personagem de teste "cheio de tudo" (cosméticos, diamantes,
//    avatar, itens, profissão, quests, conquistas, dano no chefe);
// 2. aplica o reset;
// 3. confere campo a campo o que zera e o que preserva;
// 4. APAGA o personagem de teste (limpeza total).
// =====================================================================
import { PrismaClient } from '@prisma/client';
import { applyAdminActionLocal } from '../src/lib/game/adminActions';
import { ensureSeed } from '../src/lib/game/engine';

const db = new PrismaClient();

const NAME = `ZTeste Reset ${Date.now() % 100000}`;

async function main() {
  await ensureSeed();

  // 1) personagem de teste com TUDO que o reset deve zerar
  const acc = await db.account.create({ data: { isGuest: true } });
  const boss = await db.worldBoss.findFirst({ where: { status: 'active' } });
  const player = await db.player.create({
    data: {
      name: NAME,
      race: 'saiyajin',
      accountId: acc.id,
      level: 42,
      xp: 9999,
      zeni: 123456,
      crystals: 320, // ← o bug antigo preservava isto
      avatarUrl: 'https://exemplo.com/avatar.png', // ← e isto
      cosmeticsOwned: JSON.stringify(['aura_chama', 'titan']), // ← e isto
      cosmeticsEquipped: JSON.stringify({ title: 'titan' }), // ← e isto
      transformationsOwned: JSON.stringify(['saiyajin_ss1']),
      transformationId: 'saiyajin_ss1',
      hp: 900,
      energy: 40,
      strength: 200,
      dragonBalls: 5,
      items: JSON.stringify({ weapon: 'katana', armor: null, accessory: null, owned: ['katana'], consumables: { senzu: 3 } }),
      professions: JSON.stringify({ miner: { rank: 3, completions: 12 } }),
      missionsCompleted: JSON.stringify(['miner_turn_1']),
      techniques: JSON.stringify(['kamehameha']),
    },
  });
  await db.questProgress.create({
    data: { playerId: player.id, questId: 'daily_win3', kind: 'daily', period: '2026-09-13', target: 3, progress: 2 },
  });
  await db.achievementState.create({
    data: { playerId: player.id, achievementId: 'first_blood', progress: 1, unlockedAt: new Date(), claimedAt: new Date() },
  });
  await db.season.findFirst({ where: { status: 'active' } }).then(async (s) => {
    if (s) await db.seasonRankEntry.create({ data: { seasonId: s.id, playerId: player.id, points: 777, wins: 12 } });
  });
  if (boss) {
    await db.worldBossDamage.create({
      data: { bossId: boss.id, playerId: player.id, damage: 4321, attacks: 9 },
    });
  }
  console.log(`[setup] ${NAME} criado (conta ${acc.id.slice(0, 8)}...) com cosméticos/diamantes/avatar/quests/conquistas${boss ? '/dano no chefe' : ''}`);

  // 2) RESET
  const res = await applyAdminActionLocal({ characterId: player.id, ownerId: null, action: 'reset' });
  console.log(`[reset] ok=${res.ok}`);
  console.log(`[reset] mensagem: ${res.message}`);

  // 3) conferência campo a campo
  const after = await db.player.findUniqueOrThrow({ where: { id: player.id } });
  const quests = await db.questProgress.count({ where: { playerId: player.id } });
  const achieves = await db.achievementState.count({ where: { playerId: player.id } });
  const seasonPts = await db.seasonRankEntry.count({ where: { playerId: player.id } });
  const bossDmg = boss
    ? await db.worldBossDamage.count({ where: { playerId: player.id, bossId: boss.id } })
    : -1; // -1 = não havia boss ativo no teste

  const checks: Array<[string, boolean]> = [
    ['identidade: nome preservado', after.name === NAME],
    ['identidade: raça preservada', after.race === 'saiyajin'],
    
    ['identidade: vínculo com a conta preservado', after.accountId === acc.id],
    ['nível/XP zerados', after.level === 1 && after.xp === 0],
    ['atributos zerados (10)', after.strength === 10 && after.defense === 10 && after.speed === 10 && after.ki === 10],
    ['HP/energia iniciais', after.hp === 145 && after.energy === 100],
    ['zeni inicial (500)', after.zeni === 500],
    ['DIAMANTES zerados (antes: 320)', after.crystals === 0],
    ['AVATAR zerado (antes: URL)', after.avatarUrl === null],
    ['COSMÉTICOS COMPRADOS zerados', after.cosmeticsOwned === '[]'],
    ['COSMÉTICOS EQUIPADOS zerados', after.cosmeticsEquipped === '{}'],
    ['itens/techniques/loadout zerados', after.items.includes('"owned":[]') && after.techniques === '[]'],
    ['transformações zeradas', after.transformationsOwned === '[]' && after.transformationId === null],
    ['esferas zeradas', after.dragonBalls === 0],
    ['profissões zeradas', after.professions === '{}'],
    ['missões concluídas zeradas', after.missionsCompleted === '[]'],
    ['quests diárias/semanais limpas', quests === 0],
    ['conquistas limpas', achieves === 0],
    ['pontos de temporada limpos', seasonPts === 0],
    ['relógios de regeneração renascidos agora', !!after.lastRegen && !!after.lastRegenHp],
    boss
      ? ['dano no chefe ATUAL removido', bossDmg === 0]
      : ['(sem boss ativo — dano não testável agora)', true],
  ];

  let fails = 0;
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? '✓' : '✗ FALHOU'} ${label}`);
    if (!pass) fails++;
  }

  // 4) limpeza total do teste
  await db.player.delete({ where: { id: player.id } }); // cascata: quests/conquistas/boss damage/rank
  await db.account.delete({ where: { id: acc.id } });
  console.log('[cleanup] personagem e conta de teste removidos');

  console.log(fails === 0 ? '\nRESULTADO: TODAS AS VERIFICAÇÕES PASSARAM' : `\nRESULTADO: ${fails} FALHA(S)`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
