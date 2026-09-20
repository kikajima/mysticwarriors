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
//  * Zeni, atributo, horas, comum garantido e Esfera mantêm a regra base;
//  * atributo respeita STAT_CAP=999 no servidor;
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
  { level: 1, hoursInLevel: 40, cumulativeHours: 40, zeniPerHour: 300, attributeMilliPerHour: 1000, xpPctPerHour: 0.010, dragonBallChance: 0.030, rareChance: 0.10 },
  { level: 2, hoursInLevel: 60, cumulativeHours: 100, zeniPerHour: 450, attributeMilliPerHour: 1300, xpPctPerHour: 0.010, dragonBallChance: 0.040, rareChance: 0.10 },
  { level: 3, hoursInLevel: 90, cumulativeHours: 190, zeniPerHour: 675, attributeMilliPerHour: 1700, xpPctPerHour: 0.015, dragonBallChance: 0.050, rareChance: 0.13 },
  { level: 4, hoursInLevel: 135, cumulativeHours: 325, zeniPerHour: 1010, attributeMilliPerHour: 2200, xpPctPerHour: 0.015, dragonBallChance: 0.060, rareChance: 0.13 },
  { level: 5, hoursInLevel: 200, cumulativeHours: 525, zeniPerHour: 1500, attributeMilliPerHour: 2800, xpPctPerHour: 0.020, dragonBallChance: 0.070, rareChance: 0.16 },
  { level: 6, hoursInLevel: 300, cumulativeHours: 825, zeniPerHour: 2100, attributeMilliPerHour: 3500, xpPctPerHour: 0.020, dragonBallChance: 0.080, rareChance: 0.16 },
  { level: 7, hoursInLevel: 450, cumulativeHours: 1275, zeniPerHour: 2900, attributeMilliPerHour: 4400, xpPctPerHour: 0.025, dragonBallChance: 0.085, rareChance: 0.20 },
  { level: 8, hoursInLevel: 675, cumulativeHours: 1950, zeniPerHour: 4000, attributeMilliPerHour: 5500, xpPctPerHour: 0.025, dragonBallChance: 0.090, rareChance: 0.20 },
  { level: 9, hoursInLevel: 1000, cumulativeHours: 2950, zeniPerHour: 5500, attributeMilliPerHour: 6800, xpPctPerHour: 0.030, dragonBallChance: 0.095, rareChance: 0.22 },
  { level: 10, hoursInLevel: 1500, cumulativeHours: 4450, zeniPerHour: 7500, attributeMilliPerHour: 8500, xpPctPerHour: 0.035, dragonBallChance: 0.100, rareChance: 0.25 },
];

export const PROFESSION_MAX_LEVEL = 10;
export const PROFESSION_MASTERY_HOURS = 4_450;

export const PROFESSION_SHIFTS: ProfessionShiftDef[] = [
  { hours: 1, efficiency: 1.00 },
  { hours: 2, efficiency: 1.05 },
  { hours: 4, efficiency: 1.15 },
  { hours: 8, efficiency: 1.30 },
];

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
    id: 'saibaman',
    name: 'Saibaman Verde',
    taunt: '"Kyakyakyaka!" — ele pula feito grilo louco',
    level: 1,
    strength: 12,
    defense: 8,
    speed: 14,
    ki: 6,
    zeniReward: 70,
    xpReward: 45,
    color: 'from-lime-600 to-emerald-800',
    emoji: '🌱',
  },
  {
    id: 'bandido',
    name: 'Bandido do Deserto',
    taunt: '"Entregue a carteira, moleque!" — ele rola o punho',
    level: 4,
    strength: 26,
    defense: 16,
    speed: 20,
    ki: 10,
    zeniReward: 220,
    xpReward: 150,
    color: 'from-orange-700 to-yellow-800',
    emoji: '🗡️',
  },
  {
    id: 'soldado_freeza',
    name: 'Soldado de Freeza',
    taunt: '"O Senhor Freeza vai transformar você em poeira!"',
    level: 8,
    strength: 48,
    defense: 30,
    speed: 32,
    ki: 22,
    zeniReward: 520,
    xpReward: 340,
    color: 'from-violet-800 to-slate-800',
    emoji: '👽',
  },
  {
    id: 'androide_proto',
    name: 'Androide Protótipo',
    taunt: '"ALVO TRAVADO. ELIMINAR." — os olhos brilham em vermelho',
    level: 12,
    strength: 76,
    defense: 52,
    speed: 58,
    ki: 40,
    zeniReward: 950,
    xpReward: 620,
    color: 'from-sky-700 to-slate-900',
    emoji: '🤖',
  },
  {
    id: 'cell_jr',
    name: 'Cell Júnior',
    taunt: '"Hihihi! Brinca comigo!" — ele ri com a voz do Cell',
    level: 17,
    strength: 118,
    defense: 84,
    speed: 95,
    ki: 70,
    zeniReward: 1700,
    xpReward: 1150,
    color: 'from-teal-600 to-emerald-900',
    emoji: '🪲',
  },
  {
    id: 'spopovich',
    name: 'Guerreiro da Org. do Mal',
    taunt: '"Hehehe... o Babidi me deu um presente." — energia negra escorre',
    level: 22,
    strength: 165,
    defense: 120,
    speed: 108,
    ki: 95,
    zeniReward: 2600,
    xpReward: 1800,
    color: 'from-fuchsia-800 to-purple-950',
    emoji: '💀',
  },
  {
    id: 'freeza',
    name: 'Freeza — Forma Final',
    taunt: '"Vou te picar até virar purê." — a cauda chicoteia o ar',
    level: 28,
    strength: 235,
    defense: 175,
    speed: 165,
    ki: 150,
    zeniReward: 4200,
    xpReward: 2900,
    color: 'from-purple-700 to-indigo-950',
    emoji: '👑',
  },
  {
    id: 'dabura',
    name: 'Dabura, Rei Demônio',
    taunt: '"Sua saliva virará pedra... literalmente." — ele lambe a lâmina',
    level: 35,
    strength: 330,
    defense: 250,
    speed: 225,
    ki: 210,
    zeniReward: 6500,
    xpReward: 4600,
    color: 'from-red-800 to-rose-950',
    emoji: '😈',
  },
  {
    id: 'broly',
    name: 'Broly, o Lendário',
    taunt: '"KAKAROTO!!!" — o planeta inteiro treme',
    level: 45,
    strength: 480,
    defense: 360,
    speed: 300,
    ki: 290,
    zeniReward: 11000,
    xpReward: 8200,
    color: 'from-green-600 to-emerald-950',
    emoji: '⚡',
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

export const SHOP_ITEMS: ShopItem[] = [
  // Armas (ataque físico)
  { id: 'luvas', name: 'Luvas de Treino', description: 'Luvas de couro surradas do Mestre Kame. Melhor que soco nu.', category: 'weapon', price: 300, minLevel: 1, atk: 6, icon: '🥊' },
  { id: 'bastao', name: 'Bastão Sagrado', description: 'O bastão vermelho que cresce infinitamente. Alcance é tudo.', category: 'weapon', price: 900, minLevel: 3, atk: 14, icon: '🪄' },
  { id: 'katana', name: 'Katana do Gohan', description: 'A lâmina que cortou a armadura de um dinossauro de uma vez só.', category: 'weapon', price: 2500, minLevel: 6, atk: 26, icon: '🗡️' },
  { id: 'espada_z', name: 'Espada Z', description: 'A lendária espada sagrada do mundo dos Kaioshins. Vai quebrar... talvez.', category: 'weapon', price: 6000, minLevel: 10, atk: 42, icon: '⚔️' },
  { id: 'punho_dragao', name: 'Punho do Dragão', description: 'Um soco tão forte que invoca um dragão dourado de fogo. Sério.', category: 'weapon', price: 15000, minLevel: 15, atk: 70, icon: '🐲' },
  { id: 'energia_infinita', name: 'Lâmina do Ki Puro', description: 'Forjada com a energia de uma supernova. Corta a própria gravidade.', category: 'weapon', price: 40000, minLevel: 22, atk: 110, icon: '💫' },
  // Armaduras (defesa física)
  { id: 'gi', name: 'Gi de Batalha Laranja', description: 'O uniforme clássico da Escola da Tartaruga. Leve e resistente.', category: 'armor', price: 250, minLevel: 1, def: 5, icon: '🥋' },
  { id: 'armadura_saiyajin', name: 'Armadura Saiyajin', description: 'Elástica, resistente e estilosa. Padrão do exército de Vegeta.', category: 'armor', price: 800, minLevel: 3, def: 12, icon: '🛡️' },
  { id: 'armadura_freeza', name: 'Armadura de Elite Freeza', description: 'Technology do Império de Freeza. Absorve impactos mortais.', category: 'armor', price: 2200, minLevel: 6, def: 24, icon: '🦺' },
  { id: 'traje_ponderado', name: 'Traje Ponderado', description: 'Roupas com pesos escondidos. Tire-as e sinta a diferença.', category: 'armor', price: 5500, minLevel: 10, def: 40, icon: '🧥' },
  { id: 'armadura_kaio', name: 'Armadura do Grande Kaio', description: 'Benzida pelos próprios deuses do universo 7.', category: 'armor', price: 14000, minLevel: 15, def: 65, icon: '✨' },
  { id: 'manto_kaioshin', name: 'Manto do Kaioshin', description: 'Tecido dimensional que desvia golpes para outro universo.', category: 'armor', price: 38000, minLevel: 22, def: 100, icon: '👑' },
  // Acessórios (velocidade + Ki)
  { id: 'botas', name: 'Botas Ponderadas', description: 'Cada passo é um treino. Fora delas, você voa.', category: 'accessory', price: 400, minLevel: 1, spd: 8, icon: '🥾' },
  { id: 'bandana', name: 'Bandana do Guerreiro', description: 'Ninguém segura um guerreiro de bandana. Ninguém.', category: 'accessory', price: 600, minLevel: 2, ki: 6, icon: '🎀' },
  { id: 'cristal_baba', name: 'Cristal de Uma Estrela', description: 'Amuleto raro que amplifica o fluxo de Ki do portador.', category: 'accessory', price: 2400, minLevel: 6, ki: 18, icon: '🔮' },
  { id: 'potara', name: 'Brinco Potara', description: 'Brincos divinos que fundem o seu Ki com o universo. Apenas um, por favor.', category: 'accessory', price: 8000, minLevel: 12, ki: 34, spd: 10, icon: '💚' },
  { id: 'coracao_dourado', name: 'Coração do Dragão Eterno', description: 'Dizem que Shenlon o cospe ao realizar um desejo impossível.', category: 'accessory', price: 22000, minLevel: 18, atk: 30, def: 30, ki: 30, spd: 30, icon: '❤️‍🔥' },
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

/** Bônus absoluto de chance de Esfera concedido pelo acessório atualmente equipado. */
export function equippedDragonBallChanceBonus(items: ItemsState): number {
  if (!items.accessory) return 0;
  return Math.max(0, getItem(items.accessory)?.dragonBallChanceBonus ?? 0);
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
export const PVP_LEVEL_RANGE = 5;

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

export const HEAL_COST_PER_HP = 3;

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
