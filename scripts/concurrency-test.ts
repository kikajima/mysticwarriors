/**
 * TESTES DE CONCORRÊNCIA — Myst Ki Warriors
 * Roda contra o dev server (localhost:3000). Verifica que operações
 * simultâneas NÃO duplicam efeitos (compra, claim, boss).
 *
 * Uso: bun scripts/concurrency-test.ts
 */
const BASE = 'http://localhost:3000';

function jar(): { cookie: string } {
  return { cookie: '' };
}

async function post(path: string, cookie: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function get(path: string, cookie = ''): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function extractCookie(res: globalThis.Response): string {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    if (c.startsWith('gm_session=')) return c.split(';')[0];
  }
  return '';
}

let pass = 0;
let fail = 0;
function check(desc: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`✓ ${desc}`);
  } else {
    fail++;
    console.log(`✗ FALHOU: ${desc} ${detail}`);
  }
}

async function main() {
  const ts = Date.now();

  // ===== cria conta + personagem =====
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `conc_${ts}`, password: 'senha12345' }),
  });
  const cookie = extractCookie(reg);
  check('conta criada', reg.ok);

  const created = await post('/api/game/create', cookie, { name: `CC${ts % 1000000000}`, race: "saiyajin" });
  const playerId = created.json?.player?.id;
  check('personagem criado', !!playerId);

  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();

  // ===== TESTE 1: duas compras SIMULTÂNEAS com saldo para apenas UMA =====
  // saldo 500; dois 'bastao' (900) — nenhum deve passar; melhor: saldo exato
  await db.player.update({ where: { id: playerId }, data: { zeni: 700 } });
  // item 'luvas' custa 300 → duas compras simultâneas caberiam se não houvesse guarda
  // mas "owned" impede a 2ª (stateVersion). Com saldo 700: 1ª passa, 2ª falha (ITEM_ALREADY_OWNED
  // via conflito otimista) OU se fosse consumível, falharia por saldo insuficiente.
  const buy1 = post('/api/game/action', cookie, { playerId, type: 'buy', itemId: 'luvas' });
  const buy2 = post('/api/game/action', cookie, { playerId, type: 'buy', itemId: 'luvas' });
  const [r1, r2] = await Promise.all([buy1, buy2]);
  const successes = [r1, r2].filter((r) => r.json?.success).length;
  check('compras simultâneas do MESMO item: no máximo 1 sucesso', successes <= 1, `(sucessos=${successes})`);

  // ===== TESTE 2: dois claims SIMULTÂNEOS de missão concluída =====
  await db.player.update({
    where: { id: playerId },
    data: {
      missionId: 'agricultor',
      missionEndsAt: new Date(Date.now() - 60000), // já terminou
      missionsDone: 0,
    },
  });
  const zeniBefore = (await db.player.findUniqueOrThrow({ where: { id: playerId } })).zeni;
  const claim1 = post('/api/game/action', cookie, { playerId, type: 'claim_mission' });
  const claim2 = post('/api/game/action', cookie, { playerId, type: 'claim_mission' });
  const [c1, c2] = await Promise.all([claim1, claim2]);
  const claimSuccesses = [c1, c2].filter((r) => r.json?.success).length;
  check('claims simultâneos de missão: exatamente 1 sucesso', claimSuccesses === 1, `(sucessos=${claimSuccesses})`);
  const playerAfter = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  check('missão consumida (missionId=null)', playerAfter.missionId === null);
  // recompensa do turno rank 1 de agricultor: 300 zeni (+500 inicial)
  const zeniGain = playerAfter.zeni - zeniBefore;
  // rank 1 paga 300 (padrão); androide paga 315 (+5%)
  check('recompensa creditada UMA vez (300 do turno, sem duplicar)', zeniGain >= 300 && zeniGain <= 315, `(ganho=${zeniGain})`);

  // ===== TESTE 3: ataques SIMULTÂNEOS ao World Boss pelo MESMO jogador =====
  await db.player.update({ where: { id: playerId }, data: { hp: 99999, energy: 999 } });
  const atk1 = post('/api/game/action', cookie, { playerId, type: 'world_boss_attack' });
  const atk2 = post('/api/game/action', cookie, { playerId, type: 'world_boss_attack' });
  const [a1, a2] = await Promise.all([atk1, atk2]);
  const atkSuccesses = [a1, a2].filter((r) => r.json?.success).length;
  check('ataques simultâneos ao boss: no máximo 1 sucesso (cooldown atômico)', atkSuccesses <= 1, `(sucessos=${atkSuccesses})`);

  // HP do boss nunca fica negativo
  const boss = await db.worldBoss.findFirst({ where: { status: 'active' } });
  if (boss) {
    check('HP do boss nunca negativo', boss.currentHp >= 0, `(hp=${boss.currentHp})`);
  }

  // ===== TESTE 4: dois desejos SIMULTÂNEOS com 7 Chaves =====
  await db.player.update({ where: { id: playerId }, data: { dragonBalls: 7, zeni: 0 } });
  const w1 = post('/api/game/action', cookie, { playerId, type: 'wish', wishType: 'riqueza' });
  const w2 = post('/api/game/action', cookie, { playerId, type: 'wish', wishType: 'riqueza' });
  const [w1r, w2r] = await Promise.all([w1, w2]);
  const wishSuccesses = [w1r, w2r].filter((r) => r.json?.success).length;
  check('desejos simultâneos: exatamente 1 sucesso', wishSuccesses === 1, `(sucessos=${wishSuccesses})`);
  const afterWish = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  check('Resiliência Estelar do desejo: +8000 exatamente (sem duplicar)', afterWish.zeni === 8000, `(zeni=${afterWish.zeni})`);
  check('esferas zeradas', afterWish.dragonBalls === 0);

  // ===== TESTE 5: state polling concorrente não corrompe regen =====
  const states = await Promise.all([
    get(`/api/game/state?playerId=${playerId}`, cookie),
    get(`/api/game/state?playerId=${playerId}`, cookie),
    get(`/api/game/state?playerId=${playerId}`, cookie),
  ]);
  check(
    'estado concorrente: todas as respostas ok',
    states.every((s) => s.status === 200),
    `(statuses=${states.map((s) => s.status).join(',')})`
  );

  // ===== limpeza =====
  await db.player.deleteMany({ where: { id: playerId } });
  await db.account.deleteMany({ where: { username: `conc_${ts}` } });
  await db.$disconnect();

  console.log('\n=========================================');
  console.log(`CONCORRÊNCIA: ${pass} passaram / ${fail} falharam`);
  console.log('=========================================');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('erro fatal:', e);
  process.exit(1);
});
