import type {
  Enemy,
  ProfessionDef,
  ProfessionRankRewards,
  ShopItem,
} from '../types';

// =====================================================================
// PROFISSÕES (v0.6 — substituem as antigas missões temporizadas)
// ---------------------------------------------------------------------
//  * 5 profissões: Agricultor, Cientista, Acadêmico, Policial e Atleta;
//  * cada trabalho dura ~1 hora e consome energia no início;
//  * 5 ranks por profissão: promoções por trabalhos concluídos
//    (3, 4, 5 e 6 conclusões por rank — 18h de dedicação para o topo);
//  * Zeni por conclusão: 300 no rank 1 → 1.500 no rank 5 (aumento
//    gradual até 5x o valor inicial, conforme especificação do usuário);
//  * bônus único de PROMOÇÃO: +1.000 / +3.000 / +9.000 / +30.000 Zeni;
//  * XP por conclusão: fração do XP exigido pelo nível ATUAL
//    (10% → 25%) — balanceado em qualquer nível de progressão.
// =====================================================================

export const PROFESSIONS: ProfessionDef[] = [
  {
    id: 'agricultor',
    name: 'Agricultor',
    description:
      'Cultive as terras férteis do Grande Vale. Colheitas generosas alimentam cidades inteiras — e enchem sua carteira.',
    icon: '🌾',
    energyCost: 6,
    durationMin: 60,
    rankNames: ['Lavrador', 'Fazendeiro', 'Agrônomo', 'Mestre Rural', 'Lenda dos Campos'],
  },
  {
    id: 'cientista',
    name: 'Cientista',
    description:
      'Pesquise na Corporação Cápsula: cápsulas, reatores e invenções que mudam o mundo. A ciência paga bem.',
    icon: '🔬',
    energyCost: 6,
    durationMin: 60,
    rankNames: ['Assistente', 'Pesquisador', 'Doutor', 'Cientista-Chefe', 'Gênio Universal'],
  },
  {
    id: 'academico',
    name: 'Acadêmico',
    description:
      'Estude na Grande Biblioteca Universal. Conhecimento antigo, mapas estelares e segredos de guerra valem ouro.',
    icon: '🎓',
    energyCost: 6,
    durationMin: 60,
    rankNames: ['Estudante', 'Bacharel', 'Mestre', 'Doutor', 'Reitor'],
  },
  {
    id: 'policial',
    name: 'Policial',
    description:
      'Patrulhe as cidades pela Defesa da Terra. Turnos longos, bandidos ousados e um salário que cresce com a patente.',
    icon: '👮',
    energyCost: 6,
    durationMin: 60,
    rankNames: ['Recruta', 'Soldado', 'Sargento', 'Capitão', 'Comandante'],
  },
  {
    id: 'atleta',
    name: 'Atleta',
    description:
      'Treine no Ginásio do Torneio Mundial: exibições, patrocínios e medalhas para quem supera os próprios limites.',
    icon: '🏃',
    energyCost: 6,
    durationMin: 60,
    rankNames: ['Novato', 'Amador', 'Profissional', 'Campeão', 'Lenda Olímpica'],
  },
];

/** Recompensas por rank (índice = rank - 1). Especificação v0.6 do usuário. */
export const PROFESSION_RANKS: ProfessionRankRewards[] = [
  // rank 1 (inicial)
  { zeni: 300, xpPct: 0.1, dragonBallChance: 0.03, completionsToPromote: 3, promotionBonus: 0 },
  // rank 2 — promoção +1.000
  { zeni: 450, xpPct: 0.14, dragonBallChance: 0.04, completionsToPromote: 4, promotionBonus: 1_000 },
  // rank 3 — promoção +3.000
  { zeni: 675, xpPct: 0.18, dragonBallChance: 0.06, completionsToPromote: 5, promotionBonus: 3_000 },
  // rank 4 — promoção +9.000
  { zeni: 1010, xpPct: 0.22, dragonBallChance: 0.08, completionsToPromote: 6, promotionBonus: 9_000 },
  // rank 5 (última promoção) — +30.000 e 5x o Zeni inicial
  { zeni: 1500, xpPct: 0.25, dragonBallChance: 0.1, completionsToPromote: 0, promotionBonus: 30_000 },
];

export const PROFESSION_MAX_RANK = PROFESSION_RANKS.length;

export function getProfession(id: string): ProfessionDef | undefined {
  return PROFESSIONS.find((p) => p.id === id);
}

/** Título do rank atual da profissão (exibido na UI). */
export function professionRankTitle(def: ProfessionDef, rank: number): string {
  const idx = Math.min(PROFESSION_MAX_RANK, Math.max(1, Math.floor(rank))) - 1;
  return def.rankNames[idx];
}

/** XP exato de uma conclusão no rank dado (fração do nível ATUAL). */
export function professionXpReward(rank: number, playerLevel: number): number {
  const idx = Math.min(PROFESSION_MAX_RANK, Math.max(1, Math.floor(rank))) - 1;
  return Math.max(1, Math.ceil(xpToNextLevel(playerLevel) * PROFESSION_RANKS[idx].xpPct));
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
  // que se ganha jogando: missões diárias, conquistas e boss mundial.)
  { id: 'bandana_treino', name: 'Bandana de Treino', description: 'Enrole na testa, grite bem alto e sinta a força de mil treinos.', category: 'training', price: 15, currency: 'crystal', minLevel: 1, trainBonus: { strength: 1 }, icon: '🎗️' },
  { id: 'pulseiras_chumbo', name: 'Pulseiras de Chumbo', description: 'Peso clássico de quem leva a sério. Ajudam a suportar qualquer golpe.', category: 'training', price: 20, currency: 'crystal', minLevel: 2, trainBonus: { defense: 1 }, icon: '⛓️' },
  { id: 'tenes_ponderados', name: 'Tênis Ponderados', description: 'Corra com esses pesos nos pés e o mundo parecerá lento depois.', category: 'training', price: 20, currency: 'crystal', minLevel: 2, trainBonus: { speed: 1 }, icon: '👟' },
  { id: 'rosario_mental', name: 'Rosário do Treino Mental', description: 'Foque a mente, sinta o Ki fluir. Meditar também é treinar.', category: 'training', price: 20, currency: 'crystal', minLevel: 2, trainBonus: { ki: 1 }, icon: '📿' },
  { id: 'gi_ponderado', name: 'Gi Ponderado do Mestre Kame', description: 'A casca de tartaruga nas costas: o treino que forjou lendas.', category: 'training', price: 60, currency: 'crystal', minLevel: 6, trainBonus: { all: 1 }, icon: '🐢' },
  { id: 'sala_gravidade', name: 'Sala de Gravidade (Cápsula)', description: 'Gravidade 100x da Terra dentro de uma cápsula da Corporação Cápsula.', category: 'training', price: 180, currency: 'crystal', minLevel: 12, trainBonus: { all: 2 }, icon: '🛸' },
  { id: 'sala_tempo_capsula', name: 'Sala do Tempo Pessoal (Cápsula)', description: 'Um dia aqui, um ano lá dentro. O investimento definitivo do guerreiro.', category: 'training', price: 450, currency: 'crystal', minLevel: 18, trainBonus: { all: 3 }, icon: '⏳' },
];

export function getItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
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
