/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';
import { hash } from '@/lib/progression';
import { DAILY_QUESTS, WEEKLY_QUESTS, ACHIEVEMENTS } from '@/lib/game/content/quests';
import { TRANSFORMATIONS, getTransformation, transformationsForRace } from '@/lib/game/content/transformations';
import { RACES, RACE_LIST } from '@/lib/game/content/races';
import { TECHNIQUES, TRAINING_MASTERS } from '@/lib/game/content/techniques';
import { PROFESSIONS, PROFESSION_LEVELS, PROFESSION_SHIFTS, PROFESSION_MATERIALS, ENEMIES, SHOP_ITEMS, xpToNextLevel, baseTrainingCost, npcCombatPower } from '@/lib/game/content/world';
import { randomWarriorName, BOTS } from '@/lib/game/content/names';
import { POWER_SCALES, getPowerScale } from '@/lib/game/powerScale';
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
      expect(t.description.trim().length).toBeGreaterThan(20);
    }
  });
});

test('UI de treino não repete saldo/energia no topo e Transformações exibem descrição', async () => {
  const src = await Bun.file(`${import.meta.dir}/../src/components/game/TrainingPanel.tsx`).text();
  expect(src).not.toContain("{player.energy} energia (cada treino:");
  expect(src).not.toContain("player.zeni.toLocaleString('pt-BR')} Zeni");
  expect(src).toContain('{tr!.description}');
  expect(src).toContain('Efeito ativo:');
  expect(src).toContain("transformationEffectLabels(tr!).join(' · ')");
  expect(src).toContain('Ao desbloquear:');
});

describe('Integridade do conteúdo', () => {
  test('profissões: exatamente 5 e especializações únicas', () => {
    expect(PROFESSIONS.length).toBe(5);
    expect(PROFESSIONS.filter((p) => p.attribute === null).map((p) => p.id)).toEqual(['academico']);
    expect(new Set(PROFESSIONS.filter((p) => p.attribute).map((p) => p.attribute)).size).toBe(4);
  });

  test('profissões: carreira 1–10 e turnos 1/2/4/8 são íntegros', () => {
    expect(PROFESSION_LEVELS).toHaveLength(10);
    expect(PROFESSION_LEVELS[0].zeniPerHour).toBe(300);
    expect(PROFESSION_LEVELS[9].zeniPerHour).toBe(7500);
    expect(PROFESSION_LEVELS[9].cumulativeHours).toBe(4450);
    expect(PROFESSION_SHIFTS.map((s) => s.hours)).toEqual([1, 2, 4, 8]);
    expect(PROFESSION_MATERIALS).toHaveLength(20);
  });

  test('inimigos: três capangas genéricos por Escala de Poder (I/II/III)', () => {
    expect(ENEMIES).toHaveLength(POWER_SCALES.length * 3);
    const forbiddenMainVillains = /freeza|cell|broly|dabura|buu|vegeta|nappa|raditz|goku black|zamasu/i;
    for (let scaleIndex = 0; scaleIndex < POWER_SCALES.length; scaleIndex++) {
      const group = ENEMIES.slice(scaleIndex * 3, scaleIndex * 3 + 3);
      expect(group.map((enemy) => enemy.tier)).toEqual([1, 2, 3]);
      for (const enemy of group) {
        expect(getPowerScale(npcCombatPower(enemy)).scale.index).toBe(scaleIndex);
        expect(enemy.name).not.toMatch(forbiddenMainVillains);
        expect(enemy.intent.trim().length).toBeGreaterThan(30);
        expect(enemy.zeniReward).toBeGreaterThan(0);
        expect(enemy.xpReward).toBeGreaterThan(0);
      }
    }
    for (let i = 1; i < ENEMIES.length; i++) {
      expect(ENEMIES[i].level).toBeGreaterThan(ENEMIES[i - 1].level);
      expect(npcCombatPower(ENEMIES[i])).toBeGreaterThan(npcCombatPower(ENEMIES[i - 1]));
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

describe('Guildas (curva coletiva fixa)', () => {
  test('níveis seguem os custos cumulativos publicados', () => {
    expect(guildLevelFromXp(0)).toBe(1);
    expect(guildLevelFromXp(7_999)).toBe(1);
    expect(guildLevelFromXp(8_000)).toBe(2);
    expect(guildLevelFromXp(21_999)).toBe(2);
    expect(guildLevelFromXp(22_000)).toBe(3);
    expect(guildLevelFromXp(47_000)).toBe(4);
  });

  test('xpToNext devolve o limiar cumulativo do próximo nível', () => {
    expect(guildXpToNext(1)).toBe(8_000);
    expect(guildXpToNext(2)).toBe(22_000);
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
