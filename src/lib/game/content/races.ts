import type { RaceId, RaceInfo } from '../types';

// =====================================================================
// RAÇAS — fonte única de verdade (dados + mecânica + texto da UI)
// ---------------------------------------------------------------------
// Os "perks" exibidos refletem EXATAMENTE os números aplicados pela
// engine. Alterou aqui, alterou em todo o jogo (combate, economia, UI).
//
// BALANCEAMENTO v0.4 (calibrado por simulação — ver scripts/sim-balance.ts):
//  * motor novo: mitigação com SOFT CAP (defesa nunca zera um golpe),
//    técnica multiplica o poder bruto, Ki gasto no lançamento;
//  * a defesa deixou de ser superdimensionada: mults de defesa/ataque
//    ficaram próximos em valor de vitória (na v0.3, +10% def ≈ 67% de
//    vitória média, +10% atk físico ≈ 46%);
//  * velocidade vale mais (esquiva 0,005/ponto + iniciativa);
//  * cada raça mantém IDENTIDADE (arquétipo + economia própria), com
//    média alvo de 45–55% por faixa de progressão comparável;
//  * bônus aplicados SIMETRICAMENTE (atacando ou defendendo).
// =====================================================================

export const RACES: Record<RaceId, RaceInfo> = {
  saiyajin: {
    id: 'saiyajin',
    name: 'Saiyajin',
    tagline: 'Guerreiros natos com sede de batalha',
    description:
      'Uma raça de guerreiros orgulhosos e implacáveis. Quanto mais próximos da morte, mais fortes ficam — o lendário Zenkai corre nas suas veias.',
    color: 'orange',
    avatar: '/images/race-saiyajin.png',
    perks: [
      '+8% de dano em ataques físicos',
      '+10% de XP em batalhas',
      'Zenkai: +1 de Força ao perder batalha contra adversário relevante',
    ],
    combat: {
      physicalDamageMult: 1.08,
      kiDamageMult: 1.0,
      defenseMult: 1.0,
      dodgeBonus: 0,
      speedMult: 1.0,
      kiAttackChanceBonus: 0,
      absorbOnWinPct: 0,
    },
    economy: {
      xpBattleMult: 1.1,
      zeniMissionMult: 1.0,
      zeniBattleMult: 1.0,
      missionEnergyMult: 1.0,
      trainCostMult: 1.0,
      energyRegenMult: 1.0,
      hpRegenMult: 1.0,
      zenkai: true,
    },
  },
  humano: {
    id: 'humano',
    name: 'Humano',
    tagline: 'Determinação que supera limites',
    description:
      'Sem poderes natos, os humanos compensam com trabalho duro e engenhosidade. Aguentam o castigo, recuperam fôlego rápido e treinam de forma mais eficiente.',
    color: 'amber',
    avatar: '/images/race-humano.png',
    perks: [
      '+7% de Defesa em combate (físico e energia)',
      '+2% de dano em ataques de Ki',
      'Regeneração de energia 10% mais rápida',
      'Treinos com 10% de desconto em Zeni',
    ],
    combat: {
      physicalDamageMult: 1.0,
      kiDamageMult: 1.02,
      defenseMult: 1.07,
      dodgeBonus: 0,
      speedMult: 1.0,
      kiAttackChanceBonus: 0,
      absorbOnWinPct: 0,
    },
    economy: {
      xpBattleMult: 1.0,
      zeniMissionMult: 1.0,
      zeniBattleMult: 1.0,
      missionEnergyMult: 1.0,
      trainCostMult: 0.9,
      energyRegenMult: 1.1,
      hpRegenMult: 1.0,
      zenkai: false,
    },
  },
  namekuseijin: {
    id: 'namekuseijin',
    name: 'Namekuseijin',
    tagline: 'Sábios dragões de Namekusei',
    description:
      'Guerreiros-verdes com capacidade sobre-humana de regeneração. Seu Ki sereno castiga quem tenta vencê-los no longo prazo.',
    color: 'emerald',
    avatar: '/images/race-namekuseijin.png',
    perks: [
      'Regeneração de vida 15% mais rápida',
      '+5% de dano em ataques de Ki',
      '+4,5% de chance de esquiva',
    ],
    combat: {
      physicalDamageMult: 1.0,
      kiDamageMult: 1.05,
      defenseMult: 1.0,
      dodgeBonus: 0.045,
      speedMult: 1.0,
      kiAttackChanceBonus: 0,
      absorbOnWinPct: 0,
    },
    economy: {
      xpBattleMult: 1.0,
      zeniMissionMult: 1.0,
      zeniBattleMult: 1.0,
      missionEnergyMult: 1.0,
      trainCostMult: 1.0,
      energyRegenMult: 1.0,
      hpRegenMult: 1.15,
      zenkai: false,
    },
  },
  androide: {
    id: 'androide',
    name: 'Androide',
    tagline: 'Máquinas de destruição perfeitas',
    description:
      'Criados para lutar, os androides não sentem fadiga. Seus reatores internos disparam rajadas de energia sem descanso e lhes dão vantagem em longas jornadas.',
    color: 'slate',
    avatar: '/images/race-androide.png',
    perks: [
      '+3,5% de velocidade total (iniciativa e esquiva)',
      'Chassi evasivo: +4,5% de chance de esquiva',
      'Reator de energia: +6% de chance de atacar com Ki',
      'Trabalhos rendem +5% de Zeni', // LEGADO — não usa, ver wiki-audit v0.9.23: profissões não gastam energia desde a v0.9 (o antigo "custam 15% menos energia" foi removido da exibição)
    ],
    combat: {
      physicalDamageMult: 1.0,
      kiDamageMult: 1.0,
      defenseMult: 1.0,
      dodgeBonus: 0.045,
      speedMult: 1.035,
      kiAttackChanceBonus: 0.06,
      absorbOnWinPct: 0,
    },
    economy: {
      xpBattleMult: 1.0,
      zeniMissionMult: 1.05,
      zeniBattleMult: 1.0,
      missionEnergyMult: 0.85,
      trainCostMult: 1.0,
      energyRegenMult: 1.0,
      hpRegenMult: 1.0,
      zenkai: false,
    },
  },
  majin: {
    id: 'majin',
    name: 'Majin',
    tagline: 'Magia antiga e caos puro',
    description:
      'Seres mágicos milenares movidos por caos e diversão. Sem excelência em nada, bons em TUDO — vire doce ou morra.',
    color: 'rose',
    avatar: '/images/race-majin.png',
    perks: [
      '+2% em TODOS os atributos de combate (dano físico, Ki, defesa e velocidade)',
      'Absorve 4% do HP máximo ao vencer',
    ],
    combat: {
      physicalDamageMult: 1.02,
      kiDamageMult: 1.02,
      defenseMult: 1.02,
      dodgeBonus: 0,
      speedMult: 1.02,
      kiAttackChanceBonus: 0,
      absorbOnWinPct: 0.04,
    },
    economy: {
      xpBattleMult: 1.0,
      zeniMissionMult: 1.0,
      zeniBattleMult: 1.0,
      missionEnergyMult: 1.0,
      trainCostMult: 1.0,
      energyRegenMult: 1.0,
      hpRegenMult: 1.0,
      zenkai: false,
    },
  },
};

export const RACE_LIST = Object.values(RACES);

export function getRace(id: string): RaceInfo | undefined {
  return RACES[id as RaceId];
}
