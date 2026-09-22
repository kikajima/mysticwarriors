import type { TechniqueDef, StrategyDef, StrategyId, TrainingMaster } from '../types';

// =====================================================================
// TÉCNICAS — data-driven. A engine NÃO conhece nomes de técnicas:
// lê apenas os campos (type, category, power, kiCost, effects...).
// Para criar uma técnica nova, basta adicionar um objeto aqui.
//
// v0.4 — RECALIBRAÇÃO: `power` multiplica o PODER BRUTO do golpe (antes
// da defesa e do soft cap de mitigação). Valores menores que os antigos
// (que multiplicavam o dano pós-defesa). O Ki é consumido NO LANÇAMENTO
// — mesmo se o defensor esquivar (regra uniforme e anunciada).
// `accuracy` POSITIVO reduz a chance de esquiva do defensor; NEGATIVO
// aumenta (técnicas telegrafadas). `defensePierce` reduz a DEFESA
// EFETIVA do alvo (fração 0–0.8).
// =====================================================================

export const TECHNIQUES: TechniqueDef[] = [
  {
    id: 'rogafufuken',
    name: 'Garras do Lobo Astral',
    description: 'Sequência curta de golpes angulados inspirada na caça em matilha dos Solaris.',
    type: 'physical',
    category: 'basic',
    power: 1.25,
    kiCost: 10,
    accuracy: 0,
    minLevel: 1,
    price: 600,
    icon: '🐺',
  },
  {
    id: 'megaton_punch',
    name: 'Impacto de Aço',
    description: 'Um golpe vanguardiano direto, treinado para converter toda a base corporal em impacto.',
    type: 'physical',
    category: 'basic',
    power: 1.3,
    kiCost: 12,
    accuracy: 0,
    minLevel: 2,
    price: 900,
    icon: '🥊',
  },
  {
    id: 'kamehameha',
    name: 'Onda de Aether',
    description: 'Fluxo contínuo de Aether comprimido entre as mãos e liberado como uma frente de energia estável.',
    type: 'energy',
    category: 'basic',
    power: 1.35,
    kiCost: 18,
    accuracy: 0,
    minLevel: 3,
    price: 1500,
    icon: '🌊',
  },
  {
    id: 'kienzan',
    name: 'Disco de Ruptura',
    description: 'Lâmina circular de Aether de alta perfuração: atravessa parte da defesa, mas exige trajetória previsível.',
    type: 'energy',
    category: 'basic',
    power: 1.4,
    kiCost: 20,
    accuracy: -0.05,
    effects: { defensePierce: 0.35 },
    minLevel: 5,
    price: 3000,
    icon: '💿',
  },
  {
    id: 'dodonpa',
    name: 'Lança Fotônica',
    description: 'Feixe estreito de Aether lançado pela ponta dos dedos com foco em velocidade e precisão.',
    type: 'energy',
    category: 'basic',
    power: 1.32,
    kiCost: 16,
    accuracy: 0.05,
    minLevel: 6,
    price: 3500,
    icon: '☝️',
  },
  {
    id: 'kikoho',
    name: 'Prisma de Pressão',
    description: 'Uma geometria de contenção comprime Aether em um pulso frontal de alta pressão.',
    type: 'energy',
    category: 'advanced',
    power: 1.45,
    kiCost: 28,
    accuracy: 0,
    minLevel: 10,
    price: 9000,
    icon: '🔺',
  },
  {
    id: 'makankosappo',
    name: 'Espiral Penetrante',
    description: 'Dois fluxos helicoidais de Aether se entrelaçam para perfurar blindagens e barreiras energéticas.',
    type: 'energy',
    category: 'advanced',
    power: 1.5,
    kiCost: 32,
    accuracy: 0.05,
    effects: { defensePierce: 0.3 },
    minLevel: 14,
    price: 18000,
    icon: '🌀',
  },
  {
    id: 'big_bang',
    name: 'Nova de Caelum',
    description: 'Uma esfera instável de Aether é comprimida na palma e detonada no contato com o alvo.',
    type: 'energy',
    category: 'advanced',
    power: 1.55,
    kiCost: 36,
    accuracy: 0,
    minLevel: 17,
    price: 28000,
    icon: '💥',
  },
  {
    id: 'kaioken',
    name: 'Sobrecarga Carmesim',
    description: 'O usuário força músculos e canais de Aether acima da margem segura para um único ataque devastador.',
    type: 'physical',
    category: 'advanced',
    power: 1.5,
    kiCost: 30,
    accuracy: 0,
    minLevel: 21,
    price: 40000,
    icon: '🔴',
  },
  {
    id: 'final_flash',
    name: 'Ruptura do Horizonte',
    description: 'Duas correntes laterais convergem em uma descarga linear capaz de iluminar o horizonte por quilômetros.',
    type: 'energy',
    category: 'supreme',
    power: 1.65,
    kiCost: 45,
    accuracy: 0,
    minLevel: 20,
    price: 45000,
    icon: '⚡',
  },
  {
    id: 'genki_dama',
    name: 'Convergência do Aether',
    description: 'Aether ambiental é reunido em uma massa colossal de energia; extremamente poderosa, porém lenta de direcionar.',
    type: 'energy',
    category: 'supreme',
    power: 1.75,
    kiCost: 55,
    accuracy: -0.05,
    effects: { defensePierce: 0.3 },
    minLevel: 25,
    price: 80000,
    icon: '🌐',
  },
];

export function getTechnique(id: string): TechniqueDef | undefined {
  return TECHNIQUES.find((t) => t.id === id);
}

/** Slots válidos por categoria da técnica. */
export function slotsForCategory(category: TechniqueDef['category']): Array<'1' | '2' | '3' | 'S'> {
  return category === 'supreme' ? ['S'] : ['1', '2', '3'];
}

// ===== Mestres (NPCs que ensinam técnicas) =====

export const TRAINING_MASTERS: TrainingMaster[] = [
  {
    id: 'kame',
    name: 'Mestre Orun',
    title: 'Escola da Maré Astral',
    quote: '"Controle primeiro a respiração. Depois controle o Aether. Força sem fluxo é só desperdício."',
    location: 'Santuário da Maré, Aethel Prime',
    gradient: 'from-amber-600 to-orange-800',
    emoji: '🐢',
    techniques: ['rogafufuken', 'kamehameha'],
  },
  {
    id: 'satan',
    name: 'Brakus Vale',
    title: 'Campeão Mundial',
    quote: '"Se o público ouviu o impacto, o golpe funcionou. Se ficou em silêncio, tente de novo."',
    location: 'Distrito da Arena, Aethel Prime',
    gradient: 'from-yellow-600 to-amber-800',
    emoji: '🥊',
    techniques: ['megaton_punch'],
  },
  {
    id: 'kuririn',
    name: 'Tarin Sol',
    title: 'Veterano da Maré Astral',
    quote: '"Precisão vence força bruta quando você sabe exatamente onde cortar o fluxo."',
    location: 'Porto Celeste, Aethel Prime',
    gradient: 'from-orange-500 to-red-800',
    emoji: '🥚',
    techniques: ['kienzan'],
  },
  {
    id: 'tenshinhan',
    name: 'Sahir Venn',
    title: 'Ordem do Prisma',
    quote: '"Geometria, postura e respiração. O Aether obedece melhor quando sua mente já decidiu a forma."',
    location: 'Mosteiro Prismático, Pyros',
    gradient: 'from-emerald-600 to-teal-800',
    emoji: '👁️',
    techniques: ['dodonpa', 'kikoho'],
  },
  {
    id: 'piccolo',
    name: 'Vaelor Syl',
    title: 'Guardião Silencioso',
    quote: '"Não force o fluxo. Faça duas correntes concordarem e a blindagem do alvo deixará de importar."',
    location: 'Templo Suspenso de Sylva',
    gradient: 'from-green-700 to-emerald-900',
    emoji: '🟢',
    techniques: ['makankosappo'],
  },
  {
    id: 'vegeta',
    name: 'Kael Voran',
    title: 'Alfa da Matilha Solar',
    quote: '"A Matilha não mede potencial. Mede o que você ainda consegue fazer depois que o corpo pede para parar."',
    location: 'Câmara Gravitacional de Pyros',
    gradient: 'from-blue-700 to-slate-900',
    emoji: '👑',
    techniques: ['big_bang', 'final_flash'],
  },
  {
    id: 'rei_kai',
    name: 'Arconte Elyon',
    title: 'Guardião do Horizonte',
    quote: '"Você não cria Aether. Você o convence a convergir. Aprenda a ouvir antes de tentar comandar."',
    location: 'Observatório do Horizonte',
    gradient: 'from-amber-400 to-yellow-700',
    emoji: '🌟',
    techniques: ['kaioken', 'genki_dama'],
  },
];

// ===== Estratégias de combate =====

export const STRATEGIES: Record<StrategyId, StrategyDef> = {
  balanced: {
    id: 'balanced',
    name: 'Equilibrado',
    description: 'Alterna golpes físicos e de energia conforme a ocasião. O estilo clássico dos mestres.',
    icon: '☯️',
    damageDealtMult: 1.0,
    damageTakenMult: 1.0,
    physicalBias: 0,
    techniqueAggression: 0.18,
    dodgeBonus: 0,
  },
  aggressive: {
    id: 'aggressive',
    name: 'Agressivo',
    description: 'Tudo ou nada: causa +15% de dano, mas recebe +10% e arrisca mais técnicas.',
    icon: '🔥',
    damageDealtMult: 1.15,
    damageTakenMult: 1.1,
    physicalBias: 0,
    techniqueAggression: 0.3,
    dodgeBonus: 0,
  },
  defensive: {
    id: 'defensive',
    name: 'Defensivo',
    description: 'Postura de guarda: recebe 12% menos dano e esquiva mais, porém causa 8% menos.',
    icon: '🛡️',
    damageDealtMult: 0.92,
    damageTakenMult: 0.88,
    physicalBias: 0,
    techniqueAggression: 0.12,
    dodgeBonus: 0.03,
  },
  melee: {
    id: 'melee',
    name: 'Corpo a Corpo',
    description: 'Especialista em golpes físicos: +10% de dano corpo a corpo, evita desperdiçar Ki.',
    icon: '🥊',
    damageDealtMult: 1.0,
    damageTakenMult: 1.0,
    physicalBias: 1,
    techniqueAggression: 0.2,
    dodgeBonus: 0,
  },
  ki_specialist: {
    id: 'ki_specialist',
    name: 'Especialista em Ki',
    description: 'Canhão de energia: +20% de dano de Ki, mas golpeia mais fraco com o corpo (-15%).',
    icon: '✨',
    damageDealtMult: 1.0,
    damageTakenMult: 1.0,
    physicalBias: -1,
    techniqueAggression: 0.25,
    dodgeBonus: 0,
  },
};

export const STRATEGY_LIST = Object.values(STRATEGIES);

export function getStrategy(id: string): StrategyDef {
  return STRATEGIES[id as StrategyId] ?? STRATEGIES.balanced;
}
