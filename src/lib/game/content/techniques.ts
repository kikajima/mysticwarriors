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
    name: 'Rogafufuken',
    description: 'Punho do Lobo Feroz: uma rajada de garras e socos selvagem como um lobo faminto.',
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
    name: 'Megaton Punch',
    description: 'O golpe campeão mundial! Pode falar pro mundo inteiro que é do Satã!',
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
    name: 'Kamehameha',
    description: 'A onda de energia clássica da Escola da Tartaruga. Leva uma vida para dominar.',
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
    name: 'Kienzan',
    description: 'Disco de Ki de alta perfuração: ignora parte da defesa, mas é um pouco mais fácil de esquivar.',
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
    name: 'Dodonpa',
    description: 'Raio concentrado da Escola da Garça, disparado pela ponta dos dedos com leve bônus de precisão.',
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
    name: 'Kikoho',
    description: 'Canhão de Ki em forma de triângulo, concentrado em um único disparo de alto poder.',
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
    name: 'Makankosappo',
    description: 'Canhão Especial de Raio: disparo de alta potência, preciso e capaz de ignorar parte da defesa.',
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
    name: 'Big Bang Attack',
    description: 'Uma esfera de energia do orgulho Saiyajin. Uma palma aberta, um buraco no mapa.',
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
    name: 'Kaioken ×20',
    description: 'Explosão física concentrada em um único ataque de alto poder.',
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
    name: 'Final Flash',
    description: 'A técnica definitiva do príncipe: carregue, grite o nome e apague o horizonte.',
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
    name: 'Genki Dama',
    description: 'Golpe supremo de enorme poder e perfuração, mas mais fácil de esquivar.',
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
    name: 'Mestre Kame',
    title: 'Escola da Tartaruga',
    quote: '"Ho ho ho! Primeiro o básico: texugo, javali, esquilo... e aí sim, o Kamehameha!"',
    location: 'Ilha do Kame',
    gradient: 'from-amber-600 to-orange-800',
    emoji: '🐢',
    techniques: ['rogafufuken', 'kamehameha'],
  },
  {
    id: 'satan',
    name: 'Mr. Satã',
    title: 'Campeão Mundial',
    quote: '"Pode falar pro mundo inteiro que aprendeu com o GRANDE Mr. Satã!"',
    location: 'Satã City',
    gradient: 'from-yellow-600 to-amber-800',
    emoji: '🥊',
    techniques: ['megaton_punch'],
  },
  {
    id: 'kuririn',
    name: 'Kuririn',
    title: 'Veterano da Tartaruga',
    quote: '"Aprendi na base do osso duro... digo, na base do treino! Confia em mim."',
    location: 'Kame House',
    gradient: 'from-orange-500 to-red-800',
    emoji: '🥚',
    techniques: ['kienzan'],
  },
  {
    id: 'tenshinhan',
    name: 'Tenshinhan',
    title: 'Escola da Garça',
    quote: '"Meus treinos são duros, mas o Kikoho exige disciplina de três olhos."',
    location: 'Dojô da Garça',
    gradient: 'from-emerald-600 to-teal-800',
    emoji: '👁️',
    techniques: ['dodonpa', 'kikoho'],
  },
  {
    id: 'piccolo',
    name: 'Piccolo',
    title: 'Guardião Silencioso',
    quote: '"Meditação, concentração, precisão. O Makankosappo não perdoa erros — nem do atirador."',
    location: 'Palácio de Kami',
    gradient: 'from-green-700 to-emerald-900',
    emoji: '🟢',
    techniques: ['makankosappo'],
  },
  {
    id: 'vegeta',
    name: 'Vegeta',
    title: 'Príncipe dos Saiyajins',
    quote: '"Hmph. Se vai treinar comigo, esqueça descanso. Um Saiyajin de elite não conhece a palavra limite!"',
    location: 'Sala de Gravidade',
    gradient: 'from-blue-700 to-slate-900',
    emoji: '👑',
    techniques: ['big_bang', 'final_flash'],
  },
  {
    id: 'rei_kai',
    name: 'Rei Kai',
    title: 'Senhor do Norte',
    quote: '"Ah ah ah! Meu treino tem duas regras: pegar Bubbles e contar piadas. As técnicas vêm depois!"',
    location: 'Planeta Kaio',
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
