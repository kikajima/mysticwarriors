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
    professionRequirements: [{ professionId: 'academico', level: 2 }],
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
    professionRequirements: [{ professionId: 'academico', level: 4 }],
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
    professionRequirements: [{ professionId: 'academico', level: 6 }],
    ingredients: [
      { itemId: 'papel_pergaminho', quantity: 3 },
      { itemId: 'tinta_arcana', quantity: 2 },
      { itemId: 'fragmento_tomo_ancestral', quantity: 1 },
      { itemId: 'erva_medicinal', quantity: 1 },
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
    requiresAcademic: true,
    professionRequirements: [{ professionId: 'academico', level: 8 }],
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
    professionRequirements: [{ professionId: 'cientista', level: 2 }],
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
      { professionId: 'policial', level: 4 },
      { professionId: 'cientista', level: 4 },
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
      { professionId: 'agricultor', level: 6 },
      { professionId: 'atleta', level: 6 },
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
      { professionId: 'cientista', level: 8 },
      { professionId: 'atleta', level: 8 },
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
