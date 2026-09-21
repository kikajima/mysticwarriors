import { CRAFTED_ITEMS } from './crafting';
import type {
  Enemy,
  ItemsState,
  ProfessionDef,
  ProfessionLevelRewards,
  ProfessionMaterialDef,
  ProfessionShiftDef,
  ShopItem,
} from '../types';

// =====================================================================
// PROFISSÕES — CARREIRA 1–10, TURNOS FLEXÍVEIS E LOOT
// ---------------------------------------------------------------------
//  * progressão por HORAS (nível derivado; 4.450h fecham o ciclo);
//  * turnos válidos: 1h / 2h / 4h / 8h;
//  * turnos longos concedem bônus progressivo de XP e chance de material raro;
//  * Zeni, atributo, horas e material comum mantêm a regra base;
//  * atributo é sempre inteiro e não possui teto de gameplay;
//  * Acadêmico não dá atributo: fornece bônus global de XP e, na PR de
//    crafting, redução do tempo de fabricação.
// =====================================================================

export const PROFESSIONS: ProfessionDef[] = [
  {
    id: 'agricultor',
    name: 'Agricultor',
    description: 'Cultive ervas, água pura e insumos biológicos. Cada hora de carreira fortalece sua Velocidade.',
    icon: '🌾',
    attribute: 'speed',
  },
  {
    id: 'cientista',
    name: 'Cientista',
    description: 'Pesquise ligas, microchips, cápsulas e reatores. Cada hora de carreira fortalece seu Ki.',
    icon: '🔬',
    attribute: 'ki',
  },
  {
    id: 'academico',
    name: 'Acadêmico',
    description: 'Estude esquemas, pergaminhos e tomos. A carreira amplia o XP global e prepara os blueprints avançados.',
    icon: '🎓',
    attribute: null,
  },
  {
    id: 'policial',
    name: 'Policial',
    description: 'Patrulhe e produza fibras, blindagens e relatórios. Cada hora de carreira fortalece sua Defesa.',
    icon: '👮',
    attribute: 'defense',
  },
  {
    id: 'atleta',
    name: 'Atleta',
    description: 'Treine com pesos, suplementos e fluidos extremos. Cada hora de carreira fortalece sua Força.',
    icon: '🏃',
    attribute: 'strength',
  },
];

export const PROFESSION_LEVELS: ProfessionLevelRewards[] = [
  { level: 1, hoursInLevel: 40, cumulativeHours: 40, zeniPerHour: 300, attributeMilliPerHour: 1000, xpPerPlayerLevel: 4, rareChance: 0.10 },
  { level: 2, hoursInLevel: 60, cumulativeHours: 100, zeniPerHour: 450, attributeMilliPerHour: 1000, xpPerPlayerLevel: 4, rareChance: 0.10 },
  { level: 3, hoursInLevel: 90, cumulativeHours: 190, zeniPerHour: 675, attributeMilliPerHour: 2000, xpPerPlayerLevel: 6, rareChance: 0.13 },
  { level: 4, hoursInLevel: 135, cumulativeHours: 325, zeniPerHour: 1010, attributeMilliPerHour: 2000, xpPerPlayerLevel: 6, rareChance: 0.13 },
  { level: 5, hoursInLevel: 200, cumulativeHours: 525, zeniPerHour: 1500, attributeMilliPerHour: 3000, xpPerPlayerLevel: 8, rareChance: 0.16 },
  { level: 6, hoursInLevel: 300, cumulativeHours: 825, zeniPerHour: 2100, attributeMilliPerHour: 4000, xpPerPlayerLevel: 8, rareChance: 0.16 },
  { level: 7, hoursInLevel: 450, cumulativeHours: 1275, zeniPerHour: 2900, attributeMilliPerHour: 4000, xpPerPlayerLevel: 10, rareChance: 0.20 },
  { level: 8, hoursInLevel: 675, cumulativeHours: 1950, zeniPerHour: 4000, attributeMilliPerHour: 6000, xpPerPlayerLevel: 10, rareChance: 0.20 },
  { level: 9, hoursInLevel: 1000, cumulativeHours: 2950, zeniPerHour: 5500, attributeMilliPerHour: 7000, xpPerPlayerLevel: 12, rareChance: 0.22 },
  { level: 10, hoursInLevel: 1500, cumulativeHours: 4450, zeniPerHour: 7500, attributeMilliPerHour: 9000, xpPerPlayerLevel: 14, rareChance: 0.25 },
];

export const PROFESSION_MAX_LEVEL = 10;
export const PROFESSION_MASTERY_HOURS = 4_450;

export const PROFESSION_SHIFTS: ProfessionShiftDef[] = [
  { hours: 1, efficiency: 1.00 },
  { hours: 2, efficiency: 1.05 },
  { hours: 4, efficiency: 1.15 },
  { hours: 8, efficiency: 1.30 },
];
/** Busca ativa: uma tentativa temporizada e sem custo de energia. */
export const DRAGON_BALL_SEARCH_SHIFTS = [
  { hours: 1, chance: 0.04 },
  { hours: 2, chance: 0.08 },
  { hours: 4, chance: 0.12 },
  { hours: 8, chance: 0.16 },
  { hours: 12, chance: 0.20 },
] as const;
export const DRAGON_BALL_SEARCH_MAX_CHANCE = 0.50;
export const DRAGON_BALL_PVP_STEAL_CHANCE = 0.50;

export function dragonBallSearchShift(hours: number) {
  return DRAGON_BALL_SEARCH_SHIFTS.find((shift) => shift.hours === hours);
}

export const PROFESSION_MATERIAL_TIER_LEVEL = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 8,
} as const;

export function professionMaterialRequiredLevel(tier: ProfessionMaterialDef['tier']): number {
  return PROFESSION_MATERIAL_TIER_LEVEL[tier];
}

export const PROFESSION_MATERIALS: ProfessionMaterialDef[] = [
  { id: 'erva_medicinal', name: 'Erva Medicinal', professionId: 'agricultor', rarity: 'common', tier: 1, icon: '🌿' },
  { id: 'agua_purificada', name: 'Água Purificada', professionId: 'agricultor', rarity: 'common', tier: 2, icon: '💧' },
  { id: 'semente_deuses_virgem', name: 'Semente dos Deuses Virgem', professionId: 'agricultor', rarity: 'rare', tier: 3, icon: '🌱' },
  { id: 'essencia_arvore_poder', name: 'Essência da Árvore do Poder', professionId: 'agricultor', rarity: 'rare', tier: 5, icon: '🌳' },

  { id: 'liga_metais_leves', name: 'Liga de Metais Leves', professionId: 'cientista', rarity: 'common', tier: 1, icon: '🔩' },
  { id: 'microchip_controle', name: 'Microchip de Controle', professionId: 'cientista', rarity: 'common', tier: 2, icon: '💾' },
  { id: 'capsula_vazia_tipo_b', name: 'Cápsula Vazia Tipo-B', professionId: 'cientista', rarity: 'rare', tier: 3, icon: '💊' },
  { id: 'cristal_energia_ki', name: 'Cristal de Energia Ki', professionId: 'cientista', rarity: 'rare', tier: 5, icon: '💠' },

  { id: 'fibra_reforcada', name: 'Fibra Reforçada', professionId: 'policial', rarity: 'common', tier: 1, icon: '🧵' },
  { id: 'algema_carbono', name: 'Algema de Carbono', professionId: 'policial', rarity: 'common', tier: 2, icon: '⛓️' },
  { id: 'kevlar_alienigena', name: 'Kevlar Alienígena', professionId: 'policial', rarity: 'rare', tier: 3, icon: '🛡️' },
  { id: 'relatorio_ameaca_global', name: 'Relatório de Ameaça Global', professionId: 'policial', rarity: 'rare', tier: 5, icon: '📋' },

  { id: 'faixa_pressao', name: 'Faixa de Pressão', professionId: 'atleta', rarity: 'common', tier: 1, icon: '🥋' },
  { id: 'proteina_concentrada', name: 'Proteína Concentrada', professionId: 'atleta', rarity: 'common', tier: 2, icon: '🥤' },
  { id: 'pesos_gravidade_10x', name: 'Pesos de Gravidade 10x', professionId: 'atleta', rarity: 'rare', tier: 3, icon: '🏋️' },
  { id: 'fluido_recuperacao_extrema', name: 'Fluido de Recuperação Extrema', professionId: 'atleta', rarity: 'rare', tier: 5, icon: '🧪' },

  { id: 'papel_pergaminho', name: 'Papel de Pergaminho', professionId: 'academico', rarity: 'common', tier: 1, icon: '📜' },
  { id: 'tinta_arcana', name: 'Tinta Arcana', professionId: 'academico', rarity: 'common', tier: 2, icon: '🖋️' },
  { id: 'esquema_avancado_engenharia', name: 'Esquema Avançado de Engenharia', professionId: 'academico', rarity: 'rare', tier: 3, icon: '📐' },
  { id: 'fragmento_tomo_ancestral', name: 'Fragmento de Tomo Ancestral', professionId: 'academico', rarity: 'rare', tier: 5, icon: '📖' },
];

export function getProfession(id: string): ProfessionDef | undefined {
  return PROFESSIONS.find((p) => p.id === id);
}

export function getProfessionMaterial(id: string): ProfessionMaterialDef | undefined {
  return PROFESSION_MATERIALS.find((m) => m.id === id);
}

// =====================================================================
// INIMIGOS (PvE)
// =====================================================================

export const ENEMIES: Enemy[] = [
  {
    id: 'arruaceiro_ermo',
    name: 'Arruaceiro do Ermo',
    taunt: '"Você escolheu o caminho errado, forasteiro."',
    level: 1,
    strength: 8,
    defense: 7,
    speed: 9,
    ki: 6,
    zeniReward: 60,
    xpReward: 40,
    color: 'from-stone-700 to-stone-950',
    emoji: '🥊',
  },
  {
    id: 'capanga_dojo_negro',
    name: 'Capanga do Dojo Negro',
    taunt: '"O mestre não precisa sujar as mãos com você."',
    level: 3,
    strength: 11,
    defense: 10,
    speed: 12,
    ki: 9,
    zeniReward: 180,
    xpReward: 120,
    color: 'from-lime-800 to-stone-950',
    emoji: '🥋',
  },
  {
    id: 'mercenario_bioaprimorado',
    name: 'Mercenário Bioaprimorado',
    taunt: '"Meu contrato termina quando você cair."',
    level: 6,
    strength: 32,
    defense: 27,
    speed: 30,
    ki: 24,
    zeniReward: 500,
    xpReward: 340,
    color: 'from-emerald-700 to-slate-950',
    emoji: '🦾',
  },
  {
    id: 'soldado_choque_planetario',
    name: 'Soldado de Choque Planetário',
    taunt: '"Já derrubei cidades inteiras por ordens menores."',
    level: 12,
    strength: 82,
    defense: 70,
    speed: 78,
    ki: 65,
    zeniReward: 1200,
    xpReward: 850,
    color: 'from-teal-700 to-cyan-950',
    emoji: '🪖',
  },
  {
    id: 'executor_estelar',
    name: 'Executor Estelar',
    taunt: '"Seu planeta é apenas mais um ponto no meu relatório."',
    level: 20,
    strength: 180,
    defense: 158,
    speed: 170,
    ki: 152,
    zeniReward: 3000,
    xpReward: 2100,
    color: 'from-cyan-700 to-sky-950',
    emoji: '⭐',
  },
  {
    id: 'capitao_saque_galactico',
    name: 'Capitão de Saque Galáctico',
    taunt: '"Uma galáxia inteira já pagou para não me enfrentar."',
    level: 35,
    strength: 410,
    defense: 365,
    speed: 390,
    ki: 345,
    zeniReward: 8000,
    xpReward: 5500,
    color: 'from-sky-700 to-indigo-950',
    emoji: '🌌',
  },
  {
    id: 'sentinela_cosmica',
    name: 'Sentinela Cósmica',
    taunt: '"A ordem do cosmos exige sua rendição."',
    level: 50,
    strength: 960,
    defense: 860,
    speed: 910,
    ki: 830,
    zeniReward: 22000,
    xpReward: 15000,
    color: 'from-violet-700 to-purple-950',
    emoji: '🌠',
  },
  {
    id: 'acolito_celestial',
    name: 'Acólito Celestial',
    taunt: '"Mortais também podem aprender reverência pela força."',
    level: 75,
    strength: 2200,
    defense: 1980,
    speed: 2120,
    ki: 1920,
    zeniReward: 60000,
    xpReward: 42000,
    color: 'from-fuchsia-700 to-violet-950',
    emoji: '✨',
  },
  {
    id: 'arauto_ordem_superior',
    name: 'Arauto da Ordem Superior',
    taunt: '"Eu sou apenas o mensageiro. Isso deveria preocupar você."',
    level: 100,
    strength: 5200,
    defense: 4450,
    speed: 4800,
    ki: 4300,
    zeniReward: 170000,
    xpReward: 120000,
    color: 'from-amber-600 to-orange-950',
    emoji: '⚡',
  },
  {
    id: 'guardiao_vazio_transcendente',
    name: 'Guardião do Vazio Transcendente',
    taunt: '"Além daqui, até os deuses enviam servos."',
    level: 150,
    strength: 11500,
    defense: 10200,
    speed: 11000,
    ki: 9900,
    zeniReward: 500000,
    xpReward: 350000,
    color: 'from-orange-600 to-red-950',
    emoji: '👁️',
  },
];

export function getEnemy(id: string): { enemy: Enemy; index: number } | null {
  const index = ENEMIES.findIndex((e) => e.id === id);
  if (index < 0) return null;
  return { enemy: ENEMIES[index], index };
}

/**
 * Poder de scouter equivalente de um oponente PvE (v0.9.12).
 * MESMA fórmula da ficha do jogador (computeDerived), sem equipamentos
 * — fonte ÚNICA: engine (Armadura de Escala, regra 5.1) e cartas de
 * oponente na UI leem daqui, nunca de uma cópia local.
 */
export function npcCombatPower(enemy: {
  level: number;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
}): number {
  return Math.round(
    enemy.level * 15 +
      enemy.strength * 2.2 +
      enemy.ki * 2.4 * 0.9 +
      enemy.defense * 1.8 +
      (enemy.defense * 1.1 + enemy.ki * 0.9) * 0.6 +
      enemy.speed * 2
  );
}

// =====================================================================
// LOJA — armas, armaduras, acessórios, consumíveis e treino
// =====================================================================


const ENDGAME_SHOP_BANDS = [
  { id: 'galactico', name: 'Galáctico', minLevel: 30, price: 75_000, power: 80 },
  { id: 'divino', name: 'Divino', minLevel: 50, price: 220_000, power: 120 },
  { id: 'cosmico', name: 'Cósmico', minLevel: 75, price: 650_000, power: 175 },
  { id: 'eterno', name: 'Eterno', minLevel: 100, price: 1_800_000, power: 245 },
] as const;

const ENDGAME_SHOP_SLOT_CONFIGS = [
  {
    category: 'weapon',
    slotLabel: 'Arma',
    name: 'Lâmina',
    icon: '⚔️',
    stats: (p: number) => ({ atk: p, ki: Math.round(p * 0.20) }),
  },
  {
    category: 'head',
    slotLabel: 'Cabeça',
    name: 'Elmo',
    icon: '🪖',
    stats: (p: number) => ({ def: Math.round(p * 0.45), ki: Math.round(p * 0.38), spd: Math.round(p * 0.12) }),
  },
  {
    category: 'wrists',
    slotLabel: 'Punhos',
    name: 'Manoplas',
    icon: '🥊',
    stats: (p: number) => ({ atk: Math.round(p * 0.72), def: Math.round(p * 0.25), ki: Math.round(p * 0.12) }),
  },
  {
    category: 'armor',
    slotLabel: 'Torso',
    name: 'Armadura',
    icon: '🛡️',
    stats: (p: number) => ({ def: Math.round(p * 0.90), ki: Math.round(p * 0.18) }),
  },
  {
    category: 'legs',
    slotLabel: 'Pernas',
    name: 'Grevas',
    icon: '👖',
    stats: (p: number) => ({ def: Math.round(p * 0.48), spd: Math.round(p * 0.55), ki: Math.round(p * 0.10) }),
  },
  {
    category: 'boots',
    slotLabel: 'Botas',
    name: 'Botas',
    icon: '🥾',
    stats: (p: number) => ({ spd: Math.round(p * 0.85), def: Math.round(p * 0.20), ki: Math.round(p * 0.10) }),
  },
  {
    category: 'accessory',
    slotLabel: 'Acessório I ou II',
    name: 'Selo',
    icon: '💠',
    stats: (p: number) => ({
      atk: Math.round(p * 0.28),
      def: Math.round(p * 0.28),
      spd: Math.round(p * 0.28),
      ki: Math.round(p * 0.28),
    }),
  },
] as const;

function equipmentBonusDescription(stats: { atk?: number; def?: number; spd?: number; ki?: number }): string {
  return [
    stats.atk ? `+${stats.atk} ATQ` : '',
    stats.def ? `+${stats.def} DEF` : '',
    stats.spd ? `+${stats.spd} VEL` : '',
    stats.ki ? `+${stats.ki} KI` : '',
  ].filter(Boolean).join(', ');
}

/**
 * Progressão comercial de longo prazo. Os degraus 30/50/75/100 evitam
 * que a Loja "acabe" no nível 20, mas cada equivalente da Oficina segue
 * deliberadamente mais forte no mesmo patamar.
 */
export const ENDGAME_SHOP_ITEMS: ShopItem[] = ENDGAME_SHOP_BANDS.flatMap((band) =>
  ENDGAME_SHOP_SLOT_CONFIGS.map((slot) => {
    const stats = slot.stats(band.power);
    return {
      id: `loja_${band.id}_${slot.category}`,
      name: `${slot.name} ${band.name}`,
      description: `Slot: ${slot.slotLabel}. Equipamento comercial de longo prazo (Nv. ${band.minLevel}+). Bônus: ${equipmentBonusDescription(stats)}. A Oficina oferece uma versão superior neste patamar.`,
      category: slot.category,
      price: band.price,
      minLevel: band.minLevel,
      icon: slot.icon,
      ...stats,
    } satisfies ShopItem;
  })
);

export const SHOP_ITEMS: ShopItem[] = [
  // ===== EQUIPAMENTOS DA LOJA =====
  // A Oficina continua sendo a progressão de equipamento mais forte.
  // A loja oferece uma escada útil e acessível, mas não o melhor item final.

  // Armas
  { id: 'bastao_treino', name: 'Bastão de Treino', description: 'Slot: Arma. Bastão simples para quem está começando. Bônus: +4 ATQ.', category: 'weapon', price: 180, minLevel: 1, atk: 4, icon: '🦯' },
  { id: 'bastao', name: 'Bastão Sagrado', description: 'Slot: Arma. Alcance e equilíbrio para combate corpo a corpo. Bônus: +9 ATQ.', category: 'weapon', price: 900, minLevel: 3, atk: 9, icon: '🦯' },
  { id: 'katana', name: 'Katana do Gohan', description: 'Slot: Arma. Lâmina leve que favorece golpes rápidos. Bônus: +18 ATQ e +2 VEL.', category: 'weapon', price: 2600, minLevel: 6, atk: 18, spd: 2, icon: '🗡️' },
  { id: 'espada_z', name: 'Espada Z', description: 'Slot: Arma. Espada sagrada com boa condução de energia. Bônus: +30 ATQ e +4 KI.', category: 'weapon', price: 7000, minLevel: 10, atk: 30, ki: 4, icon: '⚔️' },
  { id: 'lamina_capsula', name: 'Lâmina de Liga Capsule', description: 'Slot: Arma. Liga tecnológica leve e estável. Bônus: +45 ATQ e +5 VEL.', category: 'weapon', price: 16000, minLevel: 15, atk: 45, spd: 5, icon: '🗡️' },
  { id: 'energia_infinita', name: 'Lâmina do Ki Puro', description: 'Slot: Arma. Melhor arma comercial da loja, ainda abaixo das criações de alto Tier da Oficina. Bônus: +65 ATQ e +10 KI.', category: 'weapon', price: 36000, minLevel: 22, atk: 65, ki: 10, icon: '⚔️' },

  // Cabeça
  { id: 'bandana', name: 'Bandana do Guerreiro', description: 'Slot: Cabeça. Proteção leve que ajuda a manter o foco. Bônus: +2 DEF e +3 KI.', category: 'head', price: 550, minLevel: 2, def: 2, ki: 3, icon: '🎗️' },
  { id: 'scouter_basico', name: 'Scouter Básico', description: 'Slot: Cabeça. Visor comercial para leitura de energia e reação. Bônus: +5 KI e +2 VEL.', category: 'head', price: 1800, minLevel: 5, ki: 5, spd: 2, icon: '🥽' },
  { id: 'capacete_saiyajin_loja', name: 'Capacete Saiyajin', description: 'Slot: Cabeça. Proteção militar alienígena de linha comercial. Bônus: +8 DEF e +4 KI.', category: 'head', price: 5200, minLevel: 10, def: 8, ki: 4, icon: '🪖' },
  { id: 'coroa_kaio', name: 'Coroa de Treino do Kaio', description: 'Slot: Cabeça. Foco e proteção para guerreiros experientes. Bônus: +12 DEF, +8 KI e +3 VEL.', category: 'head', price: 14500, minLevel: 16, def: 12, ki: 8, spd: 3, icon: '👑' },

  // Punhos
  { id: 'luvas', name: 'Luvas de Treino', description: 'Slot: Punhos. Luvas acolchoadas para impacto físico. Bônus: +4 ATQ.', category: 'wrists', price: 300, minLevel: 1, atk: 4, icon: '🥊' },
  { id: 'braceletes_tartaruga', name: 'Braceletes da Tartaruga', description: 'Slot: Punhos. Braceletes firmes para ataque e guarda. Bônus: +8 ATQ e +2 DEF.', category: 'wrists', price: 1100, minLevel: 4, atk: 8, def: 2, icon: '🧤' },
  { id: 'manoplas_capsula', name: 'Manoplas Capsule', description: 'Slot: Punhos. Placas leves de impacto da Corporação Cápsula. Bônus: +14 ATQ e +4 DEF.', category: 'wrists', price: 3600, minLevel: 8, atk: 14, def: 4, icon: '🧤' },
  { id: 'punho_dragao', name: 'Manoplas do Dragão', description: 'Slot: Punhos. Manoplas comerciais de alta potência inspiradas no Golpe do Dragão. Bônus: +24 ATQ e +5 KI.', category: 'wrists', price: 12000, minLevel: 15, atk: 24, ki: 5, icon: '🥊' },

  // Torso
  { id: 'gi', name: 'Gi de Batalha Laranja', description: 'Slot: Torso. Uniforme leve da Escola da Tartaruga. Bônus: +4 DEF.', category: 'armor', price: 250, minLevel: 1, def: 4, icon: '🥋' },
  { id: 'armadura_saiyajin', name: 'Armadura Saiyajin', description: 'Slot: Torso. Armadura flexível de combate. Bônus: +10 DEF.', category: 'armor', price: 800, minLevel: 3, def: 10, icon: '🛡️' },
  { id: 'armadura_freeza', name: 'Armadura de Elite Freeza', description: 'Slot: Torso. Blindagem militar reforçada. Bônus: +18 DEF.', category: 'armor', price: 2400, minLevel: 6, def: 18, icon: '🦺' },
  { id: 'traje_ponderado', name: 'Traje Ponderado', description: 'Slot: Torso. Proteção pesada sem eliminar a mobilidade. Bônus: +28 DEF e +3 VEL.', category: 'armor', price: 6500, minLevel: 10, def: 28, spd: 3, icon: '🥋' },
  { id: 'armadura_kaio', name: 'Armadura do Grande Kaio', description: 'Slot: Torso. Proteção divina comercial de alto nível. Bônus: +42 DEF e +5 KI.', category: 'armor', price: 15000, minLevel: 15, def: 42, ki: 5, icon: '🛡️' },
  { id: 'manto_kaioshin', name: 'Manto do Kaioshin', description: 'Slot: Torso. Melhor proteção vendida pronta na loja. Bônus: +60 DEF e +8 KI.', category: 'armor', price: 34000, minLevel: 22, def: 60, ki: 8, icon: '🦺' },

  // Pernas
  { id: 'calca_gi_loja', name: 'Calça de Gi', description: 'Slot: Pernas. Tecido leve para treino e combate. Bônus: +4 DEF e +2 VEL.', category: 'legs', price: 350, minLevel: 1, def: 4, spd: 2, icon: '👖' },
  { id: 'calca_ponderada_loja', name: 'Calça Ponderada', description: 'Slot: Pernas. Pesos distribuídos para resistência sem travar o movimento. Bônus: +9 DEF e +4 VEL.', category: 'legs', price: 1300, minLevel: 4, def: 9, spd: 4, icon: '👖' },
  { id: 'grevas_capsula_loja', name: 'Grevas Capsule', description: 'Slot: Pernas. Proteção tecnológica para joelhos e canelas. Bônus: +16 DEF e +7 VEL.', category: 'legs', price: 4200, minLevel: 9, def: 16, spd: 7, icon: '🦿' },
  { id: 'calca_kaio_loja', name: 'Calça de Combate do Kaio', description: 'Slot: Pernas. Equipamento avançado de mobilidade e defesa. Bônus: +24 DEF, +10 VEL e +4 KI.', category: 'legs', price: 13500, minLevel: 16, def: 24, spd: 10, ki: 4, icon: '👖' },

  // Botas
  { id: 'botas', name: 'Botas Ponderadas', description: 'Slot: Botas. Pesos discretos que fortalecem arrancadas. Bônus: +5 VEL e +1 DEF.', category: 'boots', price: 400, minLevel: 1, spd: 5, def: 1, icon: '🥾' },
  { id: 'botas_voo_capsula', name: 'Botas de Voo Capsule', description: 'Slot: Botas. Estabilizadores para aceleração aérea. Bônus: +12 VEL e +2 DEF.', category: 'boots', price: 1700, minLevel: 5, spd: 12, def: 2, icon: '👢' },
  { id: 'botas_impulso_loja', name: 'Botas de Impulso de Ki', description: 'Slot: Botas. Canalizam energia em deslocamentos curtos. Bônus: +18 VEL e +4 KI.', category: 'boots', price: 5600, minLevel: 10, spd: 18, ki: 4, icon: '👢' },
  { id: 'botas_kaio_loja', name: 'Botas do Grande Kaio', description: 'Slot: Botas. Melhor calçado comercial para combate de alta velocidade. Bônus: +26 VEL e +6 DEF.', category: 'boots', price: 14500, minLevel: 16, spd: 26, def: 6, icon: '🥾' },

  // Acessórios — dois podem ser equipados simultaneamente
  { id: 'medalhao_kame', name: 'Medalhão da Tartaruga', description: 'Slot: Acessório I ou II. Medalhão equilibrado para iniciantes. Bônus: +3 ATQ e +3 DEF.', category: 'accessory', price: 900, minLevel: 2, atk: 3, def: 3, icon: '📿' },
  { id: 'cristal_baba', name: 'Cristal de Uma Estrela', description: 'Slot: Acessório I ou II. Amuleto que amplifica o fluxo de Ki. Bônus: +8 KI.', category: 'accessory', price: 2400, minLevel: 6, ki: 8, icon: '🔮' },
  { id: 'potara', name: 'Brinco Potara', description: 'Slot: Acessório I ou II. Relíquia divina focada em Ki e reação. Bônus: +14 KI e +6 VEL.', category: 'accessory', price: 8000, minLevel: 12, ki: 14, spd: 6, icon: '💍' },
  { id: 'coracao_dourado', name: 'Coração do Dragão Eterno', description: 'Slot: Acessório I ou II. Melhor acessório de combate vendido pronto. Bônus: +10 ATQ, +10 DEF, +10 KI e +10 VEL.', category: 'accessory', price: 26000, minLevel: 20, atk: 10, def: 10, ki: 10, spd: 10, icon: '💎' },
  { id: 'radar_esferas', name: 'Radar das Esferas', description: 'Slot: Acessório I ou II. Aumenta a chance da Busca pelas Esferas em +30 pontos percentuais, respeitando o teto mundial de 50%.', category: 'accessory', price: 500, currency: 'crystal', minLevel: 1, dragonBallSearchChanceBonus: 0.30, icon: '📡' },

  // Endgame comercial — quatro novos degraus por slot (Nv. 30/50/75/100).
  ...ENDGAME_SHOP_ITEMS,
  // Consumíveis (v0.9.2 — custam DIAMANTES; ficam no inventário e são
  // usados sob demanda. Conveniência premium: energia/vida instantâneas
  // e atributos extras numa economia onde energia é escassa.)
  { id: 'capsula_ki', name: 'Cápsula de Energia', description: 'Reabastece instantaneamente toda a sua energia de batalha.', category: 'consumable', price: 6, currency: 'crystal', minLevel: 1, effect: 'full_energy', icon: '🔋' },
  { id: 'senzu', name: 'Feijão Senzu', description: 'Um único grão recupera 100% da vida. Cultivado na Torre de Karin.', category: 'consumable', price: 10, currency: 'crystal', minLevel: 1, effect: 'full_hp', icon: '🫘' },
  { id: 'elixir_dragao', name: 'Elixir do Dragão', description: 'Poção mágica que desperta seu potencial oculto: +2 em TODOS os atributos (respeita o limite máximo).', category: 'consumable', price: 75, currency: 'crystal', minLevel: 5, effect: 'stat_boost', icon: '⚗️' },
  // Equipamentos de treino (v0.9.2 — custam DIAMANTES; bônus permanente
  // por treino. Progressão de longo prazo paga com a moeda premium do jogo,
  // que se ganha jogando: missões diárias, conquistas e Ameaça Universal.)
  { id: 'bandana_treino', name: 'Bandana de Treino', description: 'Enrole na testa, grite bem alto e sinta a força de mil treinos.', category: 'training', price: 15, currency: 'crystal', minLevel: 1, trainBonus: { strength: 1 }, icon: '🎗️' },
  { id: 'pulseiras_chumbo', name: 'Pulseiras de Chumbo', description: 'Peso clássico de quem leva a sério. Ajudam a suportar qualquer golpe.', category: 'training', price: 20, currency: 'crystal', minLevel: 2, trainBonus: { defense: 1 }, icon: '⛓️' },
  { id: 'tenes_ponderados', name: 'Tênis Ponderados', description: 'Corra com esses pesos nos pés e o mundo parecerá lento depois.', category: 'training', price: 20, currency: 'crystal', minLevel: 2, trainBonus: { speed: 1 }, icon: '👟' },
  { id: 'rosario_mental', name: 'Rosário do Treino Mental', description: 'Foque a mente, sinta o Ki fluir. Meditar também é treinar.', category: 'training', price: 20, currency: 'crystal', minLevel: 2, trainBonus: { ki: 1 }, icon: '📿' },
  { id: 'gi_ponderado', name: 'Gi Ponderado do Mestre Kame', description: 'A casca de tartaruga nas costas: o treino que forjou lendas.', category: 'training', price: 60, currency: 'crystal', minLevel: 6, trainBonus: { all: 1 }, icon: '🐢' },
  { id: 'sala_gravidade', name: 'Sala de Gravidade (Cápsula)', description: 'Gravidade 100x da Terra dentro de uma cápsula da Corporação Cápsula.', category: 'training', price: 180, currency: 'crystal', minLevel: 12, trainBonus: { all: 2 }, icon: '🛸' },
  { id: 'sala_tempo_capsula', name: 'Sala do Tempo Pessoal (Cápsula)', description: 'Um dia aqui, um ano lá dentro. O investimento definitivo do guerreiro.', category: 'training', price: 450, currency: 'crystal', minLevel: 18, trainBonus: { all: 3 }, icon: '⏳' },
];

export function getItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id) ?? CRAFTED_ITEMS.find((i) => i.id === id);
}

/**
 * Custo de energia de um trabalho de profissão para uma raça (mesma
 * fórmula do servidor — usada pela UI para exibir o valor real cobrado).
 */
export function professionEnergyCostOf(baseEnergyCost: number, race: string): number {
  // espelha raceEconomy().missionEnergyMult sem importar server-only
  const mults: Record<string, number> = { androide: 0.85 };
  const mult = mults[race] ?? 1;
  return Math.max(1, Math.round(baseEnergyCost * mult));
}

/** Bônus de pontos extras por treino, somando os equipamentos de treino possuídos. */
export function trainingGain(owned: string[], stat: 'strength' | 'defense' | 'speed' | 'ki'): number {
  let bonus = 0;
  for (const id of owned) {
    const item = getItem(id);
    if (!item?.trainBonus) continue;
    bonus += item.trainBonus.all ?? 0;
    bonus += item.trainBonus[stat] ?? 0;
  }
  return 1 + bonus;
}

// =====================================================================
// Configurações gerais
// =====================================================================

export const MAX_CHARACTERS_PER_ACCOUNT = 3;
export const GUILD_CREATION_COST = 5000;

/** Regeneração base (segundos por ponto) — multiplicadores raciais aplicados pela engine.
 * v0.6: energia recarrega em ~5 MINUTOS por ponto (era 5s) — decisão do
 * usuário para dar valor real a cada ponto gasto. */
export const REGEN = {
  energySeconds: 300,
  hpSeconds: 12,
} as const;

/** v0.9.10 (Mudança 2B): preço de venda de item = fração do preço de
 *  compra, devolvida NA MESMA MOEDA da compra (zeni→zeni, 💎→💎 — nunca
 *  converte moeda). Fração única, aplicada por unidade. */
export const SELL_PRICE_RATIO = 0.5;

/** Máximo de unidades por transação de compra OU venda (loja). */
export const SHOP_MAX_QUANTITY = 99;

/** Teto de unidades empilhadas por item (equipamento, treino, consumível). */
export const SHOP_MAX_STACK = 999;


/** Custo de energia por treino (fixo). */
export const TRAIN_ENERGY_COST = 3;

/** Custo de energia por batalha PvE ou PvP (v0.6 — batalhas agora gastam energia). */
export const BATTLE_ENERGY_COST = 3;

/** LEGADO — não usado, ver wiki-audit v0.9.23: profissões NÃO gastam mais
 * energia desde a v0.9 (actionStartProfession não cobra). Mantido apenas
 * porque ProfessionDef.energyCost e re-exports antigos o referenciam;
 * o teste de contrato da wiki garante que a wiki NUNCA o publique. */
export const PROFESSION_ENERGY_COST = 6;

/** Curva de XP por nível. */
export function xpToNextLevel(level: number): number {
  return Math.floor(80 * Math.pow(level, 1.55));
}

/**
 * Teto absoluto do custo de treino — cabe com folga no Int32 usado por
 * Zeni/balanceBefore/balanceAfter no banco e no código. Nenhuma operação
 * de treino pode produzir um valor fora do range seguro.
 */
export const TRAINING_COST_CEILING = 50_000_000;

/**
 * CURVA DE CUSTO DE TREINO v0.4 (Ian Schreiber — cost curves):
 *  * fase 1 (atributo ≤ 150): exponencial 1,05× — progressão clássica,
 *    cada ponto custa ~5% mais que o anterior;
 *  * fase 2 (> 150): 1,035× — endgame mais suave (a curva antiga de
 *    1,065× explodia: 5.787 no atributo 100, 134.888 no 150 e
 *    3.143.804 no 200, tornando o Elixir de 5.000 Zeni infinitamente
 *    melhor que treinar);
 *  * teto absoluto em 50 milhões — segurança de tipo.
 *
 * Referência (custo por ponto):
 *   10→20 · 50→141 · 100→1.580 · 150→18.544 · 200→99.163 ·
 *   300→3,46M · 400+→50M (teto)
 */
export function baseTrainingCost(statValue: number): number {
  const s = Math.max(1, statValue);
  const cost =
    s <= 150
      ? 20 * Math.pow(1.05, s - 10)
      : 20 * Math.pow(1.05, 140) * Math.pow(1.035, s - 150);
  return Math.min(TRAINING_COST_CEILING, Math.floor(cost));
}

/**
 * PREÇO DINÂMICO DO ELIXIR DO DRAGÃO (+2 em todos os atributos).
 *
 * Papel próprio (v0.4): CONVENIÊNCIA PREMIUM — instantâneo, sem custo de
 * energia e sem clicar 8 treinos, por ~1,6× o custo equivalente de
 * treino. Nunca domina o treino (antes custava 5.000 fixo e era
 * disparadamente melhor a partir do atributo ~65).
 *
 * O preço acompanha a progressão: base mínima 4.000 Zeni no início.
 */
export function elixirPrice(stats: { strength: number; defense: number; speed: number; ki: number }): number {
  const trainingEquivalent = (['strength', 'defense', 'speed', 'ki'] as const).reduce(
    (sum, key) => sum + baseTrainingCost(stats[key]) + baseTrainingCost(stats[key] + 1),
    0
  );
  return Math.max(4000, Math.round(trainingEquivalent * 1.6));
}
