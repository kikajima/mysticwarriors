// =====================================================================
// v0.9.11 — SERVIÇO ÚNICO DE ESTADO INICIAL DE PERSONAGEM
// ---------------------------------------------------------------------
// Garantia estrutural: a CRIAÇÃO (/api/game/create) e o RESET de
// personagem do painel admin usam a MESMA fonte (characterInitial.ts).
// O bug do "cosmético sobrevivente ao reset" nasceu de duas listas
// enumeradas separadas que divergiram — estes testes travam a
// consistência para que NUNCA mais divirjam:
//  1. initialPlayerData cobre TODOS os campos de jogo do Player
//     (incluindo crystals/cosméticos/avatar, que a lista antiga
//     esquecia);
//  2. initialCloudCharacterState zera o snapshot v3 exceto identidade;
//  3. o snapshot inicial é válido para sanitizeCharacter (o jogo
//     consegue restaurá-lo sem erro).
// =====================================================================

import { describe, expect, test } from 'bun:test';
import {
  INITIAL_PLAYER_DATA,
  initialPlayerData,
  initialCloudCharacterState,
} from '../src/lib/game/characterInitial';
import { sanitizeCloudCharacterState } from '../src/lib/supabase/progress';

describe('v0.9.11 — initialPlayerData (estado de criação do Player)', () => {
  test('valores de criação canônicos', () => {
    const d = initialPlayerData();
    expect(d.level).toBe(1);
    expect(d.xp).toBe(0);
    expect(d.zeni).toBe(500);
    expect(d.crystals).toBe(0);
    expect(d.hp).toBe(145);
    expect(d.energy).toBe(100);
    expect(d.strength).toBe(10);
    expect(d.defense).toBe(10);
    expect(d.speed).toBe(10);
    expect(d.ki).toBe(10);
  });

  test('campos que o reset antigo DEIXAVA PASSAR agora estão presentes e zerados', () => {
    const d = initialPlayerData();
    expect(d).toHaveProperty('crystals', 0); // diamantes
    expect(d).toHaveProperty('cosmeticsOwned', '[]'); // compras da loja
    expect(d).toHaveProperty('cosmeticsEquipped', '{}'); // equipados
    expect(d).toHaveProperty('avatarUrl', null); // avatar padrão
    expect(d).toHaveProperty('transformationsOwned', '[]');
    expect(d).toHaveProperty('missionId', null);
    expect(d).toHaveProperty('missionEndsAt', null);
    expect(d).toHaveProperty('professions', '{}');
  });

  test('JSON embutidos são válidos (itens/loadout/etc.)', () => {
    expect(() => JSON.parse(INITIAL_PLAYER_DATA.items)).not.toThrow();
    expect(() => JSON.parse(INITIAL_PLAYER_DATA.loadout)).not.toThrow();
    expect(() => JSON.parse(INITIAL_PLAYER_DATA.cosmeticsEquipped)).not.toThrow();
    expect(() => JSON.parse(INITIAL_PLAYER_DATA.cosmeticsOwned)).not.toThrow();
    const items = JSON.parse(INITIAL_PLAYER_DATA.items);
    expect(items.weapon).toBeNull();
    expect(items.owned).toEqual([]);
    expect(items.consumables).toEqual({});
  });

  test('cópia fresca: mutar o retorno não contamina a constante', () => {
    const a = initialPlayerData();
    (a as { level: number }).level = 99;
    expect(INITIAL_PLAYER_DATA.level).toBe(1);
    expect(initialPlayerData().level).toBe(1);
  });

  test('NÃO contém campos de identidade (nome/raça/sexo/id ficam a cargo do chamador)', () => {
    const d = initialPlayerData() as Record<string, unknown>;
    expect(d).not.toHaveProperty('name');
    expect(d).not.toHaveProperty('race');
    expect(d).not.toHaveProperty('gender');
    expect(d).not.toHaveProperty('id');
    expect(d).not.toHaveProperty('accountId');
  });
});

describe('v0.9.11 — initialCloudCharacterState (snapshot v3 zerado)', () => {
  // v0.16 — identidade SEM gênero (mecânica extinta — 3ª ordem)
  const identity = { id: 'clxxx123', name: 'Vegeta', race: 'saiyajin' as const };

  test('preserva APENAS a identidade; todo o resto é estado de criação', () => {
    const s = initialCloudCharacterState(identity);
    expect(s.id).toBe('clxxx123');
    expect(s.name).toBe('Vegeta');
    expect(s.race).toBe('saiyajin');
    // v0.16 — ANTI-DRIFT: o snapshot de nuvem NASCE sem gênero
    expect(s).not.toHaveProperty('gender');
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.zeni).toBe(500);
    expect(s.crystals).toBe(0);
    expect(s.avatarUrl).toBeNull();
    expect(s.cosmeticsOwned).toEqual([]);
    expect(s.cosmeticsEquipped).toEqual({});
    expect(s.quests).toEqual([]);
    expect(s.achievementsClaimed).toEqual([]);
    expect(s.items.owned).toEqual([]);
    expect(s.missionId).toBeNull();
  });

  test('snapshot inicial passa na sanitização do jogo (restaurável sem erro)', () => {
    const s = initialCloudCharacterState(identity);
    const clean = sanitizeCloudCharacterState(s);
    expect(clean.level).toBe(1);
    expect(clean.name).toBe('Vegeta');
    expect(clean.cosmeticsOwned).toEqual([]);
  });

  test('duas chamadas produzem relógios independentes (sem estado compartilhado)', () => {
    const a = initialCloudCharacterState(identity);
    const b = initialCloudCharacterState(identity);
    expect(a).not.toBe(b);
    expect(a.items).not.toBe(b.items); // objetos internos also frescos
    expect(a.cosmeticsOwned).not.toBe(b.cosmeticsOwned);
  });
});
