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
    name: 'Garras do Lobo',
    description: 'Sequência curta de garras, cotovelos e avanços inspirada nos predadores de Pyros.',
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
    name: 'Impacto Titânico',
    description: 'Um golpe de arena baseado em transferência total de peso e impulso corporal.',
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
    description: 'Uma onda condensada de Aether canalizada pelas mãos e liberada em fluxo contínuo.',
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
    description: 'Lâmina circular de energia de alta perfuração; atravessa parte da defesa, mas é telegrafada.',
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
    description: 'Feixe estreito de Aether projetado pela ponta dos dedos, rápido e preciso.',
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
    description: 'Compressão geométrica de energia em um pulso frontal de alto impacto.',
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
    description: 'Dois fluxos helicoidais convergem num perfurador energético preciso e destrutivo.',
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
    description: 'Uma esfera de Aether superaquecido é lançada como uma pequena nova de combate.',
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
    description: 'O guerreiro força corpo e circulação energética além do limite por um único avanço devastador.',
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
    description: 'Descarga suprema concentrada num feixe capaz de romper blindagens e iluminar o horizonte.',
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
    description: 'O usuário agrega Aether ambiental numa massa instável de enorme poder e perfuração.',
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
    name: 'Mestre Orin',
    title: 'Escola do Fluxo',
    quote: '"Controle primeiro a respiração. Poder sem direção só desperdiça Aether."',
    location: 'Mosteiro de Aethel Prime',
    gradient: 'from-amber-600 to-orange-800',
    emoji: '🐢',
    techniques: ['rogafufuken', 'kamehameha'],
  },
  {
    id: 'satan',
    name: 'Brakk Veloz',
    title: 'Campeão Mundial',
    quote: '"Arena cheia ou vazia, um golpe perfeito ainda precisa acertar."',
    location: 'Arena Central de Aethel Prime',
    gradient: 'from-yellow-600 to-amber-800',
    emoji: '🥊',
    techniques: ['megaton_punch'],
  },
  {
    id: 'kuririn',
    name: 'Lyra Venn',
    title: 'Veterana do Fluxo',
    quote: '"Não lute contra a força do alvo. Corte a trajetória e escolha o momento."',
    location: 'Terraços de Caelum',
    gradient: 'from-orange-500 to-red-800',
    emoji: '🥚',
    techniques: ['kienzan'],
  },
  {
    id: 'tenshinhan',
    name: 'Kael Rhun',
    title: 'Disciplina Prismática',
    quote: '"Geometria, foco e pulso. O disparo perfeito nasce antes do movimento."',
    location: 'Dojo Prismático',
    gradient: 'from-emerald-600 to-teal-800',
    emoji: '👁️',
    techniques: ['dodonpa', 'kikoho'],
  },
  {
    id: 'piccolo',
    name: 'Sábio Narel',
    title: 'Guardião Silencioso',
    quote: '"Ouça o campo de Aether. A abertura existe antes que o inimigo perceba."',
    location: 'Santuário Suspenso de Sylva',
    gradient: 'from-green-700 to-emerald-900',
    emoji: '🟢',
    techniques: ['makankosappo'],
  },
  {
    id: 'vegeta',
    name: 'Vorak Solaris',
    title: 'Alfa da Matilha Estelar',
    quote: '"Em Pyros, limite é só o nome dado ao ponto em que os fracos param."',
    location: 'Câmara Gravitacional de Pyros',
    gradient: 'from-blue-700 to-slate-900',
    emoji: '👑',
    techniques: ['big_bang', 'final_flash'],
  },
  {
    id: 'rei_kai',
    name: 'Arquivista Vael',
    title: 'Guardião do Horizonte',
    quote: '"Antes de reunir o Aether ao redor, aprenda a não deixar que ele reúna você."',
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
    name: 'Especialista em Aether',
    description: 'Canhão de energia: +20% de dano energético, mas golpeia mais fraco com o corpo (-15%).',
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
