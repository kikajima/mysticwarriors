// =====================================================================
// F2 — AUDITORIA DE ECONOMIA: treino × elixir × Zeni
// --------------------------------------------------------------------
// SUSPEITA (versão antiga): elixir custava 5.000 Zeni fixo e era
// centenas de vezes mais eficiente que treinar em atributos altos
// (curva antiga: custo/ponto 5.787 no atributo 100 → 3.143.804 no 200).
//
// Este script mede o CÓDIGO ATUAL (HEAD):
//  1. Custo marginal de +1 atributo via treino nos pontos
//     50/100/150/200 (e extras 65/90/250/300) para as 4 estatísticas,
//     por raça (Humano tem trainCostMult 0,9);
//  2. Zeni TOTAL para levar um atributo de 10 até X;
//  3. Custo marginal via TODOS os consumíveis/itens que dão atributo
//     (hoje: APENAS o Elixir do Dragão, 75 💎, +2 em todos os 4
//     atributos) e via desejos de Shenron (poder: +3 em tudo, 7 esferas);
//  4. Valoração implícita do 💎 em Zeni (paridade Senzu × hospital) e
//     PONTO DE CRUZAMENTO onde elixir supera treinar;
//  5. LIMITADORES: teto de treino por energia (3⚡/treino, 12⚡/h) e
//     teto de elixir por renda de 💎 (quests diárias/semanais,
//     torneio com cooldown, boss mundial, conquistas one-time).
//
// Uso: bun scripts/auditoria-f2-economia.ts
// =====================================================================

import {
  baseTrainingCost,
  REGEN,
  TRAIN_ENERGY_COST,
  BATTLE_ENERGY_COST,
} from '../src/lib/game/content/world';
import { BOSS_ATTACK_ENERGY_COST } from '../src/lib/game/rules';
import { trainingCost } from '../src/lib/game/rules';
import { DAILY_QUESTS, WEEKLY_QUESTS, ACHIEVEMENTS } from '../src/lib/game/content/quests';
import { TOURNAMENT_COOLDOWN_MS } from '../src/lib/game/content/tournament';

const RACES: Array<[string, number]> = [
  ['saiyajin', 1.0],
  ['humano', 0.9],
  ['namekuseijin', 1.0],
  ['androide', 1.0],
  ['majin', 1.0],
];

const POINTS = [50, 100, 150, 200, 250, 300];

function fmt(n: number): string {
  return n.toLocaleString('pt-BR');
}

// ---------- 1. Custo marginal de treino ----------
console.log('=================================================================');
console.log('F2 — 1. CUSTO MARGINAL DE +1 ATRIBUTO VIA TREINO (código atual)');
console.log('=================================================================');
console.log(`Curva v0.4: 1,05× até 150, depois 1,035× (teto 50M). Treino custa ${TRAIN_ENERGY_COST}⚡.`);
console.log('');

const header = 'atributo │ ' + RACES.map(([r]) => r.padEnd(13)).join('') + '│ mult. raça';
console.log(header);
for (const p of POINTS) {
  const row = String(p).padStart(8) + ' │ ';
  const costs = RACES.map(([race]) => fmt(trainingCost(p, race)).padEnd(13));
  console.log(row + costs.join('') + '│ (base ' + fmt(baseTrainingCost(p)) + ')');
}
console.log('');
console.log('NOTA: o 4º atributo tem custo idêntico (a curva depende só do valor atual do atributo).');
console.log('Referência da curva: 10→20 · 50→141 · 100→1.580 · 150→18.544 · 200→99.163 · 300→3,46M');

// ---------- 2. Custo TOTAL 10 → X ----------
console.log('');
console.log('=================================================================');
console.log('F2 — 2. ZENI TOTAL PARA LEVAR UM ATRIBUTO DE 10 ATÉ X (base, sem mult.)');
console.log('=================================================================');
for (const target of [50, 100, 150, 200, 250]) {
  let total = 0;
  for (let s = 10; s < target; s++) total += baseTrainingCost(s);
  const horasEnergia = (target - 10) / 4; // 3⚡/treino, 12⚡/h → 4 treinos/h
  console.log(
    `  até ${String(target).padStart(3)}: ${fmt(total).padStart(12)} Zeni  ·  ${target - 10} treinos  ·  ≥ ${horasEnergia.toFixed(1)}h só de regen de energia (12⚡/h)`
  );
}

// ---------- 3. Consumíveis/itens que dão atributo ----------
console.log('');
console.log('=================================================================');
console.log('F2 — 3. FONTES DE ATRIBUTO FORA DO TREINO (catálogo atual)');
console.log('=================================================================');
console.log('  • Elixir do Dragão (elixir_dragao): 75 💎 → +2 em CADA um dos 4 atributos (8 pontos)');
  console.log('    ⇒ 9,375 💎/ponto · custo por ponto/atributo = 75 💎/2');
console.log('  • Desejo de Shenron "poder": 7 esferas → +3 em CADA um dos 4 atributos (12 pontos)');
console.log('  • Zenkai (Saiyajin): +1 Força por derrota relevante (12h/adversário, risco real)');
console.log('  • NENHUM outro item da loja concede atributo direto — equipamentos dão');
console.log('    bônus de COMBATE (atk/def/spd/ki efetivos), não pontos de personagem.');
console.log('  • O elixirPrice() (dinâmico em Zeni) é LEGADO de teste — a loja cobra 75 💎 fixos.');
console.log('');

// ---------- 4. Valoração do 💎 e ponto de cruzamento ----------
console.log('=================================================================');
console.log('F2 — 4. PONTO DE CRUZAMENTO: elixir (75💎 = 8 pontos) vs. treino');
console.log('=================================================================');
// Valoração implícita: 1 Feijão Senzu (10💎) cura 100% da vida; hospital
// cobra 3 Zeni/HP. Vida cheia típica nv10-20 ≈ 300-450 HP ⇒ 900-1.350 Zeni
// ≈ 10💎 ⇒ ~90-135 Zeni/💎. Usamos faixas de 50 / 100 / 200 Zeni/💎.
const valuations = [50, 100, 200];
console.log('Valoração implícita do 💎 (paridade Senzu×hospital: 10💎 = cura total ≈ 3 Zeni/HP):');
console.log('  vida nv10 ≈ 380 HP → 1.140 Zeni ≈ 10💎 ⇒ ~114 Zeni/💎 (faixa 50–200 usada abaixo)');
console.log('');
for (const v of valuations) {
  const elixirZeniPerPoint = (75 * v) / 8;
  // ponto onde baseTrainingCost(s) = elixirZeniPerPoint
  let cross = -1;
  for (let s = 10; s <= 999; s++) {
    if (baseTrainingCost(s) >= elixirZeniPerPoint) {
      cross = s;
      break;
    }
  }
  console.log(
    `  💎 = ${v} Zeni ⇒ elixir custa ${fmt(Math.round(elixirZeniPerPoint))} Zeni/ponto ⇒ treino supera elixir até o atributo ${cross > 0 ? cross : '—'} (depois disso, elixir é mais barato EM ZENI)`
  );
}
console.log('');
console.log('Interpretação correta da moeda: 💎 NÃO é comprável com Zeni nem com dinheiro real —');
console.log('a única fonte é jogar. O cruzamento acima é contábil; o LIMITADOR real é a renda de 💎.');

// ---------- 5. Limitadores ----------
console.log('');
console.log('=================================================================');
console.log('F2 — 5. LIMITADORES QUE NEUTRALIZAM O LOOP DOMINANTE');
console.log('=================================================================');
const dailyCrystals = DAILY_QUESTS.reduce((s, q) => s + (q.rewardCrystals ?? 0), 0);
const weeklyCrystals = WEEKLY_QUESTS.reduce((s, q) => s + (q.rewardCrystals ?? 0), 0);
const achCrystals = ACHIEVEMENTS.reduce((s, a) => s + (a.rewardCrystals ?? 0), 0);
const tournCrystals = 0;

console.log(`A) ENERGIA limita o TREINO: ${TRAIN_ENERGY_COST}⚡/treino · regen 12⚡/h (${REGEN.energySeconds}s/ponto)`);
console.log(`   ⇒ teto teórico de treino = 4 pontos/h = 96/dia (Zeni disponível à parte).`);
console.log(`   Batalha PvE/PvP custa ${BATTLE_ENERGY_COST}⚡ — o mesmo pool.`);
console.log('');
console.log(`B) RENDA DE 💎 limita o ELIXIR (75💎 cada):`);
console.log(`   • quests diárias: ${dailyCrystals}💎/dia`);
console.log(`   • quests semanais: ${weeklyCrystals}💎/semana ≈ ${(weeklyCrystals / 7).toFixed(1)}💎/dia`);
console.log(`   • torneio: ${tournCrystals}💎 — desde v0.9.25, lutas concedem somente Zeni + XP (cooldown ${TOURNAMENT_COOLDOWN_MS / 60_000}min)`);
console.log(`   • boss mundial: 1💎 participação + bônus por posição, 1 boss/3 dias`);
console.log(`   • conquistas: ${achCrystals}💎 NO TOTAL (one-time, irrecuperáveis)`);
console.log('');
const casualPerDay = dailyCrystals + weeklyCrystals / 7 + 1; // +1 boss participation diluído
const hardcorePerDay = dailyCrystals + weeklyCrystals / 7;
console.log(`   ⇒ jogador casual: ~${casualPerDay.toFixed(1)}💎/dia ⇒ ${(casualPerDay / 75).toFixed(2)} elixir/dia ⇒ ${((casualPerDay / 75) * 8).toFixed(1)} pontos/dia (distribuídos entre 4 atributos)`);
console.log(`   ⇒ jogador hardcore 24/7: ~${hardcorePerDay.toFixed(0)}💎/dia ⇒ ${(hardcorePerDay / 75).toFixed(1)} elixir/dia ⇒ ${((hardcorePerDay / 75) * 8).toFixed(0)} pontos/dia ESPALHADOS (vs. 96/dia CONCENTRADOS do treino)`);
console.log('');
console.log('C) ESTRUTURA: mesmo no pior caso, o elixir entrega pontos ESPALHADOS (2/atributo)');
console.log('   e o treino entrega pontos CONCENTRADOS — nichos diferentes, sem substituição.');
console.log('   STACK máximo de elixir: 999 (SHOP_MAX_STACK) — sem cooldown, mas sem renda infinita.');
