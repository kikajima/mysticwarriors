// =====================================================================
// F4 — AUDITORIA DE IDEMPOTÊNCIA E CONCORRÊNCIA (E2E agressivo)
// --------------------------------------------------------------------
// Mentalidade: "jogador sem escrúpulos querendo o Top 1".
// Roda contra o dev server (localhost:3000). Todas as requisições usam
// requestIds DISTINTOS (o mais próximo do ataque real: o dedup do
// servidor não protege cliques duplos de abas diferentes) — exceto o
// teste dedicado de replay (mesmo requestId).
//
// Grade:
//  T1  claim de conquista ×4 em paralelo → exatamente 1 recompensa
//  T2  claim de quest diária ×4 em paralelo → exatamente 1 recompensa
//  T3  compra do MESMO item ×4 com saldo p/ 3 → 3 sucessos, 3 itens, Zeni exato
//  T4  compras PARALELAS de itens diferentes + mesmo item (lost-update de JSON)
//      + vendas paralelas (duplicação de moeda) — a sonda clássica
//  T5  treino ×2 com energia p/ 1 → 1 sucesso (débito condicional)
//  T6  início de profissão ×3 → 1 sucesso; claim do turno ×2 → 1 pagamento
//  T7  início de batalha ×2 em paralelo (check-then-act de atividade)
//  T8  resolução exactly-once pós-término (3 GETs de estado paralelos)
//  T9  combos: trabalho ativo bloqueia treino/batalha/PvP, LIBERA boss
//  T10 boss mundial: 5 jogadores atacam em paralelo → HP atômico, dano
//      somando exatamente, morte exatamente 1×, recompensa 1× por jogador
//  T11 "duas abas" (mesma sessão) comprando o mesmo item
//  T12 spam de compras rápidas ×10 + vendas
//  T13 replay com o MESMO requestId → resultado em cache, sem re-executar
//
// Uso: bun scripts/auditoria-f4-concorrencia.ts
// =====================================================================

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const BASE = 'http://localhost:3000';
const db = new PrismaClient();

let pass = 0;
let fail = 0;
const breaches: string[] = [];

function check(desc: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${desc}${detail ? `  (${detail})` : ''}`);
  } else {
    fail++;
    breaches.push(`${desc} ${detail}`);
    console.log(`  ✗ FALHOU: ${desc} ${detail}`);
  }
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

async function get(path: string, cookie: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Cria conta+sessão+personagem DIRETO no banco (sem rate limit de registro). */
async function makePlayer(opts: {
  name: string;
  race?: string;
  level?: number;
  stats?: number;
  zeni?: number;
  crystals?: number;
  hp?: number;
  energy?: number;
}): Promise<{ cookie: string; playerId: string }> {
  const { initialPlayerData } = await import('../src/lib/game/characterInitial');
  const account = await db.account.create({ data: { isGuest: true } });
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  await db.session.create({
    data: { token, accountId: account.id, expiresAt: new Date(Date.now() + 3600_000) },
  });
  const base = initialPlayerData() as Record<string, unknown>;
  const stats = opts.stats ?? 10;
  const level = opts.level ?? 1;
  const player = await db.player.create({
    data: {
      ...base,
      name: opts.name,
      race: (opts.race ?? 'saiyajin') as string,
      accountId: account.id,
      level,
      strength: stats,
      defense: stats,
      speed: stats,
      ki: stats,
      hp: opts.hp ?? 80 + level * 15 + stats * 5,
      energy: opts.energy ?? 80 + stats * 2,
      zeni: opts.zeni ?? 0,
      crystals: opts.crystals ?? 0,
      lastRegen: new Date(),
      lastRegenHp: new Date(),
    },
  });
  await db.account.update({ where: { id: account.id }, data: { activePlayerId: player.id } });
  return { cookie: `gm_session=${token}`, playerId: player.id };
}

/** Resumo dos erros de um lote (para diagnóstico). */
function codes(rs: Array<{ status: number; json: any }>): string {
  return rs.filter((r) => !r.json?.success).map((r) => `${r.json?.error?.code ?? r.status}`).join(',') || 'nenhum';
}

async function main() {
  const ts = Date.now().toString(36);
  console.log('=================================================================');
  console.log('F4 — AUDITORIA DE CONCORRÊNCIA E IDEMPOTÊNCIA (servidor real)');
  console.log('=================================================================');

  // ===== conta principal (direto no banco — o register via API tem rate
  // limit de 5/30min por IP, já consumido pelas rodadas da auditoria; o
  // camho HTTP real de auth foi exercitado nas rodadas 1-5) =====
  const main = await makePlayer({ name: `F4 Auditor ${ts.slice(-6)}`, race: 'saiyajin' });
  check('conta e personagem criados', !!main.playerId);

  // ============ T5 — treino duplo com energia para UM ============
  console.log('\n--- T5: double-click no TREINO (energia exata para 1) ---');
  await db.player.update({
    where: { id: main.playerId },
    data: { energy: 3, zeni: 100, strength: 10, trainingsDone: 0 },
  });
  const t5 = await Promise.all([
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'train', stat: 'strength', requestId: randomUUID() }),
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'train', stat: 'strength', requestId: randomUUID() }),
  ]);
  const t5ok = t5.filter((r) => r.json?.success).length;
  const p5 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  check('T5: exatamente 1 treino passou (energia condicional)', t5ok === 1, `sucessos=${t5ok}`);
  check('T5: Força +1 (não +2)', p5.strength === 11, `strength=${p5.strength}`);
  check('T5: energia zerada (3−3)', p5.energy === 0, `energy=${p5.energy}`);
  check('T5: Zeni debitado 1× (20)', p5.zeni === 80, `zeni=${p5.zeni}`);

  // ============ T6 — profissão: início ×3 e claim ×2 ============
  console.log('\n--- T6: início de trabalho ×3 paralelo + claim do turno ×2 ---');
  await db.player.update({ where: { id: main.playerId }, data: { missionId: null, missionEndsAt: null } });
  const t6 = await Promise.all([1, 2, 3].map(() =>
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'mission', missionId: 'agricultor', requestId: randomUUID() })
  ));
  const t6ok = t6.filter((r) => r.json?.success).length;
  check('T6a: exatamente 1 início de trabalho', t6ok === 1, `sucessos=${t6ok}`);
  // turno JÁ vencido (não esperamos 1h): claim ×2 paralelo
  await db.player.update({
    where: { id: main.playerId },
    data: { missionId: 'agricultor', missionEndsAt: new Date(Date.now() - 60_000), missionsDone: 0, zeni: 0 },
  });
  const t6c = await Promise.all([1, 2].map(() =>
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'claim_mission', requestId: randomUUID() })
  ));
  const t6cok = t6c.filter((r) => r.json?.success).length;
  const p6 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  check('T6b: pagamento coletado exatamente 1×', t6cok === 1, `sucessos=${t6cok}`);
  check('T6b: Zeni = 300 (rank 1), sem duplicar', p6.zeni === 300, `zeni=${p6.zeni}`);
  check('T6b: trabalho limpo (missionId null)', p6.missionId === null);

  // ============ T9 — combos: trabalho ativo × outras ações ============
  console.log('\n--- T9: trabalho ATIVO bloqueia treino/batalha/PvP mas LIBERA boss ---');
  const pvpTarget = await makePlayer({ name: `F4 Alvo ${ts.slice(-6)}`, race: 'humano', level: 1 });
  await db.player.update({
    where: { id: main.playerId },
    data: { missionId: 'agricultor', missionEndsAt: new Date(Date.now() + 3600_000), hp: 145, energy: 50 },
  });
  const cTrain = await post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'train', stat: 'strength', requestId: randomUUID() });
  const cBattle = await post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'battle', enemyId: 'arruaceiro_ermo', requestId: randomUUID() });
  const cPvp = await post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'attack_player', targetId: pvpTarget.playerId, requestId: randomUUID() });
  const cBoss = await post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'world_boss_attack', requestId: randomUUID() });
  check('T9: treino BLOQUEADO durante trabalho', !cTrain.json?.success && cTrain.json?.error?.code === 'PLAYER_BUSY_ON_MISSION', `code=${cTrain.json?.error?.code}`);
  check('T9: batalha PvE BLOQUEADA durante trabalho', !cBattle.json?.success && cBattle.json?.error?.code === 'PLAYER_BUSY_ON_MISSION', `code=${cBattle.json?.error?.code}`);
  check('T9: PvP BLOQUEADO durante trabalho', !cPvp.json?.success && cPvp.json?.error?.code === 'PLAYER_BUSY_ON_MISSION', `code=${cPvp.json?.error?.code}`);
  check('T9: boss mundial LIBERADO durante trabalho', cBoss.json?.success === true, `code=${cBoss.json?.error?.code ?? 'OK'}`);
  await db.player.update({ where: { id: main.playerId }, data: { missionId: null, missionEndsAt: null } });

  // ============ T7 — início de batalha ×2 paralelo (check-then-act) ============
  console.log('\n--- T7: double-click em INICIAR BATALHA (corrida de atividade) ---');
  await db.player.update({ where: { id: main.playerId }, data: { energy: 6, hp: 145, battlesWon: 0, battlesLost: 0 } });
  const t7 = await Promise.all([
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'battle', enemyId: 'arruaceiro_ermo', requestId: randomUUID() }),
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'battle', enemyId: 'arruaceiro_ermo', requestId: randomUUID() }),
  ]);
  const t7ok = t7.filter((r) => r.json?.success).length;
  const acts = await db.activity.findMany({ where: { playerId: main.playerId, completedAt: null } });
  check('T7: exatamente 1 batalha iniciada (bloqueio atômico de atividade)', t7ok === 1 && acts.length === 1, `sucessos=${t7ok}, atividades=${acts.length}`);
  const act = acts[0];

  // ============ T8 — resolução exactly-once pós-término (refresh) ============
  console.log('\n--- T8: refresh pós-término → resultado exatamente 1× (3 abas paralelas) ---');
  if (act) {
    const waitMs = Math.max(0, act.endsAt.getTime() - Date.now()) + 2500;
    await new Promise((r) => setTimeout(r, waitMs));
    const zeniBefore = (await db.player.findUniqueOrThrow({ where: { id: main.playerId } })).zeni;
    const t8 = await Promise.all([1, 2, 3].map(() =>
      get(`/api/game/state?playerId=${main.playerId}`, main.cookie)
    ));
    const totalResults = t8.reduce((s, r) => s + (r.json?.pendingResults?.length ?? 0), 0);
    const p8 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
    const deltaZ = p8.zeni - zeniBefore;
    check('T8: resultado da batalha aplicado exatamente 1× (3 leitores paralelos)', totalResults === 1, `resultados=${totalResults}`);
    check('T8: sem batalha pendente residual', (await db.activity.count({ where: { playerId: main.playerId, completedAt: null } })) === 0);
    // Mortal I paga 68 Zeni base × rand(0,9–1,15) = 61–78.
    // Derrota paga 0 — qualquer valor FORA desse intervalo seria duplicação.
    check('T8: recompensa refletida 1× (ΔZeni em 61–78 vitória / 0 derrota)', deltaZ === 0 || (deltaZ >= 61 && deltaZ <= 78), `Δ=${deltaZ}`);
  }

  // ============ T1 — claim de conquista ×4 paralelo ============
  console.log('\n--- T1: double-click em COLETAR CONQUISTA (4 paralelos) ---');
  await db.player.update({ where: { id: main.playerId }, data: { battlesWon: 1, zeni: 0, crystals: 0, xp: 0 } });
  await db.achievementState.deleteMany({ where: { playerId: main.playerId } });
  const t1 = await Promise.all([1, 2, 3, 4].map(() =>
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'claim_achievement', achievementId: 'first_blood', requestId: randomUUID() })
  ));
  const t1ok = t1.filter((r) => r.json?.success).length;
  const p1 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  check('T1: exatamente 1 claim de conquista', t1ok === 1, `sucessos=${t1ok}`);
  check('T1: recompensa 1× (+200 Zeni, +1💎, +50 XP)', p1.zeni === 200 && p1.crystals === 1 && p1.xp === 50, `zeni=${p1.zeni},💎=${p1.crystals},xp=${p1.xp}`);
  const ledgerZ = await db.walletTransaction.count({
    where: { playerId: main.playerId, source: 'achievement', currency: 'zeni' },
  });
  const ledgerC = await db.walletTransaction.count({
    where: { playerId: main.playerId, source: 'achievement', currency: 'crystal' },
  });
  check('T1: ledger registrou 1× Zeni E 1× 💎 (uma linha por moeda)', ledgerZ === 1 && ledgerC === 1, `zeni=${ledgerZ}, 💎=${ledgerC}`);

  // ============ T2 — claim de quest diária ×4 paralelo ============
  console.log('\n--- T2: double-click em COLETAR QUEST DIÁRIA (4 paralelos) ---');
  await get(`/api/game/state?playerId=${main.playerId}`, main.cookie); // ensureQuests
  const qRow = await db.questProgress.findFirst({
    where: { playerId: main.playerId, kind: 'daily' },
  });
  if (qRow) {
    await db.questProgress.update({ where: { id: qRow.id }, data: { progress: qRow.target, claimed: false, claimedAt: null } });
    const zeniQ = (await db.player.findUniqueOrThrow({ where: { id: main.playerId } })).zeni;
    const t2 = await Promise.all([1, 2, 3, 4].map(() =>
      post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'claim_quest', questId: qRow.questId, requestId: randomUUID() })
    ));
    const t2ok = t2.filter((r) => r.json?.success).length;
    const p2 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
    const qReward = qRow.rewardZeni + qRow.rewardXp * 0; // XP não vira Zeni
    check('T2: exatamente 1 claim da quest', t2ok === 1, `sucessos=${t2ok}`);
    check('T2: recompensa creditada 1×', p2.zeni === zeniQ + qReward, `Δ=${p2.zeni - zeniQ} (esperado ${qReward})`);
  } else {
    check('T2: quest diária gerada para o teste', false, 'linha não encontrada');
  }

  // ============ T3 — compra do mesmo item ×4 com saldo p/ 3 ============
  console.log('\n--- T3: compra do MESMO item ×4 (saldo para 3) ---');
  await db.player.update({
    where: { id: main.playerId },
    data: { zeni: 1000, items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}' },
  });
  const t3 = await Promise.all([1, 2, 3, 4].map(() =>
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'buy', itemId: 'luvas', requestId: randomUUID() })
  ));
  const t3ok = t3.filter((r) => r.json?.success).length;
  const p3 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  const items3 = JSON.parse(p3.items as string);
  // com a serialização por personagem (v-auditoria F4), os 4 cliques em
  // fila consumindo 300 cada com saldo 1.000 → exatamente 3 passam, a 4ª
  // recebe INSUFFICIENT_ZENI — determinístico, sem corrida
  check('T3: compras serializadas: exatamente 3 (saldo), 4ª recusada', t3ok === 3, `sucessos=${t3ok}, erros=[${codes(t3)}]`);
  check('T3: inventário == sucessos (sem perder item pago)', ownedCount(items3, 'luvas') === t3ok, `unidades=${ownedCount(items3, 'luvas')}`);
  check('T3: Zeni exato (1000 − 300×sucessos)', p3.zeni === 1000 - 300 * t3ok, `zeni=${p3.zeni}`);

  // ============ T4 — corrida de JSON: itens diferentes em paralelo ============
  console.log('\n--- T4: LOST-UPDATE de inventário (compras paralelas de itens DIFERENTES) ---');
  for (let round = 1; round <= 3; round++) {
    await db.player.update({
      where: { id: main.playerId },
      data: { crystals: 16, items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}' },
    });
    const t4 = await Promise.all([
      post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'buy', itemId: 'capsula_ki', requestId: randomUUID() }),
      post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'buy', itemId: 'senzu', requestId: randomUUID() }),
    ]);
    const ok4 = t4.filter((r) => r.json?.success).length;
    const p4 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
    const c4 = JSON.parse(p4.items as string).consumables as Record<string, number>;
    check(
      `T4r${round}: 2 compras distintas paralelas → AMBOS os itens no inventário (pago ≠ perdido)`,
      ok4 === 2 && c4['capsula_ki'] === 1 && c4['senzu'] === 1,
      `ok=${ok4}, capsula=${c4['capsula_ki'] ?? 0}, senzu=${c4['senzu'] ?? 0}, 💎=${p4.crystals}`
    );
  }
  // mesmo item ×3 paralelo (o clássico read-modify-write)
  // INVARIANTE REAL: o stateVersion (bloqueio otimista do updateJsonState)
  // garante que apenas UNA das transações concorrentes grave o inventário —
  // as demais recebem CONFLICT e a transação INTEIRA rola de volta (nem
  // debita, nem perde item). Sem duplicação e sem perder dinheiro.
  await db.player.update({
    where: { id: main.playerId },
    data: { crystals: 18, items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}' },
  });
  const t4b = await Promise.all([1, 2, 3].map(() =>
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'buy', itemId: 'capsula_ki', requestId: randomUUID() })
  ));
  const ok4b = t4b.filter((r) => r.json?.success).length;
  const conflict4b = t4b.filter((r) => r.json?.error?.code === 'CONFLICT').length;
  const p4b = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  const c4b = JSON.parse(p4b.items as string).consumables as Record<string, number>;
  check('T4b: compras paralelas do MESMO item: unidades == sucessos (nem perda nem duplicação)', (c4b['capsula_ki'] ?? 0) === ok4b && ok4b >= 1, `ok=${ok4b} (CONFLICT=${conflict4b}), unidades=${c4b['capsula_ki'] ?? 0}`);
  check('T4b: 💎 debitado EXATAMENTE pelos sucessos (18−6×ok)', p4b.crystals === 18 - 6 * ok4b, `💎=${p4b.crystals} (esperado ${18 - 6 * ok4b})`);
  // vendas paralelas (duplicação de moeda?) — mesmo invariante espelhado
  const crystalsBeforeSell = p4b.crystals;
  const unitsBeforeSell = c4b['capsula_ki'] ?? 0;
  const t4c = await Promise.all([1, 2, 3].map(() =>
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'sell', itemId: 'capsula_ki', quantity: 1, requestId: randomUUID() })
  ));
  const ok4c = t4c.filter((r) => r.json?.success).length;
  const p4c = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  const c4c = JSON.parse(p4c.items as string).consumables as Record<string, number>;
  check('T4c: vendas paralelas: unidades vendidas == sucessos (estoque coerente)', unitsBeforeSell - ok4c === (c4c['capsula_ki'] ?? 0), `vendas=${ok4c}, estoque=${c4c['capsula_ki'] ?? 0} de ${unitsBeforeSell}`);
  check('T4c: crédito exato 3💎×vendas (sem duplicar moeda)', p4c.crystals === crystalsBeforeSell + 3 * ok4c, `💎=${p4c.crystals} (antes ${crystalsBeforeSell} + ${3 * ok4c})`);

  // ============ T11 — duas abas (mesma sessão), mesmo item ============
  console.log('\n--- T11: duas abas (mesma sessão) comprando o mesmo item ---');
  await db.player.update({
    where: { id: main.playerId },
    data: { crystals: 10, items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}' },
  });
  const t11 = await Promise.all([1, 2].map(() =>
    post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'buy', itemId: 'senzu', requestId: randomUUID() })
  ));
  const ok11 = t11.filter((r) => r.json?.success).length;
  const p11 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  check('T11: saldo p/ 1 → exatamente 1 compra', ok11 === 1, `sucessos=${ok11}`);
  check('T11: 💎 zerado, 1 senzu', p11.crystals === 0, `💎=${p11.crystals}`);

  // ============ T12 — spam rápido: 10 compras sequenciais-relâmpago ============
  console.log('\n--- T12: spam de compra rápida ×10 + venda total ---');
  await db.player.update({
    where: { id: main.playerId },
    data: { crystals: 60, items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}' },
  });
  const t12 = await Promise.all(
    Array.from({ length: 10 }, () =>
      post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'buy', itemId: 'capsula_ki', requestId: randomUUID() })
    )
  );
  const ok12 = t12.filter((r) => r.json?.success).length;
  const conflict12 = t12.filter((r) => r.json?.error?.code === 'CONFLICT').length;
  const p12 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  const c12 = JSON.parse(p12.items as string).consumables as Record<string, number>;
  check('T12: 10 compras relâmpago do mesmo item: unidades == sucessos, 💎 exato', (c12['capsula_ki'] ?? 0) === ok12 && p12.crystals === 60 - 6 * ok12, `ok=${ok12}, erros=[${codes(t12)}], unidades=${c12['capsula_ki'] ?? 0}, 💎=${p12.crystals}`);
  const sellAll = await post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'sell', itemId: 'capsula_ki', quantity: ok12, requestId: randomUUID() });
  const p12b = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  check('T12: venda total das unidades compradas (+3💎 cada)', sellAll.json?.success === true && p12b.crystals === 60 - 6 * ok12 + 3 * ok12, `💎=${p12b.crystals} (esperado ${60 - 6 * ok12 + 3 * ok12})`);

  // ============ T13 — replay com o MESMO requestId ============
  console.log('\n--- T13: replay com MESMO requestId (idempotência de rede) ---');
  await db.player.update({
    where: { id: main.playerId },
    data: { crystals: 10, items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}' },
  });
  const rid = randomUUID();
  const r13a = await post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'buy', itemId: 'senzu', requestId: rid });
  const r13b = await post('/api/game/action', main.cookie, { playerId: main.playerId, type: 'buy', itemId: 'senzu', requestId: rid });
  const p13 = await db.player.findUniqueOrThrow({ where: { id: main.playerId } });
  const c13 = JSON.parse(p13.items as string).consumables as Record<string, number>;
  check('T13: 1ª executa, 2ª devolve cache (deduplicated)', r13a.json?.success === true && r13b.json?.success === true && r13b.json?.deduplicated === true, `a=${r13a.json?.success}, b=${r13b.json?.success}, dedup=${r13b.json?.deduplicated}`);
  check('T13: item e saldo aplicados 1× apenas', c13['senzu'] === 1 && p13.crystals === 0, `senzu=${c13['senzu'] ?? 0}, 💎=${p13.crystals}`);

  // ============ T10 — boss mundial: 5 jogadores concorrentes ============
  console.log('\n--- T10: boss mundial — 5 ataques concorrentes + morte exatamente 1× ---');
  // boss descartável de teste (estado global preservado e restaurado ao final)
  const liveBoss = await db.worldBoss.findFirst({ where: { status: 'active' } });
  if (liveBoss) {
    await db.worldBoss.update({ where: { id: liveBoss.id }, data: { status: 'f4-test-hidden' } });
  }
  const TEST_HP = 12_000; // 5 ataques de ~7k matam NO MEIO da barragem (2 aterrissam, restantes veem boss já morto)
  const testBoss = await db.worldBoss.create({
    data: {
      name: 'F4 Teste (descartável)',
      emoji: '🧪',
      description: 'boss de teste da auditoria F4',
      maxHp: TEST_HP,
      currentHp: TEST_HP,
      level: 5,
      strength: 10,
      defense: 10,
      speed: 10,
      ki: 10,
      endsAt: new Date(Date.now() + 3600_000),
      status: 'active',
    },
  });
  const attackers: Array<{ cookie: string; playerId: string }> = [];
  for (let i = 0; i < 5; i++) {
    attackers.push(await makePlayer({ name: `F4 Boss ${i} ${ts.slice(-4)}`, race: 'majin', level: 40, stats: 250 }));
  }
  const t10 = await Promise.all(
    attackers.map((a) => post('/api/game/action', a.cookie, { playerId: a.playerId, type: 'world_boss_attack', requestId: randomUUID() }))
  );
  const successIdx = t10.map((r, i) => (r.json?.success ? i : -1)).filter((i) => i >= 0);
  const bossNotActive = t10.filter((r) => r.json?.error?.code === 'BOSS_NOT_ACTIVE').length;
  const bossAfter = await db.worldBoss.findUniqueOrThrow({ where: { id: testBoss.id } });
  const killedCount = t10.filter((r) => r.json?.bossAttack?.killed === true).length;
  // cada sucesso pode ter caído no boss de teste OU no novo boss nascido da
  // morte (ensureActiveBoss do PRÓPRIO ataque) — a contabilidade é POR boss
  const allDmgRows = await db.worldBossDamage.findMany({ include: { player: true } });
  const testRows = allDmgRows.filter((d) => d.bossId === testBoss.id);
  const sumTest = testRows.reduce((s, d) => s + d.damage, 0);
  check('T10a: HP do boss de teste == max(0, 12.000 − Σ danos nele)', bossAfter.currentHp === Math.max(0, TEST_HP - sumTest), `hp=${bossAfter.currentHp}, Σdanos-nele=${sumTest}`);
  check('T10a: HP nunca negativo', bossAfter.currentHp >= 0, `hp=${bossAfter.currentHp}`);
  check('T10a: morte declarada exatamente 1×', killedCount === 1, `killed=${killedCount}`);
  check('T10a: todo ataque bem-sucedido tem linha de dano == reportado (em QUALQUER boss)',
    successIdx.every((i) => {
      const row = allDmgRows.find((d) => d.playerId === attackers[i].playerId);
      return row && row.damage === (t10[i].json?.bossAttack?.damage ?? -1);
    }) && successIdx.length === allDmgRows.filter((d) => attackers.some((a) => a.playerId === d.playerId)).length,
    `sucessos=${successIdx.length}, linhas=${allDmgRows.filter((d) => attackers.some((a) => a.playerId === d.playerId)).length}, BOSS_NOT_ACTIVE=${bossNotActive}`);
  // recompensas: 1× por jogador, coerentes com a posição ENTRE OS QUE DANIFICARAM O BOSS DE TESTE
  const dmgRows = testRows;
  const sorted = [...dmgRows].sort((a, b) => b.damage - a.damage);
  let rewardsOk = true;
  const rewardDetail: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = await db.player.findUniqueOrThrow({ where: { id: sorted[i].playerId } });
    const position = i + 1;
    const expZeni = 300 + (position === 1 ? 5000 : position <= 3 ? 2000 : position <= 10 ? 800 : 0);
    const expCrystals = 1 + (position === 1 ? 5 : position <= 3 ? 3 : position <= 10 ? 1 : 0);
    const ok = p.zeni === expZeni && p.crystals === expCrystals;
    if (!ok) rewardsOk = false;
    rewardDetail.push(`#${position} ${p.name}: ${p.zeni}zeni/${p.crystals}💎 vs ${expZeni}/${expCrystals}${ok ? '✓' : '✗'}`);
  }
  check('T10b: recompensas 1× por jogador, coerentes com ranking', rewardsOk, rewardDetail.join(' · '));
  check('T10b: todos marcados rewarded', (await db.worldBossDamage.count({ where: { bossId: testBoss.id, rewarded: true } })) === dmgRows.length);
  // novo boss nasce LAZILY (no próximo ensureActiveBoss) — força um toque
  // e então verifica: tem que existir um boss ativo que NÃO seja o de teste
  await get(`/api/game/worldboss?playerId=${main.playerId}`, main.cookie);
  const newBoss = await db.worldBoss.findFirst({ where: { status: 'active' } });
  check('T10c: morte do boss gerou um novo boss ativo (lazy, no próximo toque)', !!newBoss && newBoss.id !== testBoss.id, newBoss ? `novo=${newBoss.id}` : 'nenhum ativo');

  // ===== limpeza TOTAL =====
  console.log('\n--- LIMPEZA ---');
  const accIds = (await db.account.findMany({ where: { OR: [{ isGuest: true }] }, select: { id: true } })).map((a) => a.id);
  const playerIds = (await db.player.findMany({ where: { accountId: { in: accIds } }, select: { id: true } })).map((p) => p.id);
  await db.session.deleteMany({ where: { accountId: { in: accIds } } });
  await db.walletTransaction.deleteMany({ where: { playerId: { in: playerIds } } });
  await db.analyticsEvent.deleteMany({ where: { playerId: { in: playerIds } } });
  await db.questProgress.deleteMany({ where: { playerId: { in: playerIds } } });
  await db.achievementState.deleteMany({ where: { playerId: { in: playerIds } } });
  await db.activity.deleteMany({ where: { playerId: { in: playerIds } } });
  await db.worldBossDamage.deleteMany({ where: { playerId: { in: playerIds } } });
  await db.cosmeticOwned.deleteMany({ where: { accountId: { in: accIds } } });
  await db.player.deleteMany({ where: { id: { in: playerIds } } });
  await db.account.deleteMany({ where: { id: { in: accIds } } });
  // estado de boss: remove o descartável de teste E o boss que nasceu da
  // morte dele (efeito colateral do teste); restaura o boss original que
  // foi temporariamente escondido — o banco volta ao estado pré-teste
  if (newBoss && newBoss.id !== testBoss.id) {
    await db.worldBossDamage.deleteMany({ where: { bossId: newBoss.id } });
    await db.worldBoss.delete({ where: { id: newBoss.id } }).catch(() => undefined);
  }
  await db.worldBossDamage.deleteMany({ where: { bossId: testBoss.id } });
  await db.worldBoss.delete({ where: { id: testBoss.id } }).catch(() => undefined);
  if (liveBoss) {
    await db.worldBoss.update({ where: { id: liveBoss.id }, data: { status: 'active' } });
  }
  const remainingPlayers = await db.player.count({ where: { isBot: false } });
  const remainingAccounts = await db.account.count();
  check('LIMPEZA: 0 personagens humanos de teste restantes', remainingPlayers === 0, `restantes=${remainingPlayers}`);
  check('LIMPEZA: 0 contas de teste restantes', remainingAccounts === 0, `restantes=${remainingAccounts}`);

  console.log('\n=================================================================');
  console.log(`F4 CONCORRÊNCIA: ${pass} passaram / ${fail} falharam`);
  if (breaches.length) {
    console.log('BRECHAS ENCONTRADAS:');
    breaches.forEach((b) => console.log(`  !! ${b}`));
  } else {
    console.log('Nenhuma brecha de concorrência/idempotência encontrada.');
  }
  console.log('=================================================================');

  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

/** Conta unidades de um item no inventário — mesma semântica de itemCount
 *  da engine: stacks (≥2) tem precedência; posse simples = 1; consumíveis
 *  vivem no mapa próprio. */
function ownedCount(items: any, id: string): number {
  const stack = items?.stacks?.[id];
  if (typeof stack === 'number' && stack >= 2) return stack;
  if (Array.isArray(items?.owned) && items.owned.includes(id)) return 1;
  return items?.consumables?.[id] ?? 0;
}

main().catch(async (e) => {
  console.error('erro fatal:', e);
  await db.$disconnect();
  process.exit(1);
});
