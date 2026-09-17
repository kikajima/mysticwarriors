/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import { applyRegen } from '@/lib/game/engine';
import { REGEN } from '@/lib/game/content/world';
import type { Player } from '@prisma/client';

// =====================================================================
// F1 — AUDITORIA DE REGENERAÇÃO IDEMPOTENTE (energia e HP)
// ---------------------------------------------------------------------
// SUSPEITA (versão antiga): consultar o estado com frequência alterava a
// quantidade regenerada (polling > espera). O regen precisa ser função
// PURA do tempo transcorrido: valor = min(max, salvo + taxa × tempo).
//
// O applyRegen aceita `nowMs` — relógio virtual determinístico. Estes
// testes comparam, sobre a MESMA condição inicial:
//   A) polling agressivo (1 consulta/s — e variantes 100ms/500ms/1s)
//      vs. UMA única consulta ao fim do mesmo horizonte;
//   B) "offline" — nenhuma consulta durante o horizonte, uma no fim
//      (acúmulo integral, sem perda por ausência);
//   C) chamadas repetidas no MESMO instante (sem compounding);
//   D) recurso cheio congela o relógio no presente (sem regen
//      retroativo ao gastar) e respeita o teto (min(max, ...)).
// Todos também cobrem intervalos FRACIONÁRIOS (bônus raciais: Humano
// energia ×1,1; Namekuseijin vida ×1,15) — o clássico tick com
// arredondamento por janela.
// =====================================================================

const T0 = 1_700_000_000_000; // instante base arbitrário (fixo)

test('consultas sem escrita preservam a regeneração acumulada até a próxima ação', () => {
  const saved = makePlayer({ hp: 10, energy: 10 });
  const original = structuredClone(saved);
  for (let elapsed = 15_000; elapsed <= 600_000; elapsed += 15_000) {
    const response = structuredClone(saved);
    applyRegen(response, T0 + elapsed);
  }
  expect(saved).toEqual(original);

  const actionPlayer = structuredClone(saved);
  applyRegen(actionPlayer, T0 + 600_000);
  expect(actionPlayer.hp).toBe(60);
  expect(actionPlayer.energy).toBe(12);
  actionPlayer.hp -= 20;
  actionPlayer.energy -= 5;

  const nextResponse = structuredClone(actionPlayer);
  applyRegen(nextResponse, T0 + 615_000);
  expect(nextResponse.hp).toBe(41);
  expect(nextResponse.energy).toBe(7);
});

/** Fábrica de Player sintético (não toca o banco — applyRegen é puro). */
function makePlayer(over: Partial<Player> = {}): Player {
  const base: Player = {
    id: 'regen-test',
    name: 'Regen Test',
    race: 'saiyajin',
    avatarUrl: null,
    level: 1,
    xp: 0,
    zeni: 0,
    crystals: 0,
    hp: 145,
    energy: 100,
    strength: 10,
    defense: 10,
    speed: 10,
    ki: 10,
    battlesWon: 0,
    battlesLost: 0,
    pvpWins: 0,
    trainingsDone: 0,
    guildDonated: 0,
    missionsDone: 0,
    dragonBalls: 0,
    items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
    techniques: '[]',
    loadout: '{"1":null,"2":null,"3":null,"S":null}',
    strategy: 'balanced',
    missionId: null,
    missionEndsAt: null,
    missionsCompleted: '[]',
    transformationId: null,
    transformationsOwned: '[]',
    lastZenkaiAt: null,
    zenkaiWindowStart: null,
    zenkaiCount24h: 0,
    lastZenkaiOpponentId: null,
    pveBattleDay: null,
    pveBattleCount: 0,
    stateVersion: 0,
    lastRegen: new Date(T0),
    lastRegenHp: new Date(T0),
    createdAt: new Date(T0),
    updatedAt: new Date(T0),
    accountId: null,
    guildId: null,
    // campos adicionais do modelo atual (valores neutros)
    tournament: null,
    tournamentTitles: 0,
    tournamentRoundWins: 0,
    miracleWins: 0,
    davidWins: 0,
    professions: '{}',
    talents: '{}',
    cosmeticsOwned: '[]',
    cosmeticsEquipped: '[]',
  } as unknown as Player;
  return { ...base, ...over } as Player;
}

/** Executa applyRegen a cada `stepMs` no horizonte [0, horizonMs] (virtual).
 * A última leitura acontece SEMPRE no instante final exato — a comparação
 * com a consulta única é feita no MESMO instante (senão o teste mediria
 * diferença de horizonte, não de frequência). */
function runPolling(over: Partial<Player>, stepMs: number, horizonMs: number): Player {
  const p = makePlayer(over);
  for (let t = stepMs; t < horizonMs; t += stepMs) {
    applyRegen(p, T0 + t);
  }
  applyRegen(p, T0 + horizonMs); // leitura final no mesmo instante da consulta única
  return p;
}

/** Executa applyRegen UMA vez ao fim do horizonte (consulta única / offline). */
function runOnce(over: Partial<Player>, horizonMs: number): Player {
  const p = makePlayer(over);
  applyRegen(p, T0 + horizonMs);
  return p;
}

describe('F1 — Regen idempotente: ENERGIA (intervalo base 300s)', () => {
  test('A. polling 1/s por 1h === 1 consulta ao fim (mesmo valor e mesmo relógio)', () => {
    const polled = runPolling({ energy: 50 }, 1_000, 3_600_000);
    const once = runOnce({ energy: 50 }, 3_600_000);
    // 3600s / 300s = 12 pontos exatos
    expect(polled.energy).toBe(62);
    expect(once.energy).toBe(62);
    expect(polled.lastRegen.getTime()).toBe(T0 + 12 * 300_000);
    expect(once.lastRegen.getTime()).toBe(T0 + 12 * 300_000);
  });

  test('A. polling 100ms (10 consultas/s) === 1 consulta (sem ganho por frequência)', () => {
    const polled = runPolling({ energy: 50 }, 100, 3_600_000);
    const once = runOnce({ energy: 50 }, 3_600_000);
    expect(polled.energy).toBe(once.energy);
    expect(polled.lastRegen.getTime()).toBe(once.lastRegen.getTime());
  });

  test('A. polling 7s (dessincronizado do intervalo) === 1 consulta', () => {
    const polled = runPolling({ energy: 50 }, 7_000, 3_600_000);
    const once = runOnce({ energy: 50 }, 3_600_000);
    expect(polled.energy).toBe(once.energy);
    expect(polled.lastRegen.getTime()).toBe(once.lastRegen.getTime());
  });

  test('A. HUMANO (energia ×1,1 → intervalo fracionário 272,727s): polling 250ms === 1 consulta', () => {
    const start = { race: 'humano' as const, energy: 50 };
    const polled = runPolling(start, 250, 3_600_000);
    const once = runOnce(start, 3_600_000);
    // floor(3600 / (300/1.1)) = floor(13,2) = 13 pontos nos DOIS modos
    expect(polled.energy).toBe(50 + 13);
    expect(once.energy).toBe(50 + 13);
    // relógios iguais ou dentro de tolerância de arredondamento (≤ intervalo)
    expect(Math.abs(polled.lastRegen.getTime() - once.lastRegen.getTime())).toBeLessThanOrEqual(300_000);
  });

  test('B. offline por 1h (zero consultas) → acúmulo integral na 1ª consulta', () => {
    const p = runOnce({ energy: 50 }, 3_600_000);
    expect(p.energy).toBe(62);
  });

  test('B. offline por 10h → teto aplicado (min(max, salvo+ganho)), nunca acima do máximo', () => {
    const p = runOnce({ energy: 50 }, 36_000_000);
    // 36000/300 = 120 pontos, mas teto = 80 + ki*2 = 100
    expect(p.energy).toBe(100);
  });

  test('C. 100 consultas no MESMO instante não compõem ganho', () => {
    const p = makePlayer({ energy: 50 });
    for (let i = 0; i < 100; i++) {
      applyRegen(p, T0 + 299_999); // 1ms antes do intervalo
    }
    expect(p.energy).toBe(50);
    // cruzando o intervalo UMA vez, 100 consultas no mesmo instante → +1 apenas
    for (let i = 0; i < 100; i++) {
      applyRegen(p, T0 + 300_001);
    }
    expect(p.energy).toBe(51);
  });

  test('D. energia CHEIA congela o relógio no presente — sem regen retroativo ao gastar', () => {
    const p = makePlayer({ energy: 100 }); // cheia (max = 80 + 10*2 = 100)
    applyRegen(p, T0 + 3_600_000); // 1h depois, cheia: relógio = agora
    expect(p.energy).toBe(100);
    expect(p.lastRegen.getTime()).toBe(T0 + 3_600_000);
    // gasta 40 e consulta 10s depois: NADA regenerado (nenhum intervalo completo)
    p.energy = 60;
    applyRegen(p, T0 + 3_600_010);
    expect(p.energy).toBe(60);
  });
});

describe('F1 — Regen idempotente: VIDA (intervalo base 12s)', () => {
  test('A. polling 1/s por 120s === 1 consulta ao fim (+10 HP nos dois)', () => {
    const start = { hp: 10, energy: 100 }; // energia cheia isola o relógio de vida
    const polled = runPolling(start, 1_000, 120_000);
    const once = runOnce(start, 120_000);
    expect(polled.hp).toBe(20);
    expect(once.hp).toBe(20);
    expect(polled.lastRegenHp!.getTime()).toBe(T0 + 10 * 12_000);
    expect(once.lastRegenHp!.getTime()).toBe(T0 + 10 * 12_000);
  });

  test('A. polling 100ms por 60s === 1 consulta', () => {
    const start = { hp: 10, energy: 100 };
    const polled = runPolling(start, 100, 60_000);
    const once = runOnce(start, 60_000);
    expect(polled.hp).toBe(15);
    expect(once.hp).toBe(15);
  });

  test('A. NAMEKUSEIJIN (vida ×1,15 → 10,4348s fracionário): polling 500ms === 1 consulta', () => {
    const start = { race: 'namekuseijin' as const, hp: 10, energy: 100 };
    const polled = runPolling(start, 500, 60_000);
    const once = runOnce(start, 60_000);
    // floor(60 / (12/1.15)) = floor(5,75) = 5 pontos nos DOIS modos
    expect(polled.hp).toBe(15);
    expect(once.hp).toBe(15);
    expect(Math.abs(polled.lastRegenHp!.getTime() - once.lastRegenHp!.getTime())).toBeLessThanOrEqual(12_000);
  });

  test('B. offline 120s sem consultas → regen integral (não perde acumulação)', () => {
    const p = runOnce({ hp: 10, energy: 100 }, 120_000);
    expect(p.hp).toBe(20);
  });

  test('B. offline 10h → teto de vida aplicado', () => {
    const p = runOnce({ hp: 10, energy: 100 }, 36_000_000);
    expect(p.hp).toBe(145); // 80 + 1*15 + 10*5
  });

  test('C. 200 consultas no mesmo instante não compõem ganho de vida', () => {
    const p = makePlayer({ hp: 10, energy: 100 });
    for (let i = 0; i < 200; i++) applyRegen(p, T0 + 11_999);
    expect(p.hp).toBe(10);
    for (let i = 0; i < 200; i++) applyRegen(p, T0 + 12_001);
    expect(p.hp).toBe(11);
  });

  test('D. vida CHEIA congela o relógio; dano novo não regenera retroativo', () => {
    const p = makePlayer({ hp: 145, energy: 100 });
    applyRegen(p, T0 + 3_600_000);
    expect(p.hp).toBe(145);
    expect(p.lastRegenHp!.getTime()).toBe(T0 + 3_600_000);
    p.hp = 100; // dano
    applyRegen(p, T0 + 3_600_005); // 5s depois
    expect(p.hp).toBe(100); // nenhum intervalo completo de 12s
  });
});

describe('F1 — Relógios independentes (energia não interfere na vida)', () => {
  test('avançar o relógio de energia NÃO move o de vida', () => {
    const p = makePlayer({ energy: 50, hp: 100 });
    applyRegen(p, T0 + 3_600_000); // +12 energia (300s), +300 vida (12s, teto 145)
    expect(p.energy).toBe(62);
    expect(p.hp).toBe(145);
    expect(p.lastRegen.getTime()).toBe(T0 + 12 * 300_000);
    expect(p.lastRegenHp!.getTime()).toBe(T0 + 300 * 12_000); // preserva fração? não: 300 intervalos exatos
  });

  test('fallback: lastRegenHp null congela na referência ORIGINAL (não no lastRegen avançado)', () => {
    const p = makePlayer({ energy: 50, hp: 100, lastRegenHp: null });
    // 1ª consulta avança bastante energia; a vida usa o lastRegen ORIGINAL
    applyRegen(p, T0 + 3_600_000);
    expect(p.hp).toBe(145);
    expect(p.lastRegenHp!.getTime()).toBe(T0 + 300 * 12_000);
    expect(p.lastRegen.getTime()).toBe(T0 + 12 * 300_000);
  });
});

describe('F1 — Constantes de regen (documentação viva da auditoria)', () => {
  test('REGEN base: energia 300s/ponto, vida 12s/ponto', () => {
    expect(REGEN.energySeconds).toBe(300);
    expect(REGEN.hpSeconds).toBe(12);
  });
});
