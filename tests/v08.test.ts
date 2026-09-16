// =====================================================================
// v0.8 — CONTAS NA NUVEM (Supabase): testes do snapshot/restore
// =====================================================================

import { describe, expect, test } from 'bun:test';
import type { Player } from '@prisma/client';
import {
  serializeProgressForCloud,
  sanitizeCloudProgress,
  cloudCharacterToPlayerData,
  CloudValidationError,
} from '../src/lib/supabase/progress';
import { translateSupabaseAuthError } from '../src/lib/supabase/client';

// ===== fixture de Player (todos os campos do schema) =====

function playerFixture(overrides: Partial<Player> = {}): Player {
  const now = new Date('2026-09-11T12:00:00Z');
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
    stateVersion: 3,
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

describe('v0.8→v0.9.6 — serializeProgressForCloud (servidor → nuvem)', () => {
  test('snapshot contém todos os campos relevantes do personagem', () => {
    const snap = serializeProgressForCloud(
      [playerFixture({ items: '{"weapon":null,"armor":null,"accessory":null,"owned":["bastao"],"consumables":{"senzu":2}}', techniques: '["kamehameha"]', cosmeticsOwned: '["aura_ki_pulsante"]' })],
      ['aura_ki_pulsante'],
      'Son Goku'
    );
    // v0.9.6: contrato v3 (id + cosméticos por personagem); o formato
    // antigo (characters[]) segue existindo p/ retrocompatibilidade de
    // restauração e ferramentas.
    expect(snap.version).toBe(3);
    expect(snap.characters).toHaveLength(1);
    const c = snap.characters[0];
    expect(c.id).toBe('p1');
    expect(c.name).toBe('Son Goku');
    expect(c.race).toBe('saiyajin');
    expect(c.level).toBe(12);
    expect(c.pvpWins).toBe(2);
    expect(c.trainingsDone).toBe(8);
    expect(c.items.owned).toContain('bastao');
    expect(c.items.consumables['senzu']).toBe(2);
    expect(c.techniques).toContain('kamehameha');
    expect(c.missionsCompleted).toContain('agricultor');
    expect(c.professions['agricultor']).toEqual({ rank: 2, completions: 1 });
    // v0.9.6: a posse também viaja NO personagem
    expect(c.cosmeticsOwned).toEqual(['aura_ki_pulsante']);
    expect(snap.cosmeticsOwned).toEqual(['aura_ki_pulsante']);
    expect(snap.activePlayerName).toBe('Son Goku');
  });

  test('JSON corrompido nas colunas não quebra o snapshot (parsers robustos)', () => {
    const snap = serializeProgressForCloud(
      [playerFixture({ items: '{{{', techniques: 'não-json', professions: null, missionsCompleted: '}}}inválido' })],
      [],
      null
    );
    expect(snap.characters[0].items.owned).toEqual([]);
    expect(snap.characters[0].techniques).toEqual([]);
    expect(snap.characters[0].professions).toEqual({});
    expect(snap.characters[0].missionsCompleted).toEqual([]);
  });

  test('round-trip: serializa → sanitiza → dados de criação preservam o essencial', () => {
    const snap = serializeProgressForCloud([playerFixture()], [], 'Son Goku');
    const sanitized = sanitizeCloudProgress(snap);
    expect(sanitized.characters).toHaveLength(1);
    const data = cloudCharacterToPlayerData(sanitized.characters[0]);
    expect(data.name).toBe('Son Goku');
    expect(data.level).toBe(12);
    expect(data.zeni).toBe(5000);
    expect(JSON.parse(data.professions)).toEqual({ agricultor: { rank: 2, completions: 1 } });
    expect(JSON.parse(data.missionsCompleted)).toEqual(['agricultor']);
  });
});

describe('v0.8 — sanitizeCloudProgress (nuvem não confiável → válido)', () => {
  test('números absurdos são clampados, nunca rejeitados', () => {
    const out = sanitizeCloudProgress({
      characters: [
        {
          name: 'Hacker',
          race: 'majin',
          level: 99999,
          xp: -50,
          zeni: 1e15,
          crystals: 1e9,
          hp: 1e9,
          energy: -1,
          strength: 1e7,
          dragonBalls: 12,
          battlesWon: 1e12,
        },
      ],
    });
    const c = out.characters[0];
    expect(c.level).toBe(999);
    expect(c.xp).toBe(0);
    expect(c.zeni).toBe(100_000_000);
    expect(c.crystals).toBe(100_000);
    // v0.9: atributos concedidos pelo painel de admin (até 999.999)
    // precisam sobreviver a uma restauração futura da nuvem
    expect(c.strength).toBe(999_999);
    expect(c.hp).toBe(10_000_000);
    expect(c.energy).toBe(0);
    expect(c.dragonBalls).toBe(7);
    expect(c.battlesWon).toBe(1_000_000);
  });

  test('ids fora dos catálogos são removidos (itens, técnicas, transformações, cosméticos)', () => {
    const out = sanitizeCloudProgress({
      cosmeticsOwned: ['aura_ki_pulsante', 'cosmetico_inexistente'],
      characters: [
        {
          name: 'Tester',
          race: 'humano',
          techniques: ['kamehameha', 'genkidama_falsa'],
          items: { owned: ['bastao', 'item_hackerado'], consumables: { senzu: 3, pocao_falsa: 9 } },
          transformationsOwned: ['saiyajin_ss1', 'forma_deus_hacker'],
          transformationId: 'forma_deus_hacker',
        },
      ],
    });
    expect(out.cosmeticsOwned).toEqual(['aura_ki_pulsante']);
    const c = out.characters[0];
    expect(c.techniques).toEqual(['kamehameha']);
    expect(c.items.owned).toEqual(['bastao']);
    expect(Object.keys(c.items.consumables)).toEqual(['senzu']);
    expect(c.transformationsOwned).toEqual(['saiyajin_ss1']);
    // transformationId precisa pertencer ao que é possuído
    expect(c.transformationId).toBeNull();
  });

  test('equipamentos exigem posse; loadout exige técnica conhecida; cosmético equipado exige posse da conta', () => {
    const out = sanitizeCloudProgress({
      cosmeticsOwned: ['aura_ki_pulsante'],
      characters: [
        {
          name: 'Tester',
          race: 'namekuseijin',
          items: { owned: [], weapon: 'bastao', armor: null, accessory: null, consumables: {} },
          techniques: ['kamehameha'],
          loadout: { '1': 'kamehameha', '2': 'tecnica_falsa', S: null },
          cosmeticsEquipped: { aura: 'aura_ki_pulsante', title: 'titulo_nao_possuido' },
        },
      ],
    });
    const c = out.characters[0];
    // arma não possuída → removida
    expect(c.items.weapon).toBeNull();
    // loadout só mantém técnicas conhecidas
    expect(c.loadout['1']).toBe('kamehameha');
    expect(c.loadout['2']).toBeNull();
    // cosmético equipado sem posse → removido
    expect(c.cosmeticsEquipped.aura).toBe('aura_ki_pulsante');
    expect(c.cosmeticsEquipped.title).toBeUndefined();
  });

  test('avatarUrl perigoso é descartado (javascript:, data:); http e interno passam', () => {
    const mk = (avatarUrl: unknown) =>
      sanitizeCloudProgress({ characters: [{ name: 'Av', race: 'androide', avatarUrl }] }).characters[0].avatarUrl;
    expect(mk('javascript:alert(1)')).toBeNull();
    expect(mk('data:text/html,<script>')).toBeNull();
    expect(mk('ftp://x')).toBeNull();
    expect(mk('https://exemplo.com/a.png')).toBe('https://exemplo.com/a.png');
    expect(mk('/api/game/avatars/foto.png')).toBe('/api/game/avatars/foto.png');
  });

  test('nome/raça inválidos e excesso de personagens são rejeitados com erro claro', () => {
    expect(() => sanitizeCloudProgress({ characters: [{ name: 'X', race: 'humano' }] })).toThrow(CloudValidationError);
    expect(() => sanitizeCloudProgress({ characters: [{ name: 'Bom Nome', race: 'sayajin_falso' }] })).toThrow(
      CloudValidationError
    );
    expect(() =>
      sanitizeCloudProgress({
        characters: [1, 2, 3, 4].map(() => ({ name: 'Guerreiro', race: 'humano' })),
      })
    ).toThrow(CloudValidationError);
  });

  test('estrutura totalmente inválida → erro (nunca silencioso)', () => {
    expect(() => sanitizeCloudProgress(null)).toThrow(CloudValidationError);
    expect(() => sanitizeCloudProgress('texto')).toThrow(CloudValidationError);
    expect(() => sanitizeCloudProgress([1, 2])).toThrow(CloudValidationError);
  });

  test('profissões desconhecidas são descartadas; ranks e completions clampados', () => {
    const out = sanitizeCloudProgress({
      characters: [
        {
          name: 'Pro',
          race: 'humano',
          professions: {
            agricultor: { rank: 99, completions: -5 },
            profissao_falsa: { rank: 1, completions: 1 },
          },
        },
      ],
    });
    expect(out.characters[0].professions['agricultor']).toEqual({ rank: 5, completions: 0 });
    expect(out.characters[0].professions['profissao_falsa']).toBeUndefined();
  });

  test('estratégia desconhecida cai para balanced; gender legado é DESCARTADO (v0.16)', () => {
    const out = sanitizeCloudProgress({
      characters: [{ name: 'Est', race: 'majin', strategy: 'ultra_instinto', gender: 'outro' }],
    });
    expect(out.characters[0].strategy).toBe('balanced');
    // v0.16 — snapshot legado com gender: campo é simplesmente ignorado
    expect(out.characters[0]).not.toHaveProperty('gender');
  });
});

describe('v0.8 — translateSupabaseAuthError (mensagens amigáveis)', () => {
  test('códigos reais do projeto viram mensagens em português', () => {
    expect(translateSupabaseAuthError({ code: 'invalid_credentials' }).message).toContain('incorretos');
    expect(translateSupabaseAuthError({ code: 'email_not_confirmed' }).message).toContain('confirmado');
    expect(translateSupabaseAuthError({ code: 'user_already_registered' }).message).toContain('já tem conta');
    expect(translateSupabaseAuthError({ code: 'weak_password' }).message).toContain('8 caracteres');
    expect(translateSupabaseAuthError({ code: 'over_email_send_rate_limit' }).message).toContain(
      'Muitas tentativas'
    );
    expect(translateSupabaseAuthError({ code: 'email_address_invalid' }).message).toContain('não parece válido');
  });

  test('mensagens legadas (sem código) também são traduzidas', () => {
    expect(translateSupabaseAuthError({ message: 'User already registered' }).message).toContain('já tem conta');
    expect(translateSupabaseAuthError({ message: 'Password should be at least 6 characters.' }).message).toContain(
      '8 caracteres'
    );
    expect(translateSupabaseAuthError({ message: 'Invalid login credentials' }).message).toContain('incorretos');
  });

  test('erros 429 vêm marcados como rate-limit com tempo de espera', () => {
    const emailLimit = translateSupabaseAuthError({ code: 'over_email_send_rate_limit' });
    expect(emailLimit.kind).toBe('rate-limit');
    expect(emailLimit.retryInSeconds).toBeGreaterThan(0);

    const requestLimit = translateSupabaseAuthError({ code: 'over_request_rate_limit' });
    expect(requestLimit.kind).toBe('rate-limit');
    expect(requestLimit.message).toContain('1 minuto');

    const legacy429 = translateSupabaseAuthError({ message: 'Some rate limit hit', status: 429 });
    expect(legacy429.kind).toBe('rate-limit');

    // erros comuns NÃO devem ser confundidos com rate-limit
    expect(translateSupabaseAuthError({ code: 'invalid_credentials' }).kind).toBeUndefined();
  });

  test('desconhecido → mensagem genérica, nunca vazia', () => {
    const msg = translateSupabaseAuthError({ code: 'erro_novo_qualquer' }).message;
    expect(msg.length).toBeGreaterThan(10);
  });
});
