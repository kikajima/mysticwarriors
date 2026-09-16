/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import {
  PROFESSIONS,
  PROFESSION_RANKS,
  PROFESSION_MAX_RANK,
  getProfession,
  professionRankTitle,
  professionXpReward,
  professionEnergyCostOf,
  REGEN,
  BATTLE_ENERGY_COST,
  PROFESSION_ENERGY_COST,
} from '@/lib/game/content/world';
import { parseProfessions, serializeProfessions, professionRewards, professionEnergyCost } from '@/lib/game/engine';
import { BALANCE_VERSION } from '@/lib/game/rules';
import { COSMETICS, getCosmetic, equippedCosmetic, COSMETIC_SLOTS } from '@/lib/game/content/cosmetics';

// =====================================================================
// TESTES v0.6 — profissões, energia 5min/ponto, batalhas gastam energia,
// cosméticos de aura (ex-grátis) e política de reset por balanceamento.
// =====================================================================

describe('PROFISSÕES v0.6 — conteúdo', () => {
  test('as 5 profissões pedidas existem com ids estáveis', () => {
    const ids = PROFESSIONS.map((p) => p.id).sort();
    expect(ids).toEqual(['academico', 'agricultor', 'atleta', 'cientista', 'policial']);
    expect(getProfession('agricultor')?.name).toBe('Agricultor');
    expect(getProfession('cientista')?.name).toBe('Cientista');
    expect(getProfession('academico')?.name).toBe('Acadêmico');
    expect(getProfession('policial')?.name).toBe('Policial');
    expect(getProfession('atleta')?.name).toBe('Atleta');
  });

  test('todas as profissões: turno de 1 hora e custo de 6 energia', () => {
    for (const p of PROFESSIONS) {
      expect(p.durationMin).toBe(60);
      expect(p.energyCost).toBe(PROFESSION_ENERGY_COST);
    }
  });

  test('ranks: 5 níveis, Zeni 300→1500 (5x gradual), bônus 1k/3k/9k/30k', () => {
    expect(PROFESSION_MAX_RANK).toBe(5);
    expect(PROFESSION_RANKS[0].zeni).toBe(300);
    expect(PROFESSION_RANKS[4].zeni).toBe(1500);
    expect(PROFESSION_RANKS[4].zeni).toBe(PROFESSION_RANKS[0].zeni * 5);
    for (let i = 1; i < 5; i++) {
      expect(PROFESSION_RANKS[i].zeni).toBeGreaterThan(PROFESSION_RANKS[i - 1].zeni);
    }
    expect(PROFESSION_RANKS.map((r) => r.promotionBonus)).toEqual([0, 1_000, 3_000, 9_000, 30_000]);
  });

  test('promoções exigem 3/4/5/6 turnos — 18h no total por profissão', () => {
    expect(PROFESSION_RANKS.slice(0, 4).map((r) => r.completionsToPromote)).toEqual([3, 4, 5, 6]);
    expect(PROFESSION_RANKS[4].completionsToPromote).toBe(0); // topo não promove mais
    const total = PROFESSION_RANKS.slice(0, 4).reduce((s, r) => s + r.completionsToPromote, 0);
    expect(total).toBe(18);
  });

  test('títulos de rank: 5 distintos por profissão e rank máximo não estoura', () => {
    for (const p of PROFESSIONS) {
      expect(new Set(p.rankNames).size).toBe(5);
      expect(professionRankTitle(p, 1)).toBe(p.rankNames[0]);
      expect(professionRankTitle(p, 5)).toBe(p.rankNames[4]);
      expect(professionRankTitle(p, 99)).toBe(p.rankNames[4]); // clamp
    }
  });
});

describe('PROFISSÕES v0.6 — recompensas e energia', () => {
  test('XP por turno é fração do nível ATUAL (10% → 25%) — balanceado em qualquer nível', () => {
    // nível 1: 80 XP necessários → 8..20 XP por turno
    expect(professionXpReward(1, 1)).toBe(8);
    expect(professionXpReward(5, 1)).toBe(20);
    // nível 20: 8.311 XP → 832..2078 por turno
    expect(professionXpReward(1, 20)).toBe(832);
    expect(professionXpReward(5, 20)).toBe(2078);
    // a fração cresce com o rank
    for (let lvl = 1; lvl <= 50; lvl += 7) {
      for (let r = 2; r <= 5; r++) {
        expect(professionXpReward(r, lvl)).toBeGreaterThan(professionXpReward(r - 1, lvl));
      }
    }
  });

  test('professionRewards: Zeni fixo do rank + XP do nível + chance de esfera', () => {
    const r = professionRewards(3, 20, 'saiyajin', () => 0.5); // rng nunca acha esfera
    expect(r.zeni).toBe(675);
    expect(r.xp).toBe(professionXpReward(3, 20));
    expect(r.foundDragonBall).toBe(false); // 0.5 >= 0.06

    const lucky = professionRewards(5, 20, 'saiyajin', () => 0.01); // sempre acha
    expect(lucky.foundDragonBall).toBe(true);
    expect(lucky.zeni).toBe(1500);
  });

  test('professionRewards: androide ganha +5% de Zeni (perk racial respeitado)', () => {
    const base = professionRewards(1, 10, 'saiyajin', () => 0.99);
    const androide = professionRewards(1, 10, 'androide', () => 0.99);
    expect(androide.zeni).toBe(Math.round(base.zeni * 1.05));
  });

  test('custo de energia: 6 base, 5 para androide (-15%) — UI e servidor concordam', () => {
    expect(professionEnergyCost('saiyajin')).toBe(6);
    expect(professionEnergyCost('androide')).toBe(5);
    expect(professionEnergyCostOf(6, 'androide')).toBe(professionEnergyCost('androide'));
    expect(professionEnergyCostOf(6, 'humano')).toBe(6);
  });

  test('parseProfessions: robustez total (null/lixo/ids inválidos/clamps)', () => {
    expect(parseProfessions(null)).toEqual({});
    expect(parseProfessions('')).toEqual({});
    expect(parseProfessions('lixo json')).toEqual({});
    expect(parseProfessions('[]')).toEqual({});
    expect(parseProfessions('{"inexistente":{"rank":3,"completions":1}}')).toEqual({});
    const ok = parseProfessions('{"agricultor":{"rank":2,"completions":1},"atleta":{"rank":99,"completions":-5}}');
    expect(ok.agricultor).toEqual({ rank: 2, completions: 1 });
    expect(ok.atleta).toEqual({ rank: 5, completions: 0 }); // clamp no máximo
    // round-trip
    expect(parseProfessions(serializeProfessions({ policial: { rank: 4, completions: 3 } }))).toEqual({
      policial: { rank: 4, completions: 3 },
    });
  });
});

describe('ENERGIA v0.6 — 5 minutos por ponto e batalhas gastam energia', () => {
  test('regeneração base: 300s por ponto de energia (12/hora)', () => {
    expect(REGEN.energySeconds).toBe(300);
  });

  test('batalha PvE/PvP custa 3 de energia (constante única para UI e servidor)', () => {
    expect(BATTLE_ENERGY_COST).toBe(3);
  });

  test('orçamento diário coerente: 288 pontos/dia de regen sustenta o jogo', () => {
    const daily = Math.floor((24 * 3600) / REGEN.energySeconds);
    expect(daily).toBe(288);
    // 20 batalhas + 3 turnos de profissão + 15 treinos = 60+18+45 = 123 < 288
    const gasto = 20 * BATTLE_ENERGY_COST + 3 * PROFESSION_ENERGY_COST + 15 * 3;
    expect(gasto).toBeLessThan(daily);
  });
});

describe('COSMÉTICOS v0.6 — auras que eram grátis agora são itens da loja', () => {
  test('slot novo "card" existe e é validado no parse', () => {
    expect(COSMETIC_SLOTS.has('card')).toBe(true);
  });

  test('Aura de Ki Pulsante: aura de slot com avatarPulseCss (o antigo brilho grátis)', () => {
    const c = getCosmetic('aura_ki_pulsante');
    expect(c).toBeTruthy();
    expect(c?.slot).toBe('aura');
    expect(c?.price).toBeGreaterThan(0); // comprada com diamantes
    expect(c?.avatarPulseCss).toContain('animate-pulse');
  });

  test('Aura Ancestral do Card: slot "card" com cardGlowCss', () => {
    const c = getCosmetic('card_aura_ancestral');
    expect(c).toBeTruthy();
    expect(c?.slot).toBe('card');
    expect(c?.price).toBeGreaterThan(0);
    expect(c?.cardGlowCss).toBeTruthy();
  });

  test('todo cosmético continua com efeito visual definido (nenhum "vazio")', () => {
    for (const c of COSMETICS) {
      const hasEffect =
        (c.slot === 'aura' && !!(c.avatarGlowCss ?? c.avatarPulseCss)) ||
        (c.slot === 'title' && !!c.titleText) ||
        (c.slot === 'frame' && !!c.avatarFrameCss) ||
        (c.slot === 'background' && !!c.profileBgCss) ||
        (c.slot === 'effect' && !!c.screenEffect) ||
        (c.slot === 'avatar' && !!c.avatarOverlayCss) ||
        ((c.slot === 'pose' || c.slot === 'outfit') && !!c.profileBadge) ||
        (c.slot === 'card' && !!c.cardGlowCss);
      expect(hasEffect, `${c.id} (${c.slot}) precisa de efeito visual`).toBe(true);
    }
  });

  test('equipar a nova aura funciona via equippedCosmetic', () => {
    const eq = { aura: 'aura_ki_pulsante', card: 'card_aura_ancestral' };
    expect(equippedCosmetic(eq, 'aura')?.id).toBe('aura_ki_pulsante');
    expect(equippedCosmetic(eq, 'card')?.id).toBe('card_aura_ancestral');
  });
});

describe('POLÍTICA DE ATUALIZAÇÕES v0.6 — reset de personagens, contas intactas', () => {
  test('BALANCE_VERSION subiu para 6 (economia de energia nova → reset ao atualizar)', () => {
    expect(BALANCE_VERSION).toBe(6);
  });
});
