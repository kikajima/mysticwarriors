// =====================================================================
// F1 — REGENERAÇÃO IDEMPOTENTE: TESTES COMPORTAMENTAIS E2E (servidor real)
// ---------------------------------------------------------------------
// Mentalidade do invasor: "consultar MUITO regenera MAIS?" — provamos que
// NÃO com números, no código rodando (HEAD + hardening F4):
//
//  Teste A (polling agressivo): 1 consulta/segundo por 120s numa vida
//    ferida (HP 1/145, intervalo 12s) → ganho tem que ser +10 EXATOS.
//  Teste B (offline): 120s SEM NENHUMA consulta → UMA única no fim →
//    acúmulo integral (+10) — não perde por ausência.
//  Teste C (duas abas): DOIS polidores concorrentes por 60s → mesma
//    progressão do relógio, sem divergência nem regen dobrado.
//  Energia (intervalo 300s): relógio manipulado p/ cruzar a janela
//    (lastRegen = now−590s) — polling 30s vs 1 consulta única → +2 IGUAL.
//
// Uso: bun scripts/auditoria-f1-regen-e2e.ts   (~6 min de execução)
// =====================================================================

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const BASE = 'http://localhost:3000';
const db = new PrismaClient();

let pass = 0;
let fail = 0;
function check(desc: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${desc}${detail ? `  (${detail})` : ''}`);
  } else {
    fail++;
    console.log(`  ✗ FALHOU: ${desc} ${detail}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makePlayer(name: string): Promise<{ cookie: string; playerId: string }> {
  const { initialPlayerData } = await import('../src/lib/game/characterInitial');
  const account = await db.account.create({ data: { isGuest: true } });
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  await db.session.create({
    data: { token, accountId: account.id, expiresAt: new Date(Date.now() + 7200_000) },
  });
  const base = initialPlayerData() as Record<string, unknown>;
  const player = await db.player.create({
    data: {
      ...base,
      name,
      race: 'saiyajin',
      accountId: account.id,
      hp: 1,
      energy: 100,
      lastRegen: new Date(),
      lastRegenHp: new Date(),
    },
  });
  await db.account.update({ where: { id: account.id }, data: { activePlayerId: player.id } });
  return { cookie: `gm_session=${token}`, playerId: player.id };
}

async function getState(cookie: string, playerId: string): Promise<{ ok: boolean; hp: number; energy: number }> {
  try {
    const res = await fetch(`${BASE}/api/game/state?playerId=${playerId}`, { headers: { cookie } });
    if (res.status === 429) return { ok: false, hp: -1, energy: -1 };
    const json = await res.json();
    return { ok: !!json?.success, hp: json?.player?.hp ?? -1, energy: json?.player?.energy ?? -1 };
  } catch {
    return { ok: false, hp: -1, energy: -1 };
  }
}

/** Polidor: consulta a cada `intervalMs` por `durationMs`; devolve amostras (t, hp). */
async function poller(cookie: string, playerId: string, intervalMs: number, durationMs: number) {
  const samples: Array<{ t: number; hp: number }> = [];
  let rateLimited = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < durationMs) {
    await sleep(intervalMs);
    const s = await getState(cookie, playerId);
    if (s.ok) samples.push({ t: Date.now() - t0, hp: s.hp });
    else if (s.hp === -1 && s.energy === -1) rateLimited++;
  }
  return { samples, rateLimited };
}

async function main() {
  const ts = Date.now().toString(36);
  const { cookie, playerId } = await makePlayer(`F1 Regen ${ts.slice(-6)}`);
  const p0 = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  const MAX_HP = 80 + p0.level * 15 + p0.defense * 5;
  console.log('=================================================================');
  console.log('F1 — REGEN IDEMPOTENTE (E2E, servidor real, relógio real)');
  console.log(`=================================================================`);
  console.log(`Personagem: vida 1/${MAX_HP} (intervalo 12s), energia 100/100 (intervalo 300s)`);

  // ============ TESTE A — polling agressivo 1/s × 120s ============
  console.log('\n--- Teste A: 1 consulta/segundo por 120s (polling agressivo) ---');
  await db.player.update({ where: { id: playerId }, data: { hp: 1, lastRegenHp: new Date(), energy: 100, lastRegen: new Date() } });
  const t0 = Date.now();
  const A = await poller(cookie, playerId, 1020, 120_000);
  const elapsedA = Date.now() - t0;
  const dbA = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  const expectedA = Math.floor(elapsedA / 12_000); // pontos completos no horizonte
  check(`A: polling ${A.samples.length}× em ${(elapsedA / 1000).toFixed(0)}s (429: ${A.rateLimited}) → +${dbA.hp - 1} HP`, dbA.hp === 1 + expectedA, `hp=${dbA.hp}, esperado=${1 + expectedA}`);
  const excessA = Math.max(...A.samples.map((s) => s.hp - (1 + Math.floor(s.t / 12_000))));
  check('A: nenhuma amostra ULTRAPASSOU o teto do relógio (floor(t/12)+1)', A.samples.every((s) => s.hp <= 1 + Math.floor(s.t / 12_000)), `maior excedente=${excessA}`);

  // ============ TESTE B — offline: 120s SEM consultar ============
  console.log('\n--- Teste B: 120s SEM NENHUMA consulta (offline) ---');
  const silenceStart = Date.now();
  await sleep(120_000);
  const one = await getState(cookie, playerId);
  const silenceMs = Date.now() - silenceStart;
  const expectedB = Math.floor((silenceMs + 500) / 12_000); // +0,5s de folga de rede
  const silenceSec = (silenceMs / 1000).toFixed(0);
  check(`B: acúmulo INTEGRAL após ${silenceSec}s sem consultar → +${one.hp - dbA.hp} HP`, one.hp === dbA.hp + expectedB, `hp=${one.hp}, esperado=${dbA.hp + expectedB}`);

  // ============ TESTE C — duas abas consultando concorrentemente ============
  console.log('\n--- Teste C: DUAS abas consultando concorrentemente por 60s ---');
  const hpBeforeC = one.hp;
  const cStart = Date.now();
  const [C1, C2] = await Promise.all([
    poller(cookie, playerId, 2100, 60_000),
    poller(cookie, playerId, 2100, 60_000),
  ]);
  const cMs = Date.now() - cStart;
  const allC = [...C1.samples, ...C2.samples].sort((a, b) => a.t - b.t);
  const expectedC = Math.floor((cMs + 800) / 12_000);
  const dbC = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  check(`C: 2 polidores (${C1.samples.length}+${C2.samples.length} consultas) → +${dbC.hp - hpBeforeC} HP`, dbC.hp === hpBeforeC + expectedC, `hp=${dbC.hp}, esperado=${hpBeforeC + expectedC}`);
  check('C: nenhuma aba viu HP acima do teto do relógio (sem regen dobrado)', allC.every((s) => s.hp <= hpBeforeC + Math.floor((s.t + 900) / 12_000)), `max excedente=${Math.max(...allC.map((s) => s.hp - (hpBeforeC + Math.floor((s.t + 900) / 12_000))))}`);
  check('C: ambas as abas viram o MESMO estado (últimas amostras convergem)', Math.abs((C1.samples.at(-1)?.hp ?? 0) - (C2.samples.at(-1)?.hp ?? 0)) <= 1, `fim aba1=${C1.samples.at(-1)?.hp}, fim aba2=${C2.samples.at(-1)?.hp}`);

  // ============ ENERGIA — polling vs consulta única (janela de 300s) ============
  console.log('\n--- Energia: relógio a 590s do intervalo de 300s — polling 30s vs 1 consulta ---');
  // janela 1: POLLING
  await db.player.update({ where: { id: playerId }, data: { energy: 95, lastRegen: new Date(Date.now() - 590_000) } });
  const eA = await poller(cookie, playerId, 1020, 30_000);
  const dbEA = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  check(`Energia A: polling 30s cruzando a janela → +${dbEA.energy - 95} (esperado +2: 1 imediato + 1 na janela)`, dbEA.energy === 97, `energy=${dbEA.energy}, consultas=${eA.samples.length}`);
  // janela 2: UMA consulta no fim (mesma condição inicial)
  await db.player.update({ where: { id: playerId }, data: { energy: 95, lastRegen: new Date(Date.now() - 590_000) } });
  await sleep(30_000);
  const eB = await getState(cookie, playerId);
  check('Energia B: 30s SEM consultar + 1 consulta → +2 IGUAL ao polling', eB.energy === 97, `energy=${eB.energy} (polling tinha dado ${dbEA.energy})`);

  // ============ verificação de relógio: recurso cheio congela ============
  const pEnd = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  check('Sanidade: HP final abaixo do teto durante todo o teste', pEnd.hp <= MAX_HP, `hp=${pEnd.hp}/${MAX_HP}`);

  // ===== limpeza =====
  await db.questProgress.deleteMany({ where: { playerId } });
  await db.achievementState.deleteMany({ where: { playerId } });
  await db.activity.deleteMany({ where: { playerId } });
  await db.analyticsEvent.deleteMany({ where: { playerId } });
  await db.session.deleteMany({ where: { account: { id: pEnd.accountId! } } });
  await db.player.delete({ where: { id: playerId } });
  await db.account.delete({ where: { id: pEnd.accountId! } });
  console.log('\n=================================================================');
  console.log(`F1 REGEN E2E: ${pass} passaram / ${fail} falharam`);
  console.log('=================================================================');
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('erro fatal:', e);
  await db.$disconnect();
  process.exit(1);
});
