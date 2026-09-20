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
  // Armas
  { id: 'bastao_liga_leve', name: 'Bastão de Liga Leve', description: 'Arma simples e resistente feita para combate corpo a corpo.', category: 'weapon', price: 0, minLevel: 1, atk: 5, icon: '🔧' },
  { id: 'lamina_carbono', name: 'Lâmina de Carbono', description: 'Lâmina leve de carbono que favorece golpes rápidos.', category: 'weapon', price: 0, minLevel: 1, atk: 10, spd: 2, icon: '🗡️' },
  { id: 'lanca_saiyajin', name: 'Lança Saiyajin', description: 'Arma alienígena de impacto com canalização básica de Ki.', category: 'weapon', price: 0, minLevel: 1, atk: 18, ki: 4, icon: '🔱' },
  { id: 'lamina_ki_condensado', name: 'Lâmina de Ki Condensado', description: 'Arma avançada que estabiliza Ki ao longo do fio.', category: 'weapon', price: 0, minLevel: 1, atk: 26, ki: 8, icon: '⚔️' },
  { id: 'espada_gravidade_100x', name: 'Espada de Gravidade 100x', description: 'Arma endgame forjada para manter corte e energia sob gravidade extrema.', category: 'weapon', price: 0, minLevel: 1, atk: 38, ki: 12, icon: '🌌' },

  // Torso
  { id: 'colete_fibra_reforcada', name: 'Colete de Fibra Reforçada', description: 'Proteção básica de torso feita com fibras profissionais.', category: 'armor', price: 0, minLevel: 1, def: 5, icon: '🥋' },
  { id: 'colete_carbono_tatico', name: 'Colete de Carbono Tático', description: 'Colete rígido sem perder completamente a mobilidade.', category: 'armor', price: 0, minLevel: 1, def: 10, spd: 2, icon: '🦺' },
  { id: 'armadura_fluxo_ki', name: 'Armadura de Fluxo de Ki', description: 'Armadura avançada que reforça defesa e circulação de Ki.', category: 'armor', price: 0, minLevel: 1, def: 28, ki: 10, icon: '🔷' },
  { id: 'armadura_gravidade_100x', name: 'Armadura de Gravidade 100x', description: 'Blindagem endgame preparada para pressão gravitacional extrema.', category: 'armor', price: 0, minLevel: 1, def: 45, ki: 12, icon: '🛡️' },

  // Acessórios
  { id: 'pingente_foco_ki', name: 'Pingente de Foco de Ki', description: 'Pequeno foco artesanal que ajuda a estabilizar energia.', category: 'accessory', price: 0, minLevel: 1, ki: 3, icon: '📿' },
  { id: 'modulo_reacao_saiyajin', name: 'Módulo de Reação Saiyajin', description: 'Sensor compacto que melhora reação e leitura de Ki.', category: 'accessory', price: 0, minLevel: 1, ki: 6, spd: 5, icon: '📟' },
  { id: 'nucleo_fluxo_ki', name: 'Núcleo de Fluxo de Ki', description: 'Núcleo avançado que amplia Ki e velocidade de resposta.', category: 'accessory', price: 0, minLevel: 1, ki: 12, spd: 8, icon: '💠' },
  { id: 'nucleo_gravidade_100x', name: 'Núcleo de Gravidade 100x', description: 'Acessório endgame que estabiliza Ki e movimento em campos extremos.', category: 'accessory', price: 0, minLevel: 1, atk: 6, ki: 16, spd: 12, icon: '🌀' },

  // Cabeça
  { id: 'bandana_oficina', name: 'Bandana Reforçada', description: 'Proteção leve de Oficina que estabiliza o fluxo de Ki.', category: 'head', price: 0, minLevel: 1, def: 2, ki: 2, icon: '🎗️' },
  { id: 'visor_scouter_tatico', name: 'Visor Scouter Tático', description: 'Visor calibrado para leitura de Ki e reação rápida.', category: 'head', price: 0, minLevel: 1, ki: 5, spd: 2, icon: '🕶️' },
  { id: 'elmo_combate_saiyajin', name: 'Elmo de Combate Saiyajin', description: 'Elmo flexível com blindagem alienígena e leitura de energia.', category: 'head', price: 0, minLevel: 1, def: 8, ki: 4, icon: '🪖' },
  { id: 'visor_fluxo_ki', name: 'Visor de Fluxo de Ki', description: 'Módulo avançado que canaliza Ki e acelera a leitura de movimentos.', category: 'head', price: 0, minLevel: 1, ki: 12, spd: 5, icon: '🔷' },
  { id: 'elmo_gravidade_100x', name: 'Elmo de Gravidade 100x', description: 'Elmo endgame projetado para combate sob gravidade extrema.', category: 'head', price: 0, minLevel: 1, def: 16, ki: 8, icon: '🌀' },

  // Punhos
  { id: 'munhequeiras_reforcadas', name: 'Munhequeiras Reforçadas', description: 'Suporte de impacto para golpes físicos repetidos.', category: 'wrists', price: 0, minLevel: 1, atk: 3, icon: '🥊' },
  { id: 'luvas_impacto_carbono', name: 'Luvas de Impacto de Carbono', description: 'Luvas táticas com placas de carbono para golpes mais pesados.', category: 'wrists', price: 0, minLevel: 1, atk: 6, def: 2, icon: '🧤' },
  { id: 'braceletes_saiyajin', name: 'Braceletes Saiyajin', description: 'Braceletes de combate que reforçam ataque e guarda.', category: 'wrists', price: 0, minLevel: 1, atk: 10, def: 4, icon: '💪' },
  { id: 'manoplas_ki_condensado', name: 'Manoplas de Ki Condensado', description: 'Manoplas capazes de condensar Ki junto ao impacto físico.', category: 'wrists', price: 0, minLevel: 1, atk: 14, ki: 6, icon: '💥' },
  { id: 'manoplas_gravidade_100x', name: 'Manoplas de Gravidade 100x', description: 'Manoplas para golpes devastadores em gravidade extrema.', category: 'wrists', price: 0, minLevel: 1, atk: 20, def: 8, icon: '🌌' },

  // Pernas
  { id: 'calca_treino_reforcada', name: 'Calça de Treino Reforçada', description: 'Tecido reforçado para absorver impactos nas pernas.', category: 'legs', price: 0, minLevel: 1, def: 3, icon: '👖' },
  { id: 'calca_compressao_tatica', name: 'Calça de Compressão Tática', description: 'Compressão muscular e fibras resistentes para manter mobilidade.', category: 'legs', price: 0, minLevel: 1, def: 6, spd: 2, icon: '🥋' },
  { id: 'grevas_saiyajin', name: 'Grevas Saiyajin', description: 'Proteção de pernas alienígena, leve e resistente.', category: 'legs', price: 0, minLevel: 1, def: 10, spd: 4, icon: '🦿' },
  { id: 'calca_fluxo_ki', name: 'Calça de Fluxo de Ki', description: 'Circuitos internos distribuem Ki para reforçar a defesa.', category: 'legs', price: 0, minLevel: 1, def: 14, ki: 5, icon: '🔹' },
  { id: 'calca_gravidade_100x', name: 'Calça de Gravidade 100x', description: 'Blindagem de pernas preparada para pressão gravitacional extrema.', category: 'legs', price: 0, minLevel: 1, def: 20, spd: 8, icon: '🌠' },

  // Botas
  { id: 'botas_corrida_reforcadas', name: 'Botas de Corrida Reforçadas', description: 'Botas leves com sola de alta tração.', category: 'boots', price: 0, minLevel: 1, spd: 3, icon: '🥾' },
  { id: 'botas_propulsao_tatica', name: 'Botas de Propulsão Tática', description: 'Micropropulsores ajudam em arrancadas e mudanças de direção.', category: 'boots', price: 0, minLevel: 1, spd: 6, def: 2, icon: '👢' },
  { id: 'botas_saiyajin_craft', name: 'Botas Saiyajin', description: 'Botas de combate alienígenas resistentes sem sacrificar velocidade.', category: 'boots', price: 0, minLevel: 1, spd: 10, def: 4, icon: '🥾' },
  { id: 'botas_impulso_ki', name: 'Botas de Impulso de Ki', description: 'Canalizam Ki para acelerar deslocamentos explosivos.', category: 'boots', price: 0, minLevel: 1, spd: 14, ki: 5, icon: '💨' },
  { id: 'botas_gravidade_100x', name: 'Botas de Gravidade 100x', description: 'Botas endgame que convertem resistência gravitacional em velocidade e impacto.', category: 'boots', price: 0, minLevel: 1, spd: 20, atk: 8, icon: '🚀' },
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
    id: 'foco_combate_tatico',
    name: 'Foco de Combate Tático',
    description: 'Acessório calibrado para estabilizar a defesa e a velocidade durante o combate.',
    category: 'accessory',
    price: 0,
    minLevel: 1,
    def: 2,
    spd: 2,
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
  ...SLOT_CRAFTED_ITEMS,
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
