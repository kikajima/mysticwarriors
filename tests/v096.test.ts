// =====================================================================
// v0.9.6 — RELÓGIO DO SERVIDOR · CANCELAR PROFISSÃO · PERSONAGEM ≠ CONTA
// =====================================================================

import { describe, expect, test } from 'bun:test';
import { noteServerTime, serverNowMs, getClockOffsetMs } from '../src/lib/game/clock';
import { MISSION_BLOCKED_ACTIONS } from '../src/lib/game/rules';
import { parseCosmeticsOwned } from '../src/lib/game/engine';
import {
  serializeCharacterForCloud,
  sanitizeCloudProgress,
  sanitizeCloudCharacterState,
  cloudCharacterToPlayerData,
  CLOUD_PROGRESS_VERSION,
  type CloudCharacterSnapshot,
} from '../src/lib/supabase/progress';
import type { Player } from '@prisma/client';

// ===== fixtures =====

function playerFixture(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player_goku_1',
    name: 'Goku',
    race: 'saiyajin',
    avatarUrl: null,
    level: 10,
    xp: 200,
    zeni: 5000,
    crystals: 40,
    hp: 300,
    energy: 50,
    strength: 30,
    defense: 25,
    speed: 28,
    ki: 31,
    battlesWon: 10,
    battlesLost: 3,
    pvpWins: 2,
    trainingsDone: 8,
    guildDonated: 0,
    missionsDone: 5,
    dragonBalls: 2,
    isBot: false,
    items: '{"weapon":null,"armor":null,"accessory":null,"owned":["katana"],"consumables":{"senzu":2}}',
    techniques: '["kamehameha"]',
    loadout: '{"1":"kamehameha","2":null,"3":null,"S":null}',
    strategy: 'balanced',
    missionId: null,
    missionEndsAt: null,
    missionsCompleted: '["agricultor"]',
    professions: '{"agricultor":{"rank":2,"completions":1}}',
    transformationId: null,
    transformationsOwned: '[]',
    lastZenkaiAt: null,
    zenkaiWindowStart: null,
    zenkaiCount24h: 0,
    lastZenkaiOpponentId: null,
    pveBattleDay: null,
    pveBattleCount: 0,
    stateVersion: 0,
    lastRegen: new Date(),
    lastRegenHp: null,
    cosmeticsEquipped: '{"aura":"aura_chama"}',
    cosmeticsOwned: '["aura_chama","title_lendario"]',
    createdAt: new Date(),
    updatedAt: new Date(),
    accountId: 'acc_1',
    guildId: null,
    ...overrides,
  } as Player;
}

function stateFixture(): CloudCharacterSnapshot {
  return {
    id: 'player_goku_1',
    name: 'Goku',
    race: 'saiyajin',
    avatarUrl: null,
    level: 10,
    xp: 200,
    zeni: 5000,
    crystals: 40,
    hp: 300,
    energy: 50,
    strength: 30,
    defense: 25,
    speed: 28,
    ki: 31,
    battlesWon: 10,
    battlesLost: 3,
    pvpWins: 2,
    trainingsDone: 8,
    guildDonated: 0,
    missionsDone: 5,
    dragonBalls: 2,
    items: { weapon: null, armor: null, accessory: null, owned: [], consumables: {}, stacks: {} },
    techniques: [],
    loadout: { '1': null, '2': null, '3': null, S: null },
    strategy: 'balanced',
    missionsCompleted: [],
    professions: {},
    transformationId: null,
    transformationsOwned: [],
    cosmeticsEquipped: {},
    cosmeticsOwned: [],
    missionId: null,
    missionEndsAt: null,
    lastRegen: new Date().toISOString(),
    lastRegenHp: null,
    quests: [],
    achievementsClaimed: [],
    // v0.9.15–v0.9.18 — progressão recente começa zerada
    talents: [],
    miracleWins: 0,
    davidWins: 0,
    tournament: null,
    tournamentTitles: 0,
    tournamentRoundWins: 0,
  };
}

// =====================================================================
// MUDANÇA 1 — relógio do servidor
// =====================================================================

describe('v0.9.6 — relógio do servidor no cliente (clock.ts)', () => {
  test('offset medido compensa a diferença entre navegador e servidor', () => {
    const requestStart = Date.now();
    // servidor com o MESMO relógio (latência ~0) → offset ~0
    noteServerTime(new Date(requestStart).toISOString(), requestStart);
    expect(Math.abs(getClockOffsetMs())).toBeLessThan(150);

    // servidor 5s NA FRENTE do navegador
    const t2 = new Date(Date.now() + 5000).toISOString();
    noteServerTime(t2, Date.now());
    expect(getClockOffsetMs()).toBeGreaterThan(4500);
    expect(getClockOffsetMs()).toBeLessThan(5500);
    // serverNowMs reflete a hora ajustada
    expect(serverNowMs()).toBeGreaterThan(Date.now() + 4000);
  });

  test('medidas absurdas (>1h) são descartadas; lixo é ignorado', () => {
    noteServerTime(new Date(Date.now() + 2 * 3600_000).toISOString(), Date.now());
    expect(Math.abs(getClockOffsetMs())).toBeLessThan(5500); // continua a última boa
    noteServerTime('não é data', Date.now());
    noteServerTime(123 as unknown as string, Date.now());
    noteServerTime(null, Date.now());
    expect(Math.abs(getClockOffsetMs())).toBeLessThan(5500);
  });
});

// =====================================================================
// MUDANÇA 2 — cancelar profissão
// =====================================================================

describe('v0.9.6 — cancelar profissão (matriz v0.16)', () => {
  test('cancel_mission é permitido durante turno ativo (fora dos 2 bloqueios)', () => {
    expect(MISSION_BLOCKED_ACTIONS.has('cancel_mission')).toBe(false);
    // os 3 negados durante o turno
    expect(MISSION_BLOCKED_ACTIONS.has('train')).toBe(false);
    expect(MISSION_BLOCKED_ACTIONS.has('battle')).toBe(true);
    // v0.16 — loja LIBERADA durante o trabalho
    expect(MISSION_BLOCKED_ACTIONS.has('buy')).toBe(false);
  });
});

// =====================================================================
// MUDANÇA 3 — personagem separado de conta (snapshot v3)
// =====================================================================

describe('v0.9.6 — snapshot v3: id + cosméticos DO personagem', () => {
  test('CLOUD_PROGRESS_VERSION é 3', () => {
    expect(CLOUD_PROGRESS_VERSION).toBe(3);
  });

  test('serializeCharacterForCloud leva id e a própria lista de cosméticos', () => {
    const snap = serializeCharacterForCloud(playerFixture());
    expect(snap.id).toBe('player_goku_1');
    expect(snap.cosmeticsOwned).toEqual(['aura_chama', 'title_lendario']);
    expect(snap.name).toBe('Goku');
    expect(snap.zeni).toBe(5000);
    // persona NÃO perde nada do que já viajava (v2)
    expect(snap.items.owned).toEqual(['katana']);
    expect(snap.techniques).toEqual(['kamehameha']);
  });

  test('cloudCharacterToPlayerData preserva o id (chave estável nuvem↔servidor)', () => {
    const data = cloudCharacterToPlayerData(stateFixture());
    expect(data.id).toBe('player_goku_1');
    expect(data.cosmeticsOwned).toBe('[]');
    // sem id (legado) → criação com id novo (campo ausente)
    const legacy = cloudCharacterToPlayerData({ ...stateFixture(), id: null });
    expect(legacy.id).toBeUndefined();
  });

  test('sanitizeCloudCharacterState valida catálogos e clampa valores', () => {
    const raw = {
      ...stateFixture(),
      zeni: 999_999_999_999,
      race: 'raça_inexistente',
      cosmeticsOwned: ['aura_chama', 'cosmético_falso'],
    };
    expect(() => sanitizeCloudCharacterState(raw)).toThrow(); // raça inválida derruba a linha
    const ok = sanitizeCloudCharacterState({ ...stateFixture(), zeni: 999_999_999_999 });
    expect(ok.zeni).toBe(100_000_000); // clamp máximo
    expect(sanitizeCloudCharacterState({ ...stateFixture(), cosmeticsOwned: ['aura_chama', 'falso'] }).cosmeticsOwned).toEqual(['aura_chama']);
  });

  test('RETROCOMPAT v2: cosméticos da CONTA são duplicados para cada personagem', () => {
    const v2 = {
      version: 2,
      savedAt: new Date().toISOString(),
      activePlayerName: 'Goku',
      characters: [
        { ...stateFixture(), id: null, cosmeticsOwned: [] },
        { ...stateFixture(), id: null, name: 'Cooran', cosmeticsOwned: [] },
      ],
      cosmeticsOwned: ['aura_chama', 'title_lendario'],
    };
    const out = sanitizeCloudProgress(v2);
    expect(out.characters).toHaveLength(2);
    // a regra do dono: ninguém perde nada — a lista compartilhada é
    // duplicada para CADA personagem (Rei Taurion e Cooran ganham a própria)
    for (const c of out.characters) {
      expect(c.cosmeticsOwned).toEqual(['aura_chama', 'title_lendario']);
    }
  });

  test('RETROCOMP v2: personagem com lista PRÓPRIA não herda a da conta', () => {
    const v2 = {
      version: 2,
      savedAt: new Date().toISOString(),
      activePlayerName: 'Goku',
      characters: [
        { ...stateFixture(), id: 'p1', cosmeticsOwned: ['title_lendario'] },
        { ...stateFixture(), id: 'p2', name: 'Cooran', cosmeticsOwned: [] },
      ],
      cosmeticsOwned: ['aura_chama'],
    };
    const out = sanitizeCloudProgress(v2);
    expect(out.characters[0].cosmeticsOwned).toEqual(['title_lendario']); // própria
    expect(out.characters[1].cosmeticsOwned).toEqual(['aura_chama']); // herdou da conta (vazio antes)
  });

  test('equipar só vale cosmético que o PRÓPRIO personagem possui', () => {
    const raw = {
      ...stateFixture(),
      cosmeticsOwned: ['title_lendario'],
      cosmeticsEquipped: { aura: 'aura_chama', title: 'title_lendario' },
    };
    const out = sanitizeCloudCharacterState(raw);
    expect(out.cosmeticsEquipped.title).toBe('title_lendario');
    expect(out.cosmeticsEquipped.aura).toBeUndefined(); // NÃO possui → não equipa
  });

  test('parseCosmeticsOwned tolera lixo (null, json inválido, não-array)', () => {
    expect(parseCosmeticsOwned(null)).toEqual([]);
    expect(parseCosmeticsOwned('{"a":1}')).toEqual([]);
    expect(parseCosmeticsOwned('não é json')).toEqual([]);
    expect(parseCosmeticsOwned('["aura_chama", 42, true]')).toEqual(['aura_chama']);
  });
});
