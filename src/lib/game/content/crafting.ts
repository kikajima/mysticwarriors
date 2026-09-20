import type { CraftRecipeDef, CraftStackItemDef, ShopItem } from '../types';

// =====================================================================
// OFICINA — CATÁLOGO DE CRAFTING
// ---------------------------------------------------------------------
// Receitas são 100% server-authoritative. O cliente usa este catálogo
// apenas para exibição; custo, ingredientes e duração são revalidados no
// servidor em src/lib/game/crafting.ts.
//
// Regra estrutural:
// * todo craft Tier 3+ usa insumos de 2+ profissões;
// * todo item principal Tier 3+ exige blueprint Acadêmico;
// * blueprints são produzidos na Oficina e exigem experiência Acadêmica.
// =====================================================================

export const CRAFT_TIER_PROFESSION_LEVEL = {
  1: 0,
  2: 2,
  3: 4,
  4: 6,
  5: 8,
} as const;

export const CRAFT_STACK_ITEMS: CraftStackItemDef[] = [
  {
    id: 'esquema_deteccao_ki',
    name: 'Esquema de Detecção Ki',
    description: 'Projeto acadêmico para circuitos capazes de rastrear assinaturas de Ki.',
    tier: 2,
    icon: '📡',
    kind: 'blueprint',
  },
  {
    id: 'planta_blindagem_flexivel',
    name: 'Planta de Blindagem Flexível',
    description: 'Projeto de placas articuladas para armaduras de combate.',
    tier: 3,
    icon: '📐',
    kind: 'blueprint',
  },
  {
    id: 'formula_estabilizacao_organica',
    name: 'Fórmula de Estabilização Orgânica',
    description: 'Fórmula para estabilizar nutrientes e recuperação celular extrema.',
    tier: 4,
    icon: '🧬',
    kind: 'blueprint',
  },
  {
    id: 'esquema_canalizacao_ki',
    name: 'Esquema de Canalização de Ki',
    description: 'Projeto acadêmico para distribuir Ki de forma estável por equipamentos de combate.',
    tier: 4,
    icon: '🔷',
    kind: 'blueprint',
  },
  {
    id: 'esquema_gravidade_alterada',
    name: 'Esquema de Gravidade Alterada',
    description: 'Projeto avançado de campo gravitacional compacto.',
    tier: 5,
    icon: '🌀',
    kind: 'blueprint',
  },
];


const SLOT_CRAFTED_ITEMS: ShopItem[] = [
  // Armas — a Oficina supera os equivalentes comerciais em cada faixa.
  { id: 'bastao_liga_leve', name: 'Bastão de Liga Leve', description: 'Slot: Arma. Fabricação Tier 1. Bônus: +7 ATQ.', category: 'weapon', price: 0, minLevel: 1, atk: 7, icon: '🦯' },
  { id: 'lamina_carbono', name: 'Lâmina de Carbono', description: 'Slot: Arma. Fabricação Tier 2. Bônus: +18 ATQ e +3 VEL.', category: 'weapon', price: 0, minLevel: 1, atk: 18, spd: 3, icon: '🗡️' },
  { id: 'lanca_saiyajin', name: 'Lança Saiyajin', description: 'Slot: Arma. Fabricação Tier 3. Bônus: +36 ATQ e +8 KI.', category: 'weapon', price: 0, minLevel: 1, atk: 36, ki: 8, icon: '🔱' },
  { id: 'lamina_ki_condensado', name: 'Lâmina de Ki Condensado', description: 'Slot: Arma. Fabricação Tier 4. Bônus: +55 ATQ e +14 KI.', category: 'weapon', price: 0, minLevel: 1, atk: 55, ki: 14, icon: '⚔️' },
  { id: 'espada_gravidade_100x', name: 'Espada de Gravidade 100x', description: 'Slot: Arma. Fabricação Tier 5, superior às armas da loja. Bônus: +85 ATQ e +24 KI.', category: 'weapon', price: 0, minLevel: 1, atk: 85, ki: 24, icon: '⚔️' },

  // Torso
  { id: 'colete_fibra_reforcada', name: 'Colete de Fibra Reforçada', description: 'Slot: Torso. Fabricação Tier 1. Bônus: +8 DEF.', category: 'armor', price: 0, minLevel: 1, def: 8, icon: '🥋' },
  { id: 'colete_carbono_tatico', name: 'Colete de Carbono Tático', description: 'Slot: Torso. Fabricação Tier 2. Bônus: +18 DEF e +3 VEL.', category: 'armor', price: 0, minLevel: 1, def: 18, spd: 3, icon: '🦺' },
  { id: 'armadura_fluxo_ki', name: 'Armadura de Fluxo de Ki', description: 'Slot: Torso. Fabricação Tier 4. Bônus: +55 DEF e +14 KI.', category: 'armor', price: 0, minLevel: 1, def: 55, ki: 14, icon: '🛡️' },
  { id: 'armadura_gravidade_100x', name: 'Armadura de Gravidade 100x', description: 'Slot: Torso. Fabricação Tier 5, superior às armaduras da loja. Bônus: +82 DEF e +22 KI.', category: 'armor', price: 0, minLevel: 1, def: 82, ki: 22, icon: '🛡️' },

  // Acessórios
  { id: 'pingente_foco_ki', name: 'Pingente de Foco de Ki', description: 'Slot: Acessório I ou II. Fabricação Tier 1. Bônus: +6 KI.', category: 'accessory', price: 0, minLevel: 1, ki: 6, icon: '📿' },
  { id: 'modulo_reacao_saiyajin', name: 'Módulo de Reação Saiyajin', description: 'Slot: Acessório I ou II. Fabricação Tier 3. Bônus: +14 KI e +10 VEL.', category: 'accessory', price: 0, minLevel: 1, ki: 14, spd: 10, icon: '📟' },
  { id: 'nucleo_fluxo_ki', name: 'Núcleo de Fluxo de Ki', description: 'Slot: Acessório I ou II. Fabricação Tier 4. Bônus: +22 KI e +15 VEL.', category: 'accessory', price: 0, minLevel: 1, ki: 22, spd: 15, icon: '💠' },
  { id: 'nucleo_gravidade_100x', name: 'Núcleo de Gravidade 100x', description: 'Slot: Acessório I ou II. Fabricação Tier 5, superior aos acessórios da loja. Bônus: +10 ATQ, +10 DEF, +30 KI e +20 VEL.', category: 'accessory', price: 0, minLevel: 1, atk: 10, def: 10, ki: 30, spd: 20, icon: '💠' },

  // Cabeça
  { id: 'bandana_oficina', name: 'Bandana Reforçada', description: 'Slot: Cabeça. Fabricação Tier 1. Bônus: +4 DEF e +4 KI.', category: 'head', price: 0, minLevel: 1, def: 4, ki: 4, icon: '🎗️' },
  { id: 'visor_scouter_tatico', name: 'Visor Scouter Tático', description: 'Slot: Cabeça. Fabricação Tier 2. Bônus: +10 KI e +4 VEL.', category: 'head', price: 0, minLevel: 1, ki: 10, spd: 4, icon: '🥽' },
  { id: 'elmo_combate_saiyajin', name: 'Elmo de Combate Saiyajin', description: 'Slot: Cabeça. Fabricação Tier 3. Bônus: +15 DEF e +8 KI.', category: 'head', price: 0, minLevel: 1, def: 15, ki: 8, icon: '🪖' },
  { id: 'visor_fluxo_ki', name: 'Visor de Fluxo de Ki', description: 'Slot: Cabeça. Fabricação Tier 4. Bônus: +18 KI e +8 VEL.', category: 'head', price: 0, minLevel: 1, ki: 18, spd: 8, icon: '🥽' },
  { id: 'elmo_gravidade_100x', name: 'Elmo de Gravidade 100x', description: 'Slot: Cabeça. Fabricação Tier 5, superior aos equipamentos de cabeça da loja. Bônus: +24 DEF, +18 KI e +8 VEL.', category: 'head', price: 0, minLevel: 1, def: 24, ki: 18, spd: 8, icon: '🪖' },

  // Punhos
  { id: 'munhequeiras_reforcadas', name: 'Munhequeiras Reforçadas', description: 'Slot: Punhos. Fabricação Tier 1. Bônus: +6 ATQ.', category: 'wrists', price: 0, minLevel: 1, atk: 6, icon: '🥊' },
  { id: 'luvas_impacto_carbono', name: 'Luvas de Impacto de Carbono', description: 'Slot: Punhos. Fabricação Tier 2. Bônus: +14 ATQ e +3 DEF.', category: 'wrists', price: 0, minLevel: 1, atk: 14, def: 3, icon: '🧤' },
  { id: 'braceletes_saiyajin', name: 'Braceletes Saiyajin', description: 'Slot: Punhos. Fabricação Tier 3. Bônus: +26 ATQ e +6 DEF.', category: 'wrists', price: 0, minLevel: 1, atk: 26, def: 6, icon: '🧤' },
  { id: 'manoplas_ki_condensado', name: 'Manoplas de Ki Condensado', description: 'Slot: Punhos. Fabricação Tier 4. Bônus: +40 ATQ e +10 KI.', category: 'wrists', price: 0, minLevel: 1, atk: 40, ki: 10, icon: '🥊' },
  { id: 'manoplas_gravidade_100x', name: 'Manoplas de Gravidade 100x', description: 'Slot: Punhos. Fabricação Tier 5, superior às manoplas da loja. Bônus: +60 ATQ, +18 DEF e +8 KI.', category: 'wrists', price: 0, minLevel: 1, atk: 60, def: 18, ki: 8, icon: '🥊' },

  // Pernas
  { id: 'calca_treino_reforcada', name: 'Calça de Treino Reforçada', description: 'Slot: Pernas. Fabricação Tier 1. Bônus: +6 DEF e +3 VEL.', category: 'legs', price: 0, minLevel: 1, def: 6, spd: 3, icon: '👖' },
  { id: 'calca_compressao_tatica', name: 'Calça de Compressão Tática', description: 'Slot: Pernas. Fabricação Tier 2. Bônus: +14 DEF e +5 VEL.', category: 'legs', price: 0, minLevel: 1, def: 14, spd: 5, icon: '👖' },
  { id: 'grevas_saiyajin', name: 'Grevas Saiyajin', description: 'Slot: Pernas. Fabricação Tier 3. Bônus: +24 DEF e +8 VEL.', category: 'legs', price: 0, minLevel: 1, def: 24, spd: 8, icon: '🦿' },
  { id: 'calca_fluxo_ki', name: 'Calça de Fluxo de Ki', description: 'Slot: Pernas. Fabricação Tier 4. Bônus: +34 DEF, +8 VEL e +8 KI.', category: 'legs', price: 0, minLevel: 1, def: 34, spd: 8, ki: 8, icon: '👖' },
  { id: 'calca_gravidade_100x', name: 'Calça de Gravidade 100x', description: 'Slot: Pernas. Fabricação Tier 5, superior às peças de pernas da loja. Bônus: +48 DEF, +20 VEL e +8 KI.', category: 'legs', price: 0, minLevel: 1, def: 48, spd: 20, ki: 8, icon: '🦿' },

  // Botas
  { id: 'botas_corrida_reforcadas', name: 'Botas de Corrida Reforçadas', description: 'Slot: Botas. Fabricação Tier 1. Bônus: +7 VEL.', category: 'boots', price: 0, minLevel: 1, spd: 7, icon: '🥾' },
  { id: 'botas_propulsao_tatica', name: 'Botas de Propulsão Tática', description: 'Slot: Botas. Fabricação Tier 2. Bônus: +15 VEL e +4 DEF.', category: 'boots', price: 0, minLevel: 1, spd: 15, def: 4, icon: '👢' },
  { id: 'botas_saiyajin_craft', name: 'Botas Saiyajin', description: 'Slot: Botas. Fabricação Tier 3. Bônus: +24 VEL e +7 DEF.', category: 'boots', price: 0, minLevel: 1, spd: 24, def: 7, icon: '🥾' },
  { id: 'botas_impulso_ki', name: 'Botas de Impulso de Ki', description: 'Slot: Botas. Fabricação Tier 4. Bônus: +32 VEL e +8 KI.', category: 'boots', price: 0, minLevel: 1, spd: 32, ki: 8, icon: '👢' },
  { id: 'botas_gravidade_100x', name: 'Botas de Gravidade 100x', description: 'Slot: Botas. Fabricação Tier 5, superior às botas da loja. Bônus: +44 VEL, +14 ATQ e +10 KI.', category: 'boots', price: 0, minLevel: 1, spd: 44, atk: 14, ki: 10, icon: '🥾' },
];


const ENDGAME_CRAFT_BANDS = [
  { id: 'ascendente', name: 'Ascendente', minLevel: 30, power: 105, costZeni: 55_000, durationMin: 480, professionLevel: 8, materialQty: 2 },
  { id: 'divino_supremo', name: 'Divino Supremo', minLevel: 50, power: 160, costZeni: 180_000, durationMin: 720, professionLevel: 9, materialQty: 4 },
  { id: 'cosmico_supremo', name: 'Cósmico Supremo', minLevel: 75, power: 235, costZeni: 560_000, durationMin: 960, professionLevel: 10, materialQty: 6 },
  { id: 'eterno_supremo', name: 'Eterno Supremo', minLevel: 100, power: 330, costZeni: 1_600_000, durationMin: 1320, professionLevel: 10, materialQty: 10 },
] as const;

const ENDGAME_CRAFT_SLOT_CONFIGS = [
  {
    category: 'weapon',
    slotLabel: 'Arma',
    name: 'Lâmina Forjada',
    icon: '⚔️',
    professions: ['atleta', 'cientista'],
    materials: ['cristal_energia_ki', 'pesos_gravidade_10x', 'fragmento_tomo_ancestral'],
    stats: (p: number) => ({ atk: p, ki: Math.round(p * 0.24) }),
  },
  {
    category: 'head',
    slotLabel: 'Cabeça',
    name: 'Elmo Forjado',
    icon: '🪖',
    professions: ['cientista', 'policial'],
    materials: ['cristal_energia_ki', 'relatorio_ameaca_global', 'fragmento_tomo_ancestral'],
    stats: (p: number) => ({ def: Math.round(p * 0.50), ki: Math.round(p * 0.42), spd: Math.round(p * 0.15) }),
  },
  {
    category: 'wrists',
    slotLabel: 'Punhos',
    name: 'Manoplas Forjadas',
    icon: '🥊',
    professions: ['atleta', 'cientista'],
    materials: ['fluido_recuperacao_extrema', 'pesos_gravidade_10x', 'cristal_energia_ki'],
    stats: (p: number) => ({ atk: Math.round(p * 0.80), def: Math.round(p * 0.28), ki: Math.round(p * 0.14) }),
  },
  {
    category: 'armor',
    slotLabel: 'Torso',
    name: 'Armadura Forjada',
    icon: '🛡️',
    professions: ['policial', 'cientista'],
    materials: ['relatorio_ameaca_global', 'cristal_energia_ki', 'essencia_arvore_poder'],
    stats: (p: number) => ({ def: Math.round(p * 0.98), ki: Math.round(p * 0.22) }),
  },
  {
    category: 'legs',
    slotLabel: 'Pernas',
    name: 'Grevas Forjadas',
    icon: '🦿',
    professions: ['policial', 'atleta'],
    materials: ['relatorio_ameaca_global', 'pesos_gravidade_10x', 'essencia_arvore_poder'],
    stats: (p: number) => ({ def: Math.round(p * 0.52), spd: Math.round(p * 0.62), ki: Math.round(p * 0.12) }),
  },
  {
    category: 'boots',
    slotLabel: 'Botas',
    name: 'Botas Forjadas',
    icon: '🥾',
    professions: ['cientista', 'atleta'],
    materials: ['cristal_energia_ki', 'pesos_gravidade_10x', 'essencia_arvore_poder'],
    stats: (p: number) => ({ spd: Math.round(p * 0.94), def: Math.round(p * 0.23), ki: Math.round(p * 0.12) }),
  },
  {
    category: 'accessory',
    slotLabel: 'Acessório I ou II',
    name: 'Núcleo Forjado',
    icon: '💠',
    professions: ['cientista', 'academico'],
    materials: ['fragmento_tomo_ancestral', 'cristal_energia_ki', 'essencia_arvore_poder'],
    stats: (p: number) => ({
      atk: Math.round(p * 0.32),
      def: Math.round(p * 0.32),
      spd: Math.round(p * 0.32),
      ki: Math.round(p * 0.32),
    }),
  },
] as const;

function endgameCraftBonusText(stats: { atk?: number; def?: number; spd?: number; ki?: number }): string {
  return [
    stats.atk ? `+${stats.atk} ATQ` : '',
    stats.def ? `+${stats.def} DEF` : '',
    stats.spd ? `+${stats.spd} VEL` : '',
    stats.ki ? `+${stats.ki} KI` : '',
  ].filter(Boolean).join(', ');
}

/**
 * Obras-primas da Oficina para o endgame. Em cada faixa (30/50/75/100)
 * elas são cerca de 30–40% mais fortes que o equivalente comercial,
 * exigindo carreira avançada, materiais raros, blueprint e tempo offline.
 */
export const ENDGAME_CRAFTED_ITEMS: ShopItem[] = ENDGAME_CRAFT_BANDS.flatMap((band) =>
  ENDGAME_CRAFT_SLOT_CONFIGS.map((slot) => {
    const stats = slot.stats(band.power);
    return {
      id: `oficina_${band.id}_${slot.category}`,
      name: `${slot.name} ${band.name}`,
      description: `Slot: ${slot.slotLabel}. Obra-prima da Oficina para Nv. ${band.minLevel}+. Bônus: ${endgameCraftBonusText(stats)}. Superior ao equipamento comercial do mesmo patamar.`,
      category: slot.category,
      price: 0,
      minLevel: band.minLevel,
      icon: slot.icon,
      ...stats,
    } satisfies ShopItem;
  })
);

const ENDGAME_CRAFT_RECIPES: CraftRecipeDef[] = ENDGAME_CRAFT_BANDS.flatMap((band) =>
  ENDGAME_CRAFT_SLOT_CONFIGS.map((slot) => ({
    id: `craft_oficina_${band.id}_${slot.category}`,
    name: `${slot.name} ${band.name}`,
    description: `Obra-prima de endgame para ${slot.slotLabel}, destinada a guerreiros de nível ${band.minLevel}+.`,
    tier: 5,
    icon: slot.icon,
    outputItemId: `oficina_${band.id}_${slot.category}`,
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: band.costZeni,
    baseDurationMin: band.durationMin,
    minPlayerLevel: band.minLevel,
    professionRequirements: slot.professions.map((professionId) => ({
      professionId,
      level: band.professionLevel,
    })),
    ingredients: [
      ...slot.materials.map((itemId) => ({ itemId, quantity: band.materialQty })),
      { itemId: 'esquema_gravidade_alterada', quantity: Math.max(1, Math.ceil(band.materialQty / 4)) },
    ],
  } satisfies CraftRecipeDef))
);

export const CRAFTED_ITEMS: ShopItem[] = [
  {
    id: 'capsula_recuperacao_simples',
    name: 'Cápsula de Recuperação Simples',
    description: 'Consumível fabricado na Oficina. Recupera 30% da vida máxima.',
    category: 'consumable',
    price: 0,
    minLevel: 1,
    effect: 'heal_30pct',
    icon: '🧴',
  },
  {
    id: 'foco_combate_tatico',
    name: 'Foco de Combate Tático',
    description: 'Slot: Acessório I ou II. Fabricação Tier 2. Bônus: +8 DEF e +8 VEL.',
    category: 'accessory',
    price: 0,
    minLevel: 1,
    def: 8,
    spd: 8,
    icon: '📟',
  },
  {
    id: 'armadura_combate_saiyajin_craft',
    name: 'Armadura de Combate Saiyajin',
    description: 'Slot: Torso. Fabricação Tier 3. Bônus: +38 DEF e +8 KI.',
    category: 'armor',
    price: 0,
    minLevel: 1,
    def: 38,
    ki: 8,
    icon: '🛡️',
  },
  {
    id: 'senzu_processado',
    name: 'Feijão Senzu Processado',
    description: 'Consumível de alto nível. Recupera 100% da vida.',
    category: 'consumable',
    price: 0,
    minLevel: 1,
    effect: 'full_hp',
    icon: '🫘',
  },
  {
    id: 'sala_gravidade_pessoal_100x',
    name: 'Sala de Gravidade Pessoal 100x',
    description: 'Equipamento de treino permanente. Concede +3 pontos extras em cada treino.',
    category: 'training',
    price: 0,
    minLevel: 1,
    trainBonus: { all: 3 },
    icon: '🛸',
  },
  ...SLOT_CRAFTED_ITEMS,
  ...ENDGAME_CRAFTED_ITEMS,
];


const SLOT_CRAFT_RECIPES: CraftRecipeDef[] = [
  // Arma — Tiers 1–5
  { id: 'craft_bastao_liga_leve', name: 'Bastão de Liga Leve', description: 'Arma: +5 ATQ.', tier: 1, icon: '🔧', outputItemId: 'bastao_liga_leve', outputQuantity: 1, outputKind: 'player_item', costZeni: 180, baseDurationMin: 15, ingredients: [{ itemId: 'liga_metais_leves', quantity: 2 }, { itemId: 'faixa_pressao', quantity: 1 }] },
  { id: 'craft_lamina_carbono', name: 'Lâmina de Carbono', description: 'Arma: +10 ATQ e +2 VEL.', tier: 2, icon: '🗡️', outputItemId: 'lamina_carbono', outputQuantity: 1, outputKind: 'player_item', costZeni: 700, baseDurationMin: 45, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[2] }], ingredients: [{ itemId: 'algema_carbono', quantity: 2 }, { itemId: 'liga_metais_leves', quantity: 2 }, { itemId: 'faixa_pressao', quantity: 1 }] },
  { id: 'craft_lanca_saiyajin', name: 'Lança Saiyajin', description: 'Arma: +18 ATQ e +4 KI.', tier: 3, icon: '🔱', outputItemId: 'lanca_saiyajin', outputQuantity: 1, outputKind: 'player_item', costZeni: 2600, baseDurationMin: 120, professionRequirements: [{ professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[3] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[3] }], ingredients: [{ itemId: 'pesos_gravidade_10x', quantity: 1 }, { itemId: 'capsula_vazia_tipo_b', quantity: 1 }, { itemId: 'liga_metais_leves', quantity: 4 }, { itemId: 'planta_blindagem_flexivel', quantity: 1 }] },
  { id: 'craft_lamina_ki_condensado', name: 'Lâmina de Ki Condensado', description: 'Arma: +26 ATQ e +8 KI.', tier: 4, icon: '⚔️', outputItemId: 'lamina_ki_condensado', outputQuantity: 1, outputKind: 'player_item', costZeni: 5600, baseDurationMin: 240, professionRequirements: [{ professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[4] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[4] }], ingredients: [{ itemId: 'pesos_gravidade_10x', quantity: 2 }, { itemId: 'microchip_controle', quantity: 3 }, { itemId: 'kevlar_alienigena', quantity: 2 }, { itemId: 'esquema_canalizacao_ki', quantity: 1 }] },
  { id: 'craft_espada_gravidade_100x', name: 'Espada de Gravidade 100x', description: 'Arma: +38 ATQ e +12 KI.', tier: 5, icon: '🌌', outputItemId: 'espada_gravidade_100x', outputQuantity: 1, outputKind: 'player_item', costZeni: 15000, baseDurationMin: 480, professionRequirements: [{ professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[5] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[5] }], ingredients: [{ itemId: 'fluido_recuperacao_extrema', quantity: 2 }, { itemId: 'cristal_energia_ki', quantity: 2 }, { itemId: 'essencia_arvore_poder', quantity: 1 }, { itemId: 'esquema_gravidade_alterada', quantity: 1 }] },

  // Torso — Tiers 1, 2, 4 e 5 (Tier 3 usa Armadura de Combate Saiyajin)
  { id: 'craft_colete_fibra_reforcada', name: 'Colete de Fibra Reforçada', description: 'Torso: +5 DEF.', tier: 1, icon: '🥋', outputItemId: 'colete_fibra_reforcada', outputQuantity: 1, outputKind: 'player_item', costZeni: 180, baseDurationMin: 15, ingredients: [{ itemId: 'fibra_reforcada', quantity: 2 }, { itemId: 'liga_metais_leves', quantity: 1 }] },
  { id: 'craft_colete_carbono_tatico', name: 'Colete de Carbono Tático', description: 'Torso: +10 DEF e +2 VEL.', tier: 2, icon: '🦺', outputItemId: 'colete_carbono_tatico', outputQuantity: 1, outputKind: 'player_item', costZeni: 750, baseDurationMin: 50, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[2] }], ingredients: [{ itemId: 'algema_carbono', quantity: 2 }, { itemId: 'fibra_reforcada', quantity: 2 }, { itemId: 'liga_metais_leves', quantity: 1 }] },
  { id: 'craft_armadura_fluxo_ki', name: 'Armadura de Fluxo de Ki', description: 'Torso: +28 DEF e +10 KI.', tier: 4, icon: '🔷', outputItemId: 'armadura_fluxo_ki', outputQuantity: 1, outputKind: 'player_item', costZeni: 6200, baseDurationMin: 270, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[4] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[4] }], ingredients: [{ itemId: 'kevlar_alienigena', quantity: 5 }, { itemId: 'microchip_controle', quantity: 3 }, { itemId: 'pesos_gravidade_10x', quantity: 1 }, { itemId: 'esquema_canalizacao_ki', quantity: 1 }] },
  { id: 'craft_armadura_gravidade_100x', name: 'Armadura de Gravidade 100x', description: 'Torso: +45 DEF e +12 KI.', tier: 5, icon: '🛡️', outputItemId: 'armadura_gravidade_100x', outputQuantity: 1, outputKind: 'player_item', costZeni: 16500, baseDurationMin: 540, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[5] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[5] }], ingredients: [{ itemId: 'relatorio_ameaca_global', quantity: 2 }, { itemId: 'cristal_energia_ki', quantity: 2 }, { itemId: 'fluido_recuperacao_extrema', quantity: 1 }, { itemId: 'esquema_gravidade_alterada', quantity: 1 }] },

  // Acessório — Tiers 1, 3, 4 e 5 (Tier 2 usa Radar do Dragão)
  { id: 'craft_pingente_foco_ki', name: 'Pingente de Foco de Ki', description: 'Acessório: +3 KI.', tier: 1, icon: '📿', outputItemId: 'pingente_foco_ki', outputQuantity: 1, outputKind: 'player_item', costZeni: 160, baseDurationMin: 12, ingredients: [{ itemId: 'papel_pergaminho', quantity: 1 }, { itemId: 'liga_metais_leves', quantity: 1 }] },
  { id: 'craft_modulo_reacao_saiyajin', name: 'Módulo de Reação Saiyajin', description: 'Acessório: +6 KI e +5 VEL.', tier: 3, icon: '📟', outputItemId: 'modulo_reacao_saiyajin', outputQuantity: 1, outputKind: 'player_item', costZeni: 2300, baseDurationMin: 110, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[3] }, { professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[3] }], ingredients: [{ itemId: 'capsula_vazia_tipo_b', quantity: 1 }, { itemId: 'kevlar_alienigena', quantity: 1 }, { itemId: 'microchip_controle', quantity: 2 }, { itemId: 'planta_blindagem_flexivel', quantity: 1 }] },
  { id: 'craft_nucleo_fluxo_ki', name: 'Núcleo de Fluxo de Ki', description: 'Acessório: +12 KI e +8 VEL.', tier: 4, icon: '💠', outputItemId: 'nucleo_fluxo_ki', outputQuantity: 1, outputKind: 'player_item', costZeni: 5200, baseDurationMin: 220, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[4] }, { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[4] }], ingredients: [{ itemId: 'microchip_controle', quantity: 4 }, { itemId: 'pesos_gravidade_10x', quantity: 1 }, { itemId: 'kevlar_alienigena', quantity: 1 }, { itemId: 'esquema_canalizacao_ki', quantity: 1 }] },
  { id: 'craft_nucleo_gravidade_100x', name: 'Núcleo de Gravidade 100x', description: 'Acessório: +6 ATQ, +16 KI e +12 VEL.', tier: 5, icon: '🌀', outputItemId: 'nucleo_gravidade_100x', outputQuantity: 1, outputKind: 'player_item', costZeni: 14000, baseDurationMin: 450, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[5] }, { professionId: 'academico', level: CRAFT_TIER_PROFESSION_LEVEL[5] }], ingredients: [{ itemId: 'cristal_energia_ki', quantity: 2 }, { itemId: 'fragmento_tomo_ancestral', quantity: 1 }, { itemId: 'essencia_arvore_poder', quantity: 1 }, { itemId: 'esquema_gravidade_alterada', quantity: 1 }] },

  // Tier 1 — entrada livre
  { id: 'craft_bandana_oficina', name: 'Bandana Reforçada', description: 'Proteção leve para cabeça: +2 DEF e +2 KI.', tier: 1, icon: '🎗️', outputItemId: 'bandana_oficina', outputQuantity: 1, outputKind: 'player_item', costZeni: 120, baseDurationMin: 10, ingredients: [{ itemId: 'papel_pergaminho', quantity: 1 }, { itemId: 'fibra_reforcada', quantity: 1 }] },
  { id: 'craft_munhequeiras_reforcadas', name: 'Munhequeiras Reforçadas', description: 'Equipamento de punhos: +3 ATQ.', tier: 1, icon: '🥊', outputItemId: 'munhequeiras_reforcadas', outputQuantity: 1, outputKind: 'player_item', costZeni: 120, baseDurationMin: 10, ingredients: [{ itemId: 'faixa_pressao', quantity: 1 }, { itemId: 'fibra_reforcada', quantity: 1 }] },
  { id: 'craft_calca_treino_reforcada', name: 'Calça de Treino Reforçada', description: 'Equipamento de pernas: +3 DEF.', tier: 1, icon: '👖', outputItemId: 'calca_treino_reforcada', outputQuantity: 1, outputKind: 'player_item', costZeni: 150, baseDurationMin: 12, ingredients: [{ itemId: 'fibra_reforcada', quantity: 2 }, { itemId: 'liga_metais_leves', quantity: 1 }] },
  { id: 'craft_botas_corrida_reforcadas', name: 'Botas de Corrida Reforçadas', description: 'Equipamento de botas: +3 VEL.', tier: 1, icon: '🥾', outputItemId: 'botas_corrida_reforcadas', outputQuantity: 1, outputKind: 'player_item', costZeni: 150, baseDurationMin: 12, ingredients: [{ itemId: 'faixa_pressao', quantity: 1 }, { itemId: 'liga_metais_leves', quantity: 1 }] },

  // Tier 2 — carreira Nv. 2
  { id: 'craft_visor_scouter_tatico', name: 'Visor Scouter Tático', description: 'Cabeça: +5 KI e +2 VEL.', tier: 2, icon: '🕶️', outputItemId: 'visor_scouter_tatico', outputQuantity: 1, outputKind: 'player_item', costZeni: 450, baseDurationMin: 30, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[2] }], ingredients: [{ itemId: 'microchip_controle', quantity: 2 }, { itemId: 'tinta_arcana', quantity: 1 }, { itemId: 'fibra_reforcada', quantity: 1 }] },
  { id: 'craft_luvas_impacto_carbono', name: 'Luvas de Impacto de Carbono', description: 'Punhos: +6 ATQ e +2 DEF.', tier: 2, icon: '🧤', outputItemId: 'luvas_impacto_carbono', outputQuantity: 1, outputKind: 'player_item', costZeni: 500, baseDurationMin: 35, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[2] }], ingredients: [{ itemId: 'algema_carbono', quantity: 1 }, { itemId: 'faixa_pressao', quantity: 2 }, { itemId: 'liga_metais_leves', quantity: 1 }] },
  { id: 'craft_calca_compressao_tatica', name: 'Calça de Compressão Tática', description: 'Pernas: +6 DEF e +2 VEL.', tier: 2, icon: '🥋', outputItemId: 'calca_compressao_tatica', outputQuantity: 1, outputKind: 'player_item', costZeni: 550, baseDurationMin: 35, professionRequirements: [{ professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[2] }], ingredients: [{ itemId: 'proteina_concentrada', quantity: 1 }, { itemId: 'fibra_reforcada', quantity: 2 }, { itemId: 'liga_metais_leves', quantity: 1 }] },
  { id: 'craft_botas_propulsao_tatica', name: 'Botas de Propulsão Tática', description: 'Botas: +6 VEL e +2 DEF.', tier: 2, icon: '👢', outputItemId: 'botas_propulsao_tatica', outputQuantity: 1, outputKind: 'player_item', costZeni: 600, baseDurationMin: 40, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[2] }], ingredients: [{ itemId: 'microchip_controle', quantity: 1 }, { itemId: 'liga_metais_leves', quantity: 2 }, { itemId: 'faixa_pressao', quantity: 1 }] },

  // Tier 3 — duas carreiras Nv. 4 + blueprint
  { id: 'craft_elmo_combate_saiyajin', name: 'Elmo de Combate Saiyajin', description: 'Cabeça: +8 DEF e +4 KI.', tier: 3, icon: '🪖', outputItemId: 'elmo_combate_saiyajin', outputQuantity: 1, outputKind: 'player_item', costZeni: 1800, baseDurationMin: 90, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[3] }, { professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[3] }], ingredients: [{ itemId: 'kevlar_alienigena', quantity: 2 }, { itemId: 'capsula_vazia_tipo_b', quantity: 1 }, { itemId: 'planta_blindagem_flexivel', quantity: 1 }] },
  { id: 'craft_braceletes_saiyajin', name: 'Braceletes Saiyajin', description: 'Punhos: +10 ATQ e +4 DEF.', tier: 3, icon: '💪', outputItemId: 'braceletes_saiyajin', outputQuantity: 1, outputKind: 'player_item', costZeni: 1900, baseDurationMin: 90, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[3] }, { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[3] }], ingredients: [{ itemId: 'kevlar_alienigena', quantity: 2 }, { itemId: 'pesos_gravidade_10x', quantity: 1 }, { itemId: 'planta_blindagem_flexivel', quantity: 1 }] },
  { id: 'craft_grevas_saiyajin', name: 'Grevas Saiyajin', description: 'Pernas: +10 DEF e +4 VEL.', tier: 3, icon: '🦿', outputItemId: 'grevas_saiyajin', outputQuantity: 1, outputKind: 'player_item', costZeni: 2200, baseDurationMin: 105, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[3] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[3] }], ingredients: [{ itemId: 'kevlar_alienigena', quantity: 3 }, { itemId: 'capsula_vazia_tipo_b', quantity: 1 }, { itemId: 'planta_blindagem_flexivel', quantity: 1 }] },
  { id: 'craft_botas_saiyajin', name: 'Botas Saiyajin', description: 'Botas: +10 VEL e +4 DEF.', tier: 3, icon: '🥾', outputItemId: 'botas_saiyajin_craft', outputQuantity: 1, outputKind: 'player_item', costZeni: 2200, baseDurationMin: 105, professionRequirements: [{ professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[3] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[3] }], ingredients: [{ itemId: 'pesos_gravidade_10x', quantity: 2 }, { itemId: 'capsula_vazia_tipo_b', quantity: 1 }, { itemId: 'planta_blindagem_flexivel', quantity: 1 }] },

  // Tier 4 — duas carreiras Nv. 6 + Esquema de Canalização de Ki
  { id: 'craft_visor_fluxo_ki', name: 'Visor de Fluxo de Ki', description: 'Cabeça: +12 KI e +5 VEL.', tier: 4, icon: '🔷', outputItemId: 'visor_fluxo_ki', outputQuantity: 1, outputKind: 'player_item', costZeni: 4200, baseDurationMin: 180, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[4] }, { professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[4] }], ingredients: [{ itemId: 'microchip_controle', quantity: 4 }, { itemId: 'kevlar_alienigena', quantity: 3 }, { itemId: 'esquema_canalizacao_ki', quantity: 1 }] },
  { id: 'craft_manoplas_ki_condensado', name: 'Manoplas de Ki Condensado', description: 'Punhos: +14 ATQ e +6 KI.', tier: 4, icon: '💥', outputItemId: 'manoplas_ki_condensado', outputQuantity: 1, outputKind: 'player_item', costZeni: 4500, baseDurationMin: 190, professionRequirements: [{ professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[4] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[4] }], ingredients: [{ itemId: 'pesos_gravidade_10x', quantity: 2 }, { itemId: 'microchip_controle', quantity: 3 }, { itemId: 'esquema_canalizacao_ki', quantity: 1 }] },
  { id: 'craft_calca_fluxo_ki', name: 'Calça de Fluxo de Ki', description: 'Pernas: +14 DEF e +5 KI.', tier: 4, icon: '🔹', outputItemId: 'calca_fluxo_ki', outputQuantity: 1, outputKind: 'player_item', costZeni: 4700, baseDurationMin: 200, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[4] }, { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[4] }], ingredients: [{ itemId: 'kevlar_alienigena', quantity: 3 }, { itemId: 'pesos_gravidade_10x', quantity: 2 }, { itemId: 'esquema_canalizacao_ki', quantity: 1 }] },
  { id: 'craft_botas_impulso_ki', name: 'Botas de Impulso de Ki', description: 'Botas: +14 VEL e +5 KI.', tier: 4, icon: '💨', outputItemId: 'botas_impulso_ki', outputQuantity: 1, outputKind: 'player_item', costZeni: 4800, baseDurationMin: 200, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[4] }, { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[4] }], ingredients: [{ itemId: 'capsula_vazia_tipo_b', quantity: 2 }, { itemId: 'pesos_gravidade_10x', quantity: 2 }, { itemId: 'esquema_canalizacao_ki', quantity: 1 }] },

  // Tier 5 — duas carreiras Nv. 8 + Esquema de Gravidade Alterada
  { id: 'craft_elmo_gravidade_100x', name: 'Elmo de Gravidade 100x', description: 'Cabeça: +16 DEF e +8 KI.', tier: 5, icon: '🌀', outputItemId: 'elmo_gravidade_100x', outputQuantity: 1, outputKind: 'player_item', costZeni: 12000, baseDurationMin: 360, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[5] }, { professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[5] }], ingredients: [{ itemId: 'cristal_energia_ki', quantity: 2 }, { itemId: 'relatorio_ameaca_global', quantity: 1 }, { itemId: 'esquema_gravidade_alterada', quantity: 1 }] },
  { id: 'craft_manoplas_gravidade_100x', name: 'Manoplas de Gravidade 100x', description: 'Punhos: +20 ATQ e +8 DEF.', tier: 5, icon: '🌌', outputItemId: 'manoplas_gravidade_100x', outputQuantity: 1, outputKind: 'player_item', costZeni: 12500, baseDurationMin: 380, professionRequirements: [{ professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[5] }, { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[5] }], ingredients: [{ itemId: 'fluido_recuperacao_extrema', quantity: 2 }, { itemId: 'cristal_energia_ki', quantity: 1 }, { itemId: 'esquema_gravidade_alterada', quantity: 1 }] },
  { id: 'craft_calca_gravidade_100x', name: 'Calça de Gravidade 100x', description: 'Pernas: +20 DEF e +8 VEL.', tier: 5, icon: '🌠', outputItemId: 'calca_gravidade_100x', outputQuantity: 1, outputKind: 'player_item', costZeni: 13000, baseDurationMin: 400, professionRequirements: [{ professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[5] }, { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[5] }], ingredients: [{ itemId: 'relatorio_ameaca_global', quantity: 2 }, { itemId: 'essencia_arvore_poder', quantity: 1 }, { itemId: 'esquema_gravidade_alterada', quantity: 1 }] },
  { id: 'craft_botas_gravidade_100x', name: 'Botas de Gravidade 100x', description: 'Botas: +20 VEL e +8 ATQ.', tier: 5, icon: '🚀', outputItemId: 'botas_gravidade_100x', outputQuantity: 1, outputKind: 'player_item', costZeni: 13000, baseDurationMin: 400, professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[5] }, { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[5] }], ingredients: [{ itemId: 'cristal_energia_ki', quantity: 2 }, { itemId: 'essencia_arvore_poder', quantity: 1 }, { itemId: 'esquema_gravidade_alterada', quantity: 1 }] },
];

export const CRAFT_RECIPES: CraftRecipeDef[] = [
  // ===== Blueprints Acadêmicos =====
  {
    id: 'blueprint_deteccao_ki',
    name: 'Esquema de Detecção Ki',
    description: 'Projeto acadêmico usado no Radar do Dragão Básico.',
    tier: 2,
    icon: '📡',
    outputItemId: 'esquema_deteccao_ki',
    outputQuantity: 1,
    outputKind: 'stack',
    costZeni: 250,
    baseDurationMin: 20,
    maxBatch: 5,
    requiresAcademic: true,
    professionRequirements: [{ professionId: 'academico', level: CRAFT_TIER_PROFESSION_LEVEL[2] }],
    ingredients: [
      { itemId: 'papel_pergaminho', quantity: 2 },
      { itemId: 'tinta_arcana', quantity: 1 },
      { itemId: 'microchip_controle', quantity: 1 },
    ],
  },
  {
    id: 'blueprint_blindagem_flexivel',
    name: 'Planta de Blindagem Flexível',
    description: 'Projeto obrigatório da Armadura de Combate Saiyajin.',
    tier: 3,
    icon: '📐',
    outputItemId: 'planta_blindagem_flexivel',
    outputQuantity: 1,
    outputKind: 'stack',
    costZeni: 800,
    baseDurationMin: 60,
    maxBatch: 5,
    requiresAcademic: true,
    professionRequirements: [{ professionId: 'academico', level: CRAFT_TIER_PROFESSION_LEVEL[3] }],
    ingredients: [
      { itemId: 'papel_pergaminho', quantity: 3 },
      { itemId: 'tinta_arcana', quantity: 2 },
      { itemId: 'esquema_avancado_engenharia', quantity: 1 },
      { itemId: 'fibra_reforcada', quantity: 1 },
    ],
  },
  {
    id: 'blueprint_estabilizacao_organica',
    name: 'Fórmula de Estabilização Orgânica',
    description: 'Projeto obrigatório do Feijão Senzu Processado.',
    tier: 4,
    icon: '🧬',
    outputItemId: 'formula_estabilizacao_organica',
    outputQuantity: 1,
    outputKind: 'stack',
    costZeni: 1500,
    baseDurationMin: 120,
    maxBatch: 5,
    requiresAcademic: true,
    professionRequirements: [{ professionId: 'academico', level: CRAFT_TIER_PROFESSION_LEVEL[4] }],
    ingredients: [
      { itemId: 'papel_pergaminho', quantity: 3 },
      { itemId: 'tinta_arcana', quantity: 2 },
      { itemId: 'fragmento_tomo_ancestral', quantity: 1 },
      { itemId: 'erva_medicinal', quantity: 1 },
      { itemId: 'proteina_concentrada', quantity: 1 },
    ],
  },
  {
    id: 'blueprint_canalizacao_ki',
    name: 'Esquema de Canalização de Ki',
    description: 'Projeto obrigatório dos equipamentos de combate Tier 4.',
    tier: 4,
    icon: '🔷',
    outputItemId: 'esquema_canalizacao_ki',
    outputQuantity: 1,
    outputKind: 'stack',
    costZeni: 1800,
    baseDurationMin: 150,
    maxBatch: 5,
    requiresAcademic: true,
    professionRequirements: [{ professionId: 'academico', level: CRAFT_TIER_PROFESSION_LEVEL[4] }],
    ingredients: [
      { itemId: 'papel_pergaminho', quantity: 3 },
      { itemId: 'tinta_arcana', quantity: 2 },
      { itemId: 'esquema_avancado_engenharia', quantity: 1 },
      { itemId: 'microchip_controle', quantity: 2 },
      { itemId: 'proteina_concentrada', quantity: 1 },
    ],
  },
  {
    id: 'blueprint_gravidade_alterada',
    name: 'Esquema de Gravidade Alterada',
    description: 'Projeto obrigatório da Sala de Gravidade Pessoal 100x.',
    tier: 5,
    icon: '🌀',
    outputItemId: 'esquema_gravidade_alterada',
    outputQuantity: 1,
    outputKind: 'stack',
    costZeni: 3500,
    baseDurationMin: 240,
    maxBatch: 5,
    requiresAcademic: true,
    professionRequirements: [{ professionId: 'academico', level: CRAFT_TIER_PROFESSION_LEVEL[5] }],
    ingredients: [
      { itemId: 'papel_pergaminho', quantity: 5 },
      { itemId: 'tinta_arcana', quantity: 3 },
      { itemId: 'esquema_avancado_engenharia', quantity: 2 },
      { itemId: 'fragmento_tomo_ancestral', quantity: 1 },
      { itemId: 'microchip_controle', quantity: 2 },
      { itemId: 'pesos_gravidade_10x', quantity: 1 },
    ],
  },

  // ===== Itens principais =====
  {
    id: 'capsula_recuperacao_simples',
    name: 'Cápsula de Recuperação Simples',
    description: 'Recupera 30% da vida máxima.',
    tier: 1,
    icon: '🧴',
    outputItemId: 'capsula_recuperacao_simples',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 150,
    baseDurationMin: 10,
    maxBatch: 10,
    ingredients: [
      { itemId: 'erva_medicinal', quantity: 2 },
      { itemId: 'liga_metais_leves', quantity: 1 },
    ],
  },
  {
    id: 'foco_combate_tatico',
    name: 'Foco de Combate Tático',
    description: 'Acessório equipável: +2 Defesa e +2 Velocidade.',
    tier: 2,
    icon: '📟',
    outputItemId: 'foco_combate_tatico',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 500,
    baseDurationMin: 30,
    professionRequirements: [{ professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[2] }],
    ingredients: [
      { itemId: 'microchip_controle', quantity: 3 },
      { itemId: 'fibra_reforcada', quantity: 2 },
      { itemId: 'esquema_deteccao_ki', quantity: 1 },
    ],
  },
  {
    id: 'armadura_combate_saiyajin',
    name: 'Armadura de Combate Saiyajin',
    description: 'Equipamento de combate que concede +35 Defesa.',
    tier: 3,
    icon: '🛡️',
    outputItemId: 'armadura_combate_saiyajin_craft',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 2500,
    baseDurationMin: 120,
    professionRequirements: [
      { professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[3] },
      { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[3] },
    ],
    ingredients: [
      { itemId: 'liga_metais_leves', quantity: 5 },
      { itemId: 'kevlar_alienigena', quantity: 5 },
      { itemId: 'faixa_pressao', quantity: 2 },
      { itemId: 'planta_blindagem_flexivel', quantity: 1 },
    ],
  },
  {
    id: 'senzu_processado',
    name: 'Feijão Senzu Processado',
    description: 'Consumível que recupera 100% da vida.',
    tier: 4,
    icon: '🫘',
    outputItemId: 'senzu_processado',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 5000,
    baseDurationMin: 240,
    maxBatch: 5,
    professionRequirements: [
      { professionId: 'agricultor', level: CRAFT_TIER_PROFESSION_LEVEL[4] },
      { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[4] },
    ],
    ingredients: [
      { itemId: 'semente_deuses_virgem', quantity: 2 },
      { itemId: 'fluido_recuperacao_extrema', quantity: 2 },
      { itemId: 'formula_estabilizacao_organica', quantity: 1 },
    ],
  },
  {
    id: 'sala_gravidade_pessoal_100x',
    name: 'Sala de Gravidade Pessoal 100x',
    description: 'Item de treino permanente: +3 pontos extras por treino.',
    tier: 5,
    icon: '🛸',
    outputItemId: 'sala_gravidade_pessoal_100x',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 20000,
    baseDurationMin: 720,
    professionRequirements: [
      { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[5] },
      { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[5] },
    ],
    ingredients: [
      { itemId: 'capsula_vazia_tipo_b', quantity: 10 },
      { itemId: 'pesos_gravidade_10x', quantity: 5 },
      { itemId: 'essencia_arvore_poder', quantity: 3 },
      { itemId: 'esquema_gravidade_alterada', quantity: 2 },
    ],
  },
  ...SLOT_CRAFT_RECIPES,
  ...ENDGAME_CRAFT_RECIPES,
];

export function getCraftRecipe(id: string): CraftRecipeDef | undefined {
  return CRAFT_RECIPES.find((recipe) => recipe.id === id);
}

export function getCraftedItem(id: string): ShopItem | undefined {
  return CRAFTED_ITEMS.find((item) => item.id === id);
}

export function getCraftStackItem(id: string): CraftStackItemDef | undefined {
  return CRAFT_STACK_ITEMS.find((item) => item.id === id);
}

export function isCraftedPlayerItem(id: string): boolean {
  return CRAFTED_ITEMS.some((item) => item.id === id);
}
