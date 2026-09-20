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

export const MAX_CRAFT_BATCH = 20;

/** XP total exigido para cada nível de Maestria da Oficina (1–10). */
export const CRAFTING_LEVEL_XP = [0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7500] as const;

/** XP concedido por unidade concluída, de acordo com o Tier da receita. */
export const CRAFTING_XP_PER_TIER = {
  1: 25,
  2: 50,
  3: 100,
  4: 180,
  5: 300,
} as const;

export function craftingLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.trunc(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  for (let i = 1; i < CRAFTING_LEVEL_XP.length; i += 1) {
    if (safeXp < CRAFTING_LEVEL_XP[i]) break;
    level = i + 1;
  }
  return level;
}

export function craftingQueueCapacity(level: number): number {
  const safeLevel = Math.max(1, Math.min(10, Math.trunc(level || 1)));
  if (safeLevel >= 8) return 3;
  if (safeLevel >= 4) return 2;
  return 1;
}

export function craftingXpReward(tier: 1 | 2 | 3 | 4 | 5, batchQuantity = 1): number {
  const batch = Math.max(1, Math.trunc(batchQuantity || 1));
  return CRAFTING_XP_PER_TIER[tier] * batch;
}

export function craftingProgress(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  progressPct: number;
  queueCapacity: number;
} {
  const safeXp = Math.max(0, Math.trunc(Number.isFinite(xp) ? xp : 0));
  const level = craftingLevelFromXp(safeXp);
  const currentLevelXp = CRAFTING_LEVEL_XP[level - 1];
  const nextLevelXp = level < 10 ? CRAFTING_LEVEL_XP[level] : null;
  const progressPct =
    nextLevelXp === null
      ? 100
      : Math.max(0, Math.min(100, ((safeXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100));
  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressPct,
    queueCapacity: craftingQueueCapacity(level),
  };
}

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
    id: 'projeto_reforco_ki',
    name: 'Projeto de Reforço de Ki',
    description: 'Projeto acadêmico para integrar canais de Ki a peças de equipamento avançadas.',
    tier: 4,
    icon: '🔷',
    kind: 'blueprint',
  },
  {
    id: 'projeto_propulsao_ki',
    name: 'Projeto de Propulsão de Ki',
    description: 'Projeto acadêmico de micropropulsores compactos alimentados por Ki.',
    tier: 4,
    icon: '🚀',
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
    id: 'radar_dragao_basico',
    name: 'Radar do Dragão Básico',
    description: 'Acessório de rastreamento. Enquanto equipado, aumenta em 2 p.p. a chance de encontrar uma Esfera do Dragão ao concluir um turno de profissão.',
    category: 'accessory',
    price: 0,
    minLevel: 1,
    dragonBallChanceBonus: 0.02,
    icon: '📟',
  },
  {
    id: 'armadura_combate_saiyajin_craft',
    name: 'Armadura de Combate Saiyajin',
    description: 'Armadura flexível de Oficina. Concede +35 de Defesa enquanto equipada.',
    category: 'armor',
    price: 0,
    minLevel: 1,
    def: 35,
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
  // ===== Equipamentos corporais da Oficina — progressão Tier 1–5 =====
  // Cabeça
  {
    id: 'bandana_foco_ki',
    name: 'Bandana de Foco de Ki',
    description: 'Proteção leve que estabiliza a concentração. Concede +3 Ki.',
    category: 'head',
    price: 0,
    minLevel: 1,
    ki: 3,
    icon: '🎗️',
  },
  {
    id: 'visor_rastreador_ki',
    name: 'Visor Rastreador de Ki',
    description: 'Visor com leitura de movimento e energia. Concede +4 Ki e +3 Velocidade.',
    category: 'head',
    price: 0,
    minLevel: 1,
    ki: 4,
    spd: 3,
    icon: '🥽',
  },
  {
    id: 'capacete_combate_saiyajin',
    name: 'Capacete de Combate Saiyajin',
    description: 'Capacete de placas flexíveis para combate pesado. Concede +8 Defesa e +5 Ki.',
    category: 'head',
    price: 0,
    minLevel: 1,
    def: 8,
    ki: 5,
    icon: '🪖',
  },
  {
    id: 'elmo_sincronizacao_ki',
    name: 'Elmo de Sincronização de Ki',
    description: 'Elmo técnico que distribui Ki pelo equipamento. Concede +10 Defesa, +9 Ki e +4 Velocidade.',
    category: 'head',
    price: 0,
    minLevel: 1,
    def: 10,
    ki: 9,
    spd: 4,
    icon: '🧿',
  },
  {
    id: 'elmo_gravidade_divina',
    name: 'Elmo de Gravidade Divina',
    description: 'Elmo de elite estabilizado para campos gravitacionais extremos. Concede +16 Defesa, +14 Ki e +6 Velocidade.',
    category: 'head',
    price: 0,
    minLevel: 1,
    def: 16,
    ki: 14,
    spd: 6,
    icon: '👑',
  },

  // Punhos
  {
    id: 'faixas_treinamento',
    name: 'Faixas de Treinamento',
    description: 'Faixas firmes para golpes repetidos. Concede +3 Ataque.',
    category: 'wrists',
    price: 0,
    minLevel: 1,
    atk: 3,
    icon: '🤜',
  },
  {
    id: 'bracadeiras_combate',
    name: 'Braçadeiras de Combate',
    description: 'Braçadeiras reforçadas para corpo a corpo. Concede +6 Ataque e +2 Defesa.',
    category: 'wrists',
    price: 0,
    minLevel: 1,
    atk: 6,
    def: 2,
    icon: '🥊',
  },
  {
    id: 'manoplas_combate_saiyajin',
    name: 'Manoplas de Combate Saiyajin',
    description: 'Manoplas articuladas para absorver impacto. Concede +10 Ataque e +5 Defesa.',
    category: 'wrists',
    price: 0,
    minLevel: 1,
    atk: 10,
    def: 5,
    icon: '🧤',
  },
  {
    id: 'manoplas_fluxo_ki',
    name: 'Manoplas de Fluxo de Ki',
    description: 'Canalizam energia até os punhos. Concede +13 Ataque, +4 Defesa e +8 Ki.',
    category: 'wrists',
    price: 0,
    minLevel: 1,
    atk: 13,
    def: 4,
    ki: 8,
    icon: '✨',
  },
  {
    id: 'manoplas_gravidade_divina',
    name: 'Manoplas de Gravidade Divina',
    description: 'Manoplas de elite para golpes sob gravidade extrema. Concede +18 Ataque, +10 Defesa e +8 Ki.',
    category: 'wrists',
    price: 0,
    minLevel: 1,
    atk: 18,
    def: 10,
    ki: 8,
    icon: '💥',
  },

  // Pernas
  {
    id: 'calcas_treinamento',
    name: 'Calças de Treinamento',
    description: 'Calças resistentes para treino diário. Concede +3 Defesa e +1 Velocidade.',
    category: 'legs',
    price: 0,
    minLevel: 1,
    def: 3,
    spd: 1,
    icon: '👖',
  },
  {
    id: 'calcas_reforcadas',
    name: 'Calças Reforçadas',
    description: 'Tecido reforçado com fibras de patrulha. Concede +5 Defesa e +3 Velocidade.',
    category: 'legs',
    price: 0,
    minLevel: 1,
    def: 5,
    spd: 3,
    icon: '🥋',
  },
  {
    id: 'calcas_gravidade',
    name: 'Calças de Gravidade',
    description: 'Pesos distribuídos fortalecem a base do lutador. Concede +8 Defesa e +5 Velocidade.',
    category: 'legs',
    price: 0,
    minLevel: 1,
    def: 8,
    spd: 5,
    icon: '⚖️',
  },
  {
    id: 'calcas_fluxo_ki',
    name: 'Calças de Fluxo de Ki',
    description: 'Canais energéticos reduzem a resistência ao movimento. Concede +12 Defesa, +8 Velocidade e +4 Ki.',
    category: 'legs',
    price: 0,
    minLevel: 1,
    def: 12,
    spd: 8,
    ki: 4,
    icon: '🌌',
  },
  {
    id: 'calcas_gravidade_divina',
    name: 'Calças de Gravidade Divina',
    description: 'Proteção inferior de elite para campos extremos. Concede +18 Defesa, +12 Velocidade e +6 Ki.',
    category: 'legs',
    price: 0,
    minLevel: 1,
    def: 18,
    spd: 12,
    ki: 6,
    icon: '🌠',
  },

  // Botas
  {
    id: 'botas_treinamento',
    name: 'Botas de Treinamento',
    description: 'Botas leves de sola aderente. Concede +3 Velocidade.',
    category: 'boots',
    price: 0,
    minLevel: 1,
    spd: 3,
    icon: '👟',
  },
  {
    id: 'botas_reforcadas',
    name: 'Botas Reforçadas',
    description: 'Botas protegidas para terreno hostil. Concede +6 Velocidade e +2 Defesa.',
    category: 'boots',
    price: 0,
    minLevel: 1,
    spd: 6,
    def: 2,
    icon: '🥾',
  },
  {
    id: 'botas_gravidade_10x',
    name: 'Botas de Gravidade 10x',
    description: 'Pesos compactos treinam arrancadas e chutes. Concede +9 Velocidade, +4 Ataque e +3 Defesa.',
    category: 'boots',
    price: 0,
    minLevel: 1,
    spd: 9,
    atk: 4,
    def: 3,
    icon: '🏋️',
  },
  {
    id: 'botas_propulsao_ki',
    name: 'Botas de Propulsão de Ki',
    description: 'Micropropulsores de Ki para arrancadas instantâneas. Concede +12 Velocidade e +6 Ki.',
    category: 'boots',
    price: 0,
    minLevel: 1,
    spd: 12,
    ki: 6,
    icon: '🚀',
  },
  {
    id: 'botas_gravidade_divina',
    name: 'Botas de Gravidade Divina',
    description: 'Botas de elite com propulsão estabilizada. Concede +18 Velocidade, +10 Ki e +5 Ataque.',
    category: 'boots',
    price: 0,
    minLevel: 1,
    spd: 18,
    ki: 10,
    atk: 5,
    icon: '☄️',
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
    id: 'blueprint_propulsao_ki',
    name: 'Projeto de Propulsão de Ki',
    description: 'Projeto obrigatório das Botas de Propulsão de Ki.',
    tier: 4,
    icon: '🚀',
    outputItemId: 'projeto_propulsao_ki',
    outputQuantity: 1,
    outputKind: 'stack',
    costZeni: 1800,
    baseDurationMin: 150,
    requiresAcademic: true,
    professionRequirements: [{ professionId: 'academico', level: CRAFT_TIER_PROFESSION_LEVEL[4] }],
    ingredients: [
      { itemId: 'papel_pergaminho', quantity: 3 },
      { itemId: 'tinta_arcana', quantity: 2 },
      { itemId: 'fragmento_tomo_ancestral', quantity: 1 },
      { itemId: 'microchip_controle', quantity: 2 },
      { itemId: 'pesos_gravidade_10x', quantity: 1 },
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
    ingredients: [
      { itemId: 'erva_medicinal', quantity: 2 },
      { itemId: 'liga_metais_leves', quantity: 1 },
    ],
  },
  {
    id: 'radar_dragao_basico',
    name: 'Radar do Dragão Básico',
    description: 'Acessório equipável: +2 p.p. de chance de encontrar uma Esfera do Dragão ao concluir um turno de profissão.',
    tier: 2,
    icon: '📟',
    outputItemId: 'radar_dragao_basico',
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
    id: 'bandana_foco_ki',
    name: 'Bandana de Foco de Ki',
    description: 'Equipamento de cabeça que concede +3 Ki.',
    tier: 1,
    icon: '🎗️',
    outputItemId: 'bandana_foco_ki',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 180,
    baseDurationMin: 12,
    ingredients: [
      { itemId: 'faixa_pressao', quantity: 1 },
      { itemId: 'papel_pergaminho', quantity: 1 },
    ],
  },
  {
    id: 'bracadeiras_combate',
    name: 'Braçadeiras de Combate',
    description: 'Equipamento de punhos que concede +6 Ataque e +2 Defesa.',
    tier: 2,
    icon: '🥊',
    outputItemId: 'bracadeiras_combate',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 650,
    baseDurationMin: 35,
    professionRequirements: [{ professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[2] }],
    ingredients: [
      { itemId: 'faixa_pressao', quantity: 2 },
      { itemId: 'fibra_reforcada', quantity: 2 },
    ],
  },
  {
    id: 'calcas_gravidade',
    name: 'Calças de Gravidade',
    description: 'Equipamento de pernas que concede +8 Defesa e +5 Velocidade.',
    tier: 3,
    icon: '👖',
    outputItemId: 'calcas_gravidade',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 3200,
    baseDurationMin: 150,
    professionRequirements: [
      { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[3] },
      { professionId: 'policial', level: CRAFT_TIER_PROFESSION_LEVEL[3] },
    ],
    ingredients: [
      { itemId: 'kevlar_alienigena', quantity: 3 },
      { itemId: 'pesos_gravidade_10x', quantity: 2 },
      { itemId: 'planta_blindagem_flexivel', quantity: 1 },
    ],
  },
  {
    id: 'botas_propulsao_ki',
    name: 'Botas de Propulsão de Ki',
    description: 'Equipamento de botas que concede +12 Velocidade e +6 Ki.',
    tier: 4,
    icon: '🥾',
    outputItemId: 'botas_propulsao_ki',
    outputQuantity: 1,
    outputKind: 'player_item',
    costZeni: 6500,
    baseDurationMin: 300,
    professionRequirements: [
      { professionId: 'cientista', level: CRAFT_TIER_PROFESSION_LEVEL[4] },
      { professionId: 'atleta', level: CRAFT_TIER_PROFESSION_LEVEL[4] },
    ],
    ingredients: [
      { itemId: 'microchip_controle', quantity: 4 },
      { itemId: 'pesos_gravidade_10x', quantity: 3 },
      { itemId: 'fluido_recuperacao_extrema', quantity: 1 },
      { itemId: 'projeto_propulsao_ki', quantity: 1 },
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
