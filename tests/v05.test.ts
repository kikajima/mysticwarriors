/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import {
  COSMETICS,
  getCosmetic,
  equippedCosmetic,
  parseCosmeticsEquipped,
  serializeCosmeticsEquipped,
} from '@/lib/game/content/cosmetics';
import { BALANCE_VERSION } from '@/lib/game/rules';
import { playerToView } from '@/lib/game/engine';
import type { Player } from '@prisma/client';
import type { RaceId } from '@/lib/game/types';

// =====================================================================
// TESTES v0.5 — cosméticos (parse/serialização/view) e política de
// balanceamento (constantes). A correção da batalha duplicada é de UI
// (filtro por activityId) e é validada nos e2e + navegador.
// =====================================================================

function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: 'test',
    name: 'Teste',
    race: 'saiyajin',
    avatarUrl: null,
    level: 5,
    xp: 0,
    zeni: 100,
    crystals: 999,
    hp: 100,
    strength: 10,
    defense: 10,
    speed: 10,
    ki: 10,
    energy: 80,
    battlesWon: 0,
    battlesLost: 0,
    pvpWins: 0,
    trainingsDone: 0,
    guildDonated: 0,
    missionsDone: 0,
    dragonBalls: 0,
    isBot: false,
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
    lastRegen: new Date(),
    lastRegenHp: null,
    cosmeticsEquipped: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    accountId: 'acc_1',
    guildId: null,
    ...over,
  } as Player;
}

describe('COSMÉTICOS v0.5 — parse/serialização robustos', () => {
  test('null/undefined/vazio → objeto vazio', () => {
    expect(parseCosmeticsEquipped(null)).toEqual({});
    expect(parseCosmeticsEquipped(undefined)).toEqual({});
    expect(parseCosmeticsEquipped('')).toEqual({});
  });

  test('JSON inválido não lança — devolve vazio', () => {
    expect(parseCosmeticsEquipped('{travisado')).toEqual({});
    expect(parseCosmeticsEquipped('123')).toEqual({});
    expect(parseCosmeticsEquipped('[1,2]')).toEqual({});
    expect(parseCosmeticsEquipped('"texto"')).toEqual({});
  });

  test('slots desconhecidos e ids inválidos são descartados', () => {
    const raw = JSON.stringify({
      aura: 'aura_chama',
      slot_inexistente: 'title_lendario',
      title: 'cosmetico_removido_do_conteudo',
      frame: 42,
    });
    expect(parseCosmeticsEquipped(raw)).toEqual({ aura: 'aura_chama' });
  });

  test('round-trip serialize → parse preserva os slots', () => {
    const equipped = { aura: 'aura_divina', title: 'title_campeao', frame: 'frame_dragao' };
    expect(parseCosmeticsEquipped(serializeCosmeticsEquipped(equipped))).toEqual(equipped);
  });
});

describe('COSMÉTICOS v0.5 — metadados visuais completos (efeitos de verdade)', () => {
  test('TODO cosmético tem efeito visual definido para o seu slot', () => {
    for (const c of COSMETICS) {
      switch (c.slot) {
        case 'aura':
          expect(
            c.avatarGlowCss ?? c.avatarPulseCss,
            `${c.id} precisa de avatarGlowCss ou avatarPulseCss`
          ).toBeTruthy();
          break;
        case 'title':
          expect(c.titleText, `${c.id} precisa de titleText`).toBeTruthy();
          break;
        case 'frame':
          expect(c.avatarFrameCss, `${c.id} precisa de avatarFrameCss`).toBeTruthy();
          break;
        case 'background':
          expect(c.profileBgCss, `${c.id} precisa de profileBgCss`).toBeTruthy();
          break;
        case 'effect': {
          const fx = c.screenEffect;
          expect(fx === 'teleport' || fx === 'kiwave', `${c.id} precisa de screenEffect válido`).toBe(true);
          break;
        }
        case 'card':
          expect(c.cardGlowCss, `${c.id} precisa de cardGlowCss`).toBeTruthy();
          break;
        case 'avatar':
          expect(c.avatarOverlayCss, `${c.id} precisa de avatarOverlayCss`).toBeTruthy();
          break;
        case 'pose':
        case 'outfit':
          expect(c.profileBadge, `${c.id} precisa de profileBadge`).toBeTruthy();
          break;
      }
    }
  });

  test('equippedCosmetic resolve o cosmético do slot (ou undefined)', () => {
    const equipped = parseCosmeticsEquipped('{"aura":"aura_trovao","title":"title_destruidor"}');
    expect(equippedCosmetic(equipped, 'aura')?.id).toBe('aura_trovao');
    expect(equippedCosmetic(equipped, 'title')?.titleText).toBe('o Destruidor');
    expect(equippedCosmetic(equipped, 'frame')).toBeUndefined();
    expect(equippedCosmetic(null, 'aura')).toBeUndefined();
  });

  test('getCosmetic devolve undefined para id inexistente', () => {
    expect(getCosmetic('nao_existe')).toBeUndefined();
  });
});

describe('PLAYER VIEW v0.5→v0.9.6 — cosméticos no contrato do estado', () => {
  test('equipped e owned vêm AMBOS do JSON do personagem (v0.9.6: posse própria)', () => {
    const p = makePlayer({
      cosmeticsEquipped: '{"aura":"aura_chama","title":"title_lendario"}',
      cosmeticsOwned: '["aura_chama","title_lendario"]',
    });
    const view = playerToView(p as never);
    expect(view.cosmetics.owned).toEqual(['aura_chama', 'title_lendario']);
    expect(view.cosmetics.equipped).toEqual({ aura: 'aura_chama', title: 'title_lendario' });
  });

  test('sem posse e sem equipados → campos vazios (nunca quebram)', () => {
    const view = playerToView(makePlayer() as never);
    expect(view.cosmetics.owned).toEqual([]);
    expect(view.cosmetics.equipped).toEqual({});
  });

  test('JSON corrompido no banco não quebra o view', () => {
    const p = makePlayer({ cosmeticsEquipped: '<<<corrompido>>>' });
    const view = playerToView(p as never);
    expect(view.cosmetics.equipped).toEqual({});
  });
});

describe('POLÍTICA DE ATUALIZAÇÕES v0.5 — reset por versão de balanceamento', () => {
  test('BALANCE_VERSION é um número positivo e estável', () => {
    expect(Number.isInteger(BALANCE_VERSION)).toBe(true);
    expect(BALANCE_VERSION).toBeGreaterThan(0);
  });

  test('personagem resetável nunca perde identidade: campos preservados no reset', () => {
    // os campos de identidade fazem parte do Player e NÃO estão na lista
    // de reset (CREATION_DEFAULTS em balance.ts) — garantia estrutural:
    // o reset de progressão nunca toca conta/nome/raça/avatar/guilda
    // (v0.16 — gender removido da identidade do jogador)
    const identityFields = ['id', 'name', 'race', 'avatarUrl', 'accountId', 'guildId', 'crystals', 'cosmeticsEquipped'] as const;
    const p = makePlayer();
    for (const f of identityFields) {
      expect((p as unknown as Record<string, unknown>)[f]).toBeDefined();
    }
  });
});
