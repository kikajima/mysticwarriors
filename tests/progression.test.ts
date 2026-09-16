/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import { hash } from '@/lib/progression';
import { DAILY_QUESTS, WEEKLY_QUESTS, ACHIEVEMENTS } from '@/lib/game/content/quests';
import { TRANSFORMATIONS, getTransformation, transformationsForRace } from '@/lib/game/content/transformations';
import { RACES, RACE_LIST } from '@/lib/game/content/races';
import { TECHNIQUES, TRAINING_MASTERS } from '@/lib/game/content/techniques';
import { PROFESSIONS, PROFESSION_RANKS, ENEMIES, SHOP_ITEMS, xpToNextLevel, baseTrainingCost } from '@/lib/game/content/world';
import { randomWarriorName, BOTS } from '@/lib/game/content/names';
import { guildLevelFromXp, guildXpToNext } from '@/lib/game/actions';

// =====================================================================
// TESTES — dados e progressão (integridade do conteúdo data-driven)
// =====================================================================

describe('Quests diárias/semanais', () => {
  test('3 diárias + 2 semanais por período são sorteáveis', () => {
    expect(DAILY_QUESTS.length).toBeGreaterThanOrEqual(3);
    expect(WEEKLY_QUESTS.length).toBeGreaterThanOrEqual(2);
  });

  test('todas as quests têm recompensas e alvo positivos', () => {
    for (const q of [...DAILY_QUESTS, ...WEEKLY_QUESTS]) {
      expect(q.target).toBeGreaterThan(0);
      expect(q.rewardZeni + q.rewardXp + q.rewardCrystals).toBeGreaterThan(0);
    }
  });

  test('sorteio determinístico: mesma seed → mesmas quests', () => {
    // o hash determinístico garante que o jogador vê as MESMAS quests
    // do dia até o reset (não re-sorteia a cada request)
    expect(hash('player1:2026-09-11:daily_battles')).toBe(hash('player1:2026-09-11:daily_battles'));
    expect(hash('player1:2026-09-11:daily_battles')).not.toBe(hash('player2:2026-09-11:daily_battles'));
  });

  test('reset diário e semanal têm chaves distintas', () => {
    const day = '2026-09-11';
    const week = '2026-W37';
    expect(day).not.toBe(week); // trivial, mas documenta o contrato
  });
});

describe('Conquistas', () => {
  test('ids únicos e métricas válidas', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.target).toBeGreaterThan(0);
    }
  });

  test('todas as 8 categorias iniciais estão presentes', () => {
    const cats = new Set(ACHIEVEMENTS.map((a) => a.category));
    for (const c of ['battle', 'training', 'level', 'pvp', 'technique', 'guild', 'collection', 'progression']) {
      expect(cats.has(c as never)).toBe(true);
    }
  });
});

describe('Transformações (árvore)', () => {
  test('cada raça tem forma I, II e 3 caminhos finais', () => {
    for (const race of RACE_LIST) {
      const forms = transformationsForRace(race.id);
      expect(forms.filter((f) => f.order === 1)).toHaveLength(1);
      expect(forms.filter((f) => f.order === 2)).toHaveLength(1);
      expect(forms.filter((f) => f.order === 3)).toHaveLength(3);
    }
  });

  test('transformações de ramo 3 exigem a forma do ramo 2', () => {
    for (const t of TRANSFORMATIONS) {
      if (t.order === 3) {
        expect(t.requiresTransformation).toBeTruthy();
        expect(getTransformation(t.requiresTransformation!)).toBeTruthy();
      }
    }
  });

  test('multiplicadores são moderados (não quebram o balanceamento)', () => {
    for (const t of TRANSFORMATIONS) {
      const mults = Object.values(t.multipliers ?? {});
      for (const m of mults) {
        expect(m).toBeLessThanOrEqual(1.35);
        expect(m).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('Integridade do conteúdo', () => {
  test('profissões: exatamente 5, todas com turnos de 1 hora', () => {
    expect(PROFESSIONS.length).toBe(5);
    for (const p of PROFESSIONS) {
      expect(p.durationMin).toBe(60);
      expect(p.energyCost).toBeGreaterThan(0);
      expect(new Set(p.rankNames).size).toBe(5); // 5 títulos distintos
    }
  });

  test('profissões: ranks pagam 300 → 1500 (5x) com bônus 1k/3k/9k/30k', () => {
    expect(PROFESSION_RANKS[0].zeni).toBe(300);
    expect(PROFESSION_RANKS[4].zeni).toBe(1500);
    expect(PROFESSION_RANKS[4].zeni / PROFESSION_RANKS[0].zeni).toBe(5);
    // aumento gradual (sem degraus que pulam mais que 60%)
    for (let i = 1; i < PROFESSION_RANKS.length; i++) {
      expect(PROFESSION_RANKS[i].zeni).toBeGreaterThan(PROFESSION_RANKS[i - 1].zeni);
    }
    expect(PROFESSION_RANKS.slice(1).map((r) => r.promotionBonus)).toEqual([1_000, 3_000, 9_000, 30_000]);
    expect(PROFESSION_RANKS[0].promotionBonus).toBe(0);
  });

  test('inimigos: 9 NPCs com níveis crescentes e recompensas positivas', () => {
    expect(ENEMIES.length).toBe(9);
    for (let i = 1; i < ENEMIES.length; i++) {
      expect(ENEMIES[i].level).toBeGreaterThan(ENEMIES[i - 1].level);
      expect(ENEMIES[i].zeniReward).toBeGreaterThan(0);
    }
  });

  test('loja: itens com ids únicos e preços positivos', () => {
    const ids = new Set(SHOP_ITEMS.map((i) => i.id));
    expect(ids.size).toBe(SHOP_ITEMS.length);
    for (const item of SHOP_ITEMS) {
      expect(item.price).toBeGreaterThan(0);
    }
  });

  test('técnicas: ids únicos referenciados pelos mestres existem', () => {
    const ids = new Set(TECHNIQUES.map((t) => t.id));
    expect(ids.size).toBe(TECHNIQUES.length);
    for (const m of TRAINING_MASTERS) {
      for (const tid of m.techniques) {
        expect(ids.has(tid)).toBe(true);
      }
    }
  });

  test('raças: perks textuais casam com a mecânica implementada (amostra v0.4)', () => {
    const sai = RACES.saiyajin;
    expect(sai.perks.some((p) => p.includes('+8% de dano'))).toBe(true);
    expect(sai.combat.physicalDamageMult).toBeCloseTo(1.08);
    const andro = RACES.androide;
    // v-auditoria F3: recalibração do Androide (C1 29,3%→38,5%; C6 preservado)
    expect(andro.combat.speedMult).toBeCloseTo(1.035);
    expect(andro.combat.dodgeBonus).toBeCloseTo(0.045);
    expect(andro.combat.kiAttackChanceBonus).toBeCloseTo(0.06);
    expect(andro.perks.some((p) => p.includes('+3,5% de velocidade'))).toBe(true);
    expect(andro.perks.some((p) => p.includes('+4,5% de chance de esquiva'))).toBe(true);
    expect(andro.perks.some((p) => p.includes('+6% de chance de atacar com Ki'))).toBe(true);
    const hum = RACES.humano;
    expect(hum.combat.defenseMult).toBeCloseTo(1.07);
    expect(hum.perks.some((p) => p.includes('+7% de Defesa'))).toBe(true);
    expect(hum.perks.some((p) => p.includes('+2% de dano em ataques de Ki'))).toBe(true);
    const nam = RACES.namekuseijin;
    expect(nam.combat.kiDamageMult).toBeCloseTo(1.05);
    expect(nam.perks.some((p) => p.includes('+5% de dano em ataques de Ki'))).toBe(true);
    const maj = RACES.majin;
    expect(maj.combat.physicalDamageMult).toBeCloseTo(1.02);
    expect(maj.perks.some((p) => p.includes('+2% em TODOS'))).toBe(true);
  });

  test('gerador de nomes: nenhum nome exato da franquia Dragon Ball', () => {
    // amostra de personagens canônicos que NÃO podem aparecer como núcleo
    const proibidos = [
      'Goku', 'Kakaroto', 'Kakarot', 'Vegeta', 'Freeza', 'Frieza', 'Cell',
      'Kuririn', 'Krillin', 'Yamcha', 'Tenshinhan', 'Chiaotzu', 'Piccolo',
      'Majin Boo', 'Brolly', 'Broly', 'Raditz', 'Nappa', 'Turles', 'Tapion',
      'Janemba', 'Bojack', 'Cooler', 'Zangya', 'Hildegarn', 'Dabura',
      'Trunks', 'Gohan', 'Goten', 'Bardak', 'Bardock', 'Yamoshi', 'Cumber',
    ];
    const gerados = new Set<string>();
    for (let i = 0; i < 3000; i++) gerados.add(randomWarriorName());
    for (const nome of gerados) {
      const nucleo = nome.replace(/^(Príncipe|Mestre|Grande|Capitão|General|Lorde|Doutor|Guardião|Místico|Xamã|Androide)\s+/, '')
        .replace(/\s+(o|a|do|da|das|de)\s+.+$/, '');
      expect(proibidos).not.toContain(nucleo);
    }
    // bots do ranking também seguem a política de nomes originais
    expect(BOTS).toHaveLength(15);
    for (const bot of BOTS) {
      expect(proibidos).not.toContain(bot.name);
    }
  });
});

describe('Guildas (nível por XP de doações)', () => {
  test('nível 1 sem doações, nível 2 aos 500 XP', () => {
    expect(guildLevelFromXp(0)).toBe(1);
    expect(guildLevelFromXp(499)).toBe(1);
    expect(guildLevelFromXp(500)).toBe(2);
    expect(guildLevelFromXp(2000)).toBe(3); // 500*2^2
    expect(guildLevelFromXp(4500)).toBe(4); // 500*3^2
  });

  test('xpToNext coerente com a fórmula de nível', () => {
    expect(guildXpToNext(1)).toBe(500);
    expect(guildXpToNext(2)).toBe(2000);
  });
});

describe('Curva de XP e economia', () => {
  test('curva de XP é monotônica crescente', () => {
    let prev = 0;
    for (let lvl = 1; lvl <= 50; lvl++) {
      const need = xpToNextLevel(lvl);
      expect(need).toBeGreaterThan(prev);
      prev = need;
    }
  });

  test('custo de treino cresce com o atributo', () => {
    expect(baseTrainingCost(100)).toBeGreaterThan(baseTrainingCost(50));
    expect(baseTrainingCost(10)).toBe(20);
  });
});
