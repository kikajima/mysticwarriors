// =====================================================================
// v0.9 — PROFISSÕES SEM ENERGIA · TREINO INSTANTÂNEO · PAINEL DE ADMIN
// =====================================================================

import { describe, expect, test } from 'bun:test';
import {
  ADMIN_LIMITS,
  clampAdminInt,
  patchCloudCharacterState,
  patchCloudResetCharacterState,
} from '../src/lib/game/adminActions';
import { CREATION_DEFAULTS } from '../src/lib/game/balance';
import type { CloudCharacterSnapshot } from '../src/lib/supabase/progress';

function charFixture(): CloudCharacterSnapshot {
  return {
    id: 'clxxxgoku123',
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
    // v0.9.6 — posse de cosméticos é DO personagem
    cosmeticsOwned: [],
    missionId: null,
    missionEndsAt: null,
    lastRegen: '2026-09-12T10:00:00.000Z',
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

describe('v0.9 — clampAdminInt (limites defensivos das ações de admin)', () => {
  test('números não inteiros e inválidos viram inteiros seguros', () => {
    expect(clampAdminInt(12.9, 0, 100)).toBe(12);
    expect(clampAdminInt('42', 0, 100)).toBe(42);
    expect(clampAdminInt(Number.NaN, 0, 100)).toBe(0);
    expect(clampAdminInt('lixo', 0, 100)).toBe(0);
    expect(clampAdminInt(-5, 0, 100)).toBe(0);
    expect(clampAdminInt(1e12, 0, ADMIN_LIMITS.zeni)).toBe(ADMIN_LIMITS.zeni);
  });
});

describe('v0.9.6 — patchCloudCharacterState (patch direto no estado do personagem na nuvem)', () => {
  test('concede recursos com clamps (Zeni, Diamantes, Esferas ≤ 7, XP)', () => {
    const out = patchCloudCharacterState(charFixture(), {
      zeniDelta: 10_000,
      crystalDelta: 25,
      ballDelta: 10,
      xpGain: 500,
    });
    expect(out).not.toBeNull();
    expect(out!.zeni).toBe(15_000);
    expect(out!.crystals).toBe(65);
    expect(out!.dragonBalls).toBe(7); // nunca passa de 7
    expect(out!.xp).toBe(700);
    // o personagem original não é mutado (imutabilidade do estado)
    expect(charFixture().zeni).toBe(5000);
  });

  test('edita atributos e define nível/XP absolutos; energia total usa a fórmula do jogo', () => {
    const out = patchCloudCharacterState(charFixture(), {
      strength: 5_000_000,
      ki: 500,
      level: 42,
      xp: 0,
      restoreEnergy: true,
    });
    expect(out).not.toBeNull();
    expect(out!.strength).toBe(ADMIN_LIMITS.stat); // 999.999
    expect(out!.ki).toBe(500);
    expect(out!.level).toBe(42);
    expect(out!.xp).toBe(0);
    expect(out!.energy).toBe(100); // mesma fórmula do jogo
  });

  test('completar profissão vence o turno AGORA; inválido → null', () => {
    const base = charFixture();
    base.missionId = 'agricultor';
    base.missionEndsAt = new Date(Date.now() + 3600_000).toISOString();
    const out = patchCloudCharacterState(base, { finishMission: true });
    expect(out).not.toBeNull();
    expect(new Date(out!.missionEndsAt!).getTime()).toBeLessThanOrEqual(Date.now());
    // sem turno em andamento → estado não muda esse campo
    const semTurno = patchCloudCharacterState(charFixture(), { finishMission: true });
    expect(semTurno!.missionEndsAt).toBeNull();

    expect(patchCloudCharacterState(null, { zeniDelta: 1 })).toBeNull();
    expect(patchCloudCharacterState('lixo', { zeniDelta: 1 })).toBeNull();
  });

  test('v0.9.6: dar item, cosmético e transformação direto no estado', () => {
    const out = patchCloudCharacterState(charFixture(), {
      itemId: 'senzu', // consumível
      cosmeticId: 'aura_chama',
      transformationId: 'saiyajin_ss1',
    });
    expect(out).not.toBeNull();
    expect(out!.items.consumables['senzu']).toBe(1);
    expect(out!.cosmeticsOwned).toContain('aura_chama');
    expect(out!.transformationsOwned).toContain('saiyajin_ss1');
    // segunda concessão não duplica
    const twice = patchCloudCharacterState(out!, { cosmeticId: 'aura_chama' });
    expect(twice!.cosmeticsOwned.filter((c) => c === 'aura_chama')).toHaveLength(1);
  });

  test('v0.9.6: transformação de OUTRA raça é recusada no patch de nuvem', () => {
    const namek = { ...charFixture(), race: 'namekuseijin' as const };
    const out = patchCloudCharacterState(namek, { transformationId: 'saiyajin_ss1' });
    expect(out!.transformationsOwned).not.toContain('saiyajin_ss1');
    const qualquer = patchCloudCharacterState(namek, { transformationId: 'qualquer_coisa' });
    expect(qualquer).not.toBeNull(); // id desconhecido é simplesmente ignorado
  });
});

describe('v0.9.6 — patchCloudResetCharacterState (reset de UM personagem, sem apagar)', () => {
  test('v0.9.11: escreve o estado de criação — SÓ identidade sobrevive', () => {
    const base: CloudCharacterSnapshot = {
      ...charFixture(),
      avatarUrl: 'https://exemplo.com/avatar.png',
      crystals: 77,
      cosmeticsEquipped: { title: 'titan' },
      cosmeticsOwned: ['aura_chama', 'titan'],
      transformationsOwned: ['saiyajin_ss1'],
      transformationId: 'saiyajin_ss1',
      professions: {
        miner: { hours: 12, lifetimeHours: 12, prestige: 0, statMilliRemainder: 0, cycleStatGranted: 0 },
      },
      missionsCompleted: ['miner_turn_1'],
      quests: [{ questId: 'daily_win3', kind: 'daily', period: '2026-09-13', progress: 2, claimed: false }],
      achievementsClaimed: [{ achievementId: 'first_blood', claimedAt: '2026-09-10T00:00:00.000Z' }],
    };
    const out = patchCloudResetCharacterState(base);
    expect(out).not.toBeNull();
    // estado de criação
    expect(out!.level).toBe(1);
    expect(out!.xp).toBe(0);
    expect(out!.zeni).toBe(500);
    expect(out!.hp).toBe(145);
    expect(out!.energy).toBe(100);
    expect(out!.strength).toBe(10);
    expect(out!.dragonBalls).toBe(0);
    expect(out!.techniques).toEqual([]);
    expect(out!.professions).toEqual({});
    expect(out!.missionId).toBeNull();
    // v0.9.11 — o que ANTES passava batido agora zera:
    expect(out!.crystals).toBe(0); // diamantes zerados
    expect(out!.avatarUrl).toBeNull(); // avatar volta ao padrão
    expect(out!.cosmeticsOwned).toEqual([]); // compras da loja apagadas
    expect(out!.cosmeticsEquipped).toEqual({}); // nada equipado
    expect(out!.transformationsOwned).toEqual([]); // transformações perdidas
    expect(out!.transformationId).toBeNull();
    expect(out!.missionsCompleted).toEqual([]);
    expect(out!.quests).toEqual([]); // diárias/semanais zeradas
    expect(out!.achievementsClaimed).toEqual([]); // conquistas zeradas
    // identidade preservada
    expect(out!.id).toBe('clxxxgoku123');
    expect(out!.name).toBe('Goku');
    expect(out!.race).toBe('saiyajin');
    // relógios renascem AGORA (nunca retroativos)
    expect(out!.lastRegen).toBeTruthy();
    expect(out!.lastRegenHp).toBeTruthy();
    // imutável
    expect(base.level).toBe(10);
    expect(base.zeni).toBe(5000);
    expect(base.crystals).toBe(77);
    expect(base.cosmeticsOwned).toEqual(['aura_chama', 'titan']);

    expect(patchCloudResetCharacterState(null)).toBeNull();
    expect(patchCloudResetCharacterState('lixo')).toBeNull();
  });

  test('CREATION_DEFAULTS reflete os valores de criação (nível 1, 500 Zeni, stats 10)', () => {
    expect(CREATION_DEFAULTS.level).toBe(1);
    expect(CREATION_DEFAULTS.xp).toBe(0);
    expect(CREATION_DEFAULTS.zeni).toBe(500);
    expect(CREATION_DEFAULTS.strength).toBe(10);
    expect(CREATION_DEFAULTS.energy).toBe(100);
    expect(CREATION_DEFAULTS.hp).toBe(145);
    // política do BALANCEAMENTO (preservacionista): diamantes NÃO são
    // zerados quando só as fórmulas mudam — contrato distinto do reset
    // de personagem do painel (v0.9.11), que zera tudo menos identidade
    expect(CREATION_DEFAULTS).not.toHaveProperty('crystals');
  });
});
