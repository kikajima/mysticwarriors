// =====================================================================
// v0.9.4 — TUDO NA NUVEM: testes do snapshot v2 (quests, conquistas,
// turno de profissão em andamento e relógios de regeneração)
// =====================================================================

import { describe, expect, test } from 'bun:test';
import type { Player } from '@prisma/client';
import {
  serializeCharacterForCloud,
  serializeProgressForCloud,
  sanitizeCloudProgress,
  cloudCharacterToPlayerData,
} from '../src/lib/supabase/progress';
import { DAILY_QUESTS, WEEKLY_QUESTS } from '../src/lib/game/content/quests';
import { PROFESSIONS } from '../src/lib/game/content/world';

function playerFixture(overrides: Partial<Player> = {}): Player {
  const now = new Date('2026-09-12T12:00:00Z');
  return {
    id: 'p1',
    name: 'Son Goku',
    race: 'saiyajin',
    avatarUrl: null,
    level: 12,
    xp: 340,
    zeni: 5000,
    crystals: 40,
    hp: 200,
    strength: 30,
    defense: 25,
    speed: 28,
    ki: 31,
    energy: 90,
    battlesWon: 10,
    battlesLost: 3,
    pvpWins: 2,
    trainingsDone: 8,
    guildDonated: 0,
    missionsDone: 5,
    dragonBalls: 2,
    isBot: false,
    items: '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
    techniques: '[]',
    loadout: '{"1":null,"2":null,"3":null,"S":null}',
    strategy: 'balanced',
    missionId: null,
    missionEndsAt: null,
    missionsCompleted: '[]',
    professions: null,
    transformationId: null,
    transformationsOwned: '[]',
    lastZenkaiAt: null,
    zenkaiWindowStart: null,
    zenkaiCount24h: 0,
    lastZenkaiOpponentId: null,
    pveBattleDay: null,
    pveBattleCount: 0,
    stateVersion: 0,
    lastRegen: now,
    lastRegenHp: now,
    cosmeticsEquipped: null,
    createdAt: now,
    updatedAt: now,
    accountId: 'acc1',
    guildId: null,
    ...overrides,
  } as Player;
}

function baseChar(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Probe Warrior',
    race: 'saiyajin',
    avatarUrl: null,
    level: 5,
    xp: 100,
    zeni: 800,
    crystals: 10,
    hp: 150,
    energy: 80,
    strength: 20,
    defense: 15,
    speed: 18,
    ki: 22,
    battlesWon: 4,
    battlesLost: 1,
    pvpWins: 0,
    trainingsDone: 3,
    guildDonated: 0,
    missionsDone: 2,
    dragonBalls: 0,
    items: { weapon: null, armor: null, accessory: null, owned: [], consumables: {} },
    techniques: [],
    loadout: { '1': null, '2': null, '3': null, S: null },
    strategy: 'balanced',
    missionsCompleted: [],
    professions: {},
    transformationId: null,
    transformationsOwned: [],
    cosmeticsEquipped: {},
    ...overrides,
  };
}

const DAILY_DEF = DAILY_QUESTS[0];
const WEEKLY_DEF = WEEKLY_QUESTS[0];
const PROFESSION_ID = PROFESSIONS[0].id;

describe('v0.9.4 — serializeCharacterForCloud (servidor → nuvem)', () => {
  test('turno de profissão em andamento e relógios entram no snapshot', () => {
    const endsAt = new Date(Date.now() + 30 * 60_000);
    const snap = serializeCharacterForCloud(
      playerFixture({ missionId: PROFESSION_ID, missionEndsAt: endsAt })
    );
    expect(snap.missionId).toBe(PROFESSION_ID);
    expect(snap.missionEndsAt).toBe(endsAt.toISOString());
    expect(snap.lastRegen).toBe(new Date('2026-09-12T12:00:00Z').toISOString());
    expect(snap.lastRegenHp).toBe(new Date('2026-09-12T12:00:00Z').toISOString());
    expect(snap.quests).toEqual([]);
    expect(snap.achievementsClaimed).toEqual([]);
  });

  test('extras (quests do período + conquistas coletadas) entram no snapshot', () => {
    const snap = serializeCharacterForCloud(playerFixture(), {
      quests: [
        { questId: DAILY_DEF.id, kind: 'daily', period: '2026-09-12', progress: 2, claimed: false },
      ],
      achievements: [{ achievementId: 'first_blood', claimedAt: '2026-09-10T10:00:00Z' }],
    });
    expect(snap.quests).toHaveLength(1);
    expect(snap.quests[0].questId).toBe(DAILY_DEF.id);
    expect(snap.achievementsClaimed).toEqual([
      { achievementId: 'first_blood', claimedAt: '2026-09-10T10:00:00Z' },
    ]);
  });

  test('serializeProgressForCloud distribui extras por playerId', () => {
    const p1 = playerFixture();
    const snap = serializeProgressForCloud(
      [p1],
      [],
      p1.name,
      new Map([
        ['p1', { quests: [], achievements: [{ achievementId: 'first_blood', claimedAt: null }] }],
      ])
    );
    expect(snap.characters[0].achievementsClaimed).toEqual([
      { achievementId: 'first_blood', claimedAt: null },
    ]);
  });
});

describe('v0.9.4 — sanitizeCloudProgress (nuvem não confiável → válido)', () => {
  test('quests: ids fora do catálogo somem; kind trocado soma não; progresso clampado ao alvo', () => {
    const out = sanitizeCloudProgress({
      version: 2,
      savedAt: new Date().toISOString(),
      activePlayerName: 'Probe Warrior',
      cosmeticsOwned: [],
      characters: [
        baseChar({
          quests: [
            { questId: DAILY_DEF.id, kind: 'daily', period: '2026-09-12', progress: 999999, claimed: true },
            { questId: 'hack_quest', kind: 'daily', period: '2026-09-12', progress: 1, claimed: true },
            { questId: DAILY_DEF.id, kind: 'weekly', period: '2026-W37', progress: 1, claimed: false },
            { questId: WEEKLY_DEF.id, kind: 'weekly', period: '2026-W37', progress: 2, claimed: false },
            { questId: DAILY_DEF.id, kind: 'daily', period: 'formato-inválido', progress: 1, claimed: false },
          ],
        }),
      ],
    });
    const quests = out.characters[0].quests;
    expect(quests).toHaveLength(2);
    expect(quests[0]).toEqual({
      questId: DAILY_DEF.id,
      kind: 'daily',
      period: '2026-09-12',
      progress: DAILY_DEF.target,
      claimed: true,
    });
    expect(quests[1].questId).toBe(WEEKLY_DEF.id);
    expect(quests[1].progress).toBe(2);
  });

  test('conquistas: ids fora do catálogo e duplicatas somem; data inválida vira null (mantém coletada)', () => {
    const out = sanitizeCloudProgress({
      version: 2,
      savedAt: new Date().toISOString(),
      activePlayerName: 'Probe Warrior',
      cosmeticsOwned: [],
      characters: [
        baseChar({
          achievementsClaimed: [
            { achievementId: 'first_blood', claimedAt: new Date().toISOString() },
            { achievementId: 'first_blood', claimedAt: new Date().toISOString() },
            { achievementId: 'conquista_falsa', claimedAt: new Date().toISOString() },
            { achievementId: 'veteran_50', claimedAt: 'não é data' },
          ],
        }),
      ],
    });
    const claimed = out.characters[0].achievementsClaimed;
    expect(claimed).toHaveLength(2);
    expect(claimed.map((a) => a.achievementId).sort()).toEqual(['first_blood', 'veteran_50']);
    expect(claimed.find((a) => a.achievementId === 'veteran_50')?.claimedAt).toBeNull();
  });

  test('turno em andamento: profissão válida mantida; desconhecida descartada', () => {
    const now = Date.now();
    const out = sanitizeCloudProgress({
      version: 2,
      savedAt: new Date().toISOString(),
      activePlayerName: null,
      cosmeticsOwned: [],
      characters: [
        baseChar({
          missionId: PROFESSION_ID,
          missionEndsAt: new Date(now + 30 * 60_000).toISOString(),
        }),
        baseChar({
          name: 'Hacker',
          missionId: 'profissao_inexistente',
          missionEndsAt: new Date(now + 30 * 60_000).toISOString(),
        }),
      ],
    });
    const [ok1, hacker] = out.characters;
    expect(ok1.missionId).toBe(PROFESSION_ID);
    expect(ok1.missionEndsAt).not.toBeNull();
    expect(hacker.missionId).toBeNull();
    expect(hacker.missionEndsAt).toBeNull();
  });

  test('turno em andamento: data absurda descarta; turno vencido há 2 dias mantém coletável', () => {
    const now = Date.now();
    const out = sanitizeCloudProgress({
      version: 2,
      savedAt: new Date().toISOString(),
      activePlayerName: null,
      cosmeticsOwned: [],
      characters: [
        baseChar({
          name: 'Futurista',
          missionId: PROFESSION_ID,
          missionEndsAt: new Date(now + 90 * 86400_000).toISOString(),
        }),
        baseChar({
          name: 'Vencido',
          missionId: PROFESSION_ID,
          missionEndsAt: new Date(now - 2 * 86400_000).toISOString(),
        }),
      ],
    });
    const [futurista, vencido] = out.characters;
    expect(futurista.missionId).toBeNull(); // 90 dias no futuro = absurdo
    expect(vencido.missionId).toBe(PROFESSION_ID); // vencido há 2 dias = coletável
    expect(vencido.missionEndsAt).not.toBeNull();
  });

  test('relógios de regeneração: inválidos caem para "agora"; válidos preservados', () => {
    const valid = new Date(Date.now() - 3600_000).toISOString();
    const out = sanitizeCloudProgress({
      version: 2,
      savedAt: new Date().toISOString(),
      activePlayerName: null,
      cosmeticsOwned: [],
      characters: [
        baseChar({ lastRegen: valid, lastRegenHp: 'limão' }),
        baseChar({ name: 'Ancião', lastRegen: '1990-01-01T00:00:00Z', lastRegenHp: null }),
      ],
    });
    const [bom, antigo] = out.characters;
    expect(bom.lastRegen).toBe(valid);
    // inválido → null é o padrão do schema: o relógio de HP recalcula
    // a partir do lastRegen na primeira execução (comportamento original)
    expect(bom.lastRegenHp).toBeNull();
    expect(Date.parse(antigo.lastRegen)).toBeGreaterThan(Date.now() - 31 * 86400_000); // clampado
  });

  test('snapshot v1 (sem os campos novos) continua restaurando com padrões seguros', () => {
    const out = sanitizeCloudProgress({
      version: 1,
      savedAt: new Date().toISOString(),
      activePlayerName: null,
      cosmeticsOwned: [],
      characters: [baseChar()], // sem quests/mission/regen
    });
    const c = out.characters[0];
    expect(c.quests).toEqual([]);
    expect(c.achievementsClaimed).toEqual([]);
    expect(c.missionId).toBeNull();
    expect(c.missionEndsAt).toBeNull();
    expect(Date.parse(c.lastRegen)).toBeGreaterThan(Date.now() - 60_000);
  });

  test('cloudCharacterToPlayerData devolve turno e relógios como Date', () => {
    const endsAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const out = sanitizeCloudProgress({
      version: 2,
      savedAt: new Date().toISOString(),
      activePlayerName: null,
      cosmeticsOwned: [],
      characters: [
        baseChar({ missionId: PROFESSION_ID, missionEndsAt: endsAt, lastRegenHp: null }),
      ],
    });
    const data = cloudCharacterToPlayerData(out.characters[0]);
    expect(data.missionId).toBe(PROFESSION_ID);
    expect(data.missionEndsAt).toBeInstanceOf(Date);
    expect(data.missionEndsAt?.toISOString()).toBe(endsAt);
    expect(data.lastRegen).toBeInstanceOf(Date);
    expect(data.lastRegenHp).toBeNull();
  });

  test('round-trip: servidor serializa → nuvem → sanitiza → dados de criação preservam o essencial', () => {
    const endsAt = new Date(Date.now() + 45 * 60_000);
    const snap = serializeProgressForCloud(
      [playerFixture({ missionId: PROFESSION_ID, missionEndsAt: endsAt })],
      [],
      'Son Goku',
      new Map([
        [
          'p1',
          {
            quests: [
              { questId: DAILY_DEF.id, kind: 'daily', period: '2026-09-12', progress: 2, claimed: false },
            ],
            achievements: [{ achievementId: 'first_blood', claimedAt: null }],
          },
        ],
      ])
    );
    const sanitized = sanitizeCloudProgress(JSON.parse(JSON.stringify(snap)));
    expect(sanitized.characters).toHaveLength(1);
    const c = sanitized.characters[0];
    expect(c.missionId).toBe(PROFESSION_ID);
    expect(c.quests).toEqual([
      { questId: DAILY_DEF.id, kind: 'daily', period: '2026-09-12', progress: 2, claimed: false },
    ]);
    expect(c.achievementsClaimed).toEqual([{ achievementId: 'first_blood', claimedAt: null }]);
  });
});
