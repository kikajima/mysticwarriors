import type { RaceId, RaceInfo } from '../types';

// =====================================================================
// LINHAGENS — fonte única de verdade (dados + mecânica + texto da UI)
// ---------------------------------------------------------------------
// IDs internos legados são mantidos para compatibilidade com personagens
// e snapshots existentes. A identidade pública pertence ao universo
// original de Myst Ki Warriors / Setor Caelum.
// =====================================================================

export const RACES: Record<RaceId, RaceInfo> = {
  saiyajin: {
    id: 'saiyajin',
    name: 'Solaris',
    tagline: 'A Matilha Estelar',
    description:
      'Humanoides lupinos de mundos de alta energia. Instinto, disciplina de alcateia e adaptação extrema tornam os Solaris combatentes ferozes do Setor Caelum.',
    color: 'orange',
    avatar: '/images/race-solaris.svg',
    perks: [
      '+8% de dano em ataques físicos',
      '+10% de XP em batalhas',
      'Resiliência Estelar: +1 de Força ao sobreviver a derrota contra adversário relevante',
    ],
    combat: {
      physicalDamageMult: 1.08, kiDamageMult: 1.0, defenseMult: 1.0,
      dodgeBonus: 0, speedMult: 1.0, kiAttackChanceBonus: 0, absorbOnWinPct: 0,
    },
    economy: {
      xpBattleMult: 1.1, zeniMissionMult: 1.0, zeniBattleMult: 1.0,
      missionEnergyMult: 1.0, trainCostMult: 1.0, energyRegenMult: 1.0,
      hpRegenMult: 1.0, zenkai: true,
    },
  },
  humano: {
    id: 'humano',
    name: 'Vanguardiano',
    tagline: 'Os Mortais de Ferro',
    description:
      'Povos mortais que compensam a ausência de mutações extremas com disciplina, tecnologia tática adaptativa e domínio preciso do Aether.',
    color: 'amber',
    avatar: '/images/race-vanguardiano.svg',
    perks: [
      '+7% de Defesa em combate (físico e Aether)',
      '+2% de dano em ataques de Aether',
      'Regeneração de energia 10% mais rápida',
      'Treinos com 10% de desconto em Créditos',
    ],
    combat: {
      physicalDamageMult: 1.0, kiDamageMult: 1.02, defenseMult: 1.07,
      dodgeBonus: 0, speedMult: 1.0, kiAttackChanceBonus: 0, absorbOnWinPct: 0,
    },
    economy: {
      xpBattleMult: 1.0, zeniMissionMult: 1.0, zeniBattleMult: 1.0,
      missionEnergyMult: 1.0, trainCostMult: 0.9, energyRegenMult: 1.1,
      hpRegenMult: 1.0, zenkai: false,
    },
  },
  namekuseijin: {
    id: 'namekuseijin',
    name: 'Verdant',
    tagline: 'Os Sábios de Sylva',
    description:
      'Seres de matriz vegetal e cristalina ligados à rede viva de Sylva. Seus corpos regenerativos conduzem Aether com estabilidade incomum.',
    color: 'emerald',
    avatar: '/images/race-verdant.svg',
    perks: [
      'Regeneração de vida 15% mais rápida',
      '+5% de dano em ataques de Aether',
      '+4,5% de chance de esquiva',
    ],
    combat: {
      physicalDamageMult: 1.0, kiDamageMult: 1.05, defenseMult: 1.0,
      dodgeBonus: 0.045, speedMult: 1.0, kiAttackChanceBonus: 0, absorbOnWinPct: 0,
    },
    economy: {
      xpBattleMult: 1.0, zeniMissionMult: 1.0, zeniBattleMult: 1.0,
      missionEnergyMult: 1.0, trainCostMult: 1.0, energyRegenMult: 1.0,
      hpRegenMult: 1.15, zenkai: false,
    },
  },
  androide: {
    id: 'androide',
    name: 'Sintético',
    tagline: 'Herdeiros de Nexus-9',
    description:
      'Seres artificiais e organismos aprimorados em Nexus-9. Núcleos de fluxo, chassis evasivos e módulos adaptativos sustentam combate prolongado.',
    color: 'slate',
    avatar: '/images/race-sintetico.svg',
    perks: [
      '+3,5% de velocidade total (iniciativa e esquiva)',
      'Chassi evasivo: +4,5% de chance de esquiva',
      'Reator de Aether: +6% de chance de atacar com energia',
      'Trabalhos rendem +5% de Créditos',
    ],
    combat: {
      physicalDamageMult: 1.0, kiDamageMult: 1.0, defenseMult: 1.0,
      dodgeBonus: 0.045, speedMult: 1.035, kiAttackChanceBonus: 0.06, absorbOnWinPct: 0,
    },
    economy: {
      xpBattleMult: 1.0, zeniMissionMult: 1.05, zeniBattleMult: 1.0,
      missionEnergyMult: 0.85, trainCostMult: 1.0, energyRegenMult: 1.0,
      hpRegenMult: 1.0, zenkai: false,
    },
  },
  majin: {
    id: 'majin',
    name: 'Amorph',
    tagline: 'Filhos do Caos Estelar',
    description:
      'Entidades maleáveis surgidas em fendas de nebulosas escuras. Sua biomassa de plasma se reorganiza após cada confronto e absorve energia residual.',
    color: 'rose',
    avatar: '/images/race-amorph.svg',
    perks: [
      '+2% em TODOS os atributos de combate (dano físico, Aether, defesa e velocidade)',
      'Absorve 4% do HP máximo ao vencer',
    ],
    combat: {
      physicalDamageMult: 1.02, kiDamageMult: 1.02, defenseMult: 1.02,
      dodgeBonus: 0, speedMult: 1.02, kiAttackChanceBonus: 0, absorbOnWinPct: 0.04,
    },
    economy: {
      xpBattleMult: 1.0, zeniMissionMult: 1.0, zeniBattleMult: 1.0,
      missionEnergyMult: 1.0, trainCostMult: 1.0, energyRegenMult: 1.0,
      hpRegenMult: 1.0, zenkai: false,
    },
  },
};

export const RACE_LIST = Object.values(RACES);

export function getRace(id: string): RaceInfo | undefined {
  return RACES[id as RaceId];
}
