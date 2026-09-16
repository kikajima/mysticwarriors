import type { TransformationDef } from '../types';

// =====================================================================
// TRANSFORMAÇÕES — sistema genérico com árvore por raça.
// ---------------------------------------------------------------------
// Estrutura por raça: Forma Base → Transformação I → Transformação II
//                     → três ramos (A: físico / B: equilibrado / C: Ki).
// A engine lê apenas os multiplicadores; nada de nomes hardcoded.
// Adicionar transformações novas = adicionar objetos aqui.
//
// Balanceamento: desbloquear dá bônus permanentes pequenos; a forma ATIVA
// concede multiplicadores em combate. Personagens sem transformação não
// ficam obsoletos (multiplicadores moderados).
// =====================================================================

export const TRANSFORMATIONS: TransformationDef[] = [
  // ===== Saiyajin: Oozaru → Super Saiyajin → 3 ramos =====
  {
    id: 'saiyajin_oozaru',
    name: 'Oozaru',
    race: 'saiyajin',
    description: 'A transformação primordial: olhe para a lua cheia e deixe o macaco gigante aflorar.',
    icon: '🐒',
    color: 'from-amber-700 to-orange-900',
    order: 1,
    minLevel: 5,
    requiredStats: { strength: 15 },
    multipliers: { physical: 1.1, defense: 1.05 },
  },
  {
    id: 'saiyajin_ss1',
    name: 'Super Saiyajin',
    race: 'saiyajin',
    description: 'O lendário guerreiro de cabelos dourados, despertado pela fúria de um coração puro.',
    icon: '⚡',
    color: 'from-yellow-400 to-amber-600',
    order: 2,
    minLevel: 12,
    requiredStats: { strength: 40, ki: 30 },
    requiresTransformation: 'saiyajin_oozaru',
    requiredTechnique: 'kamehameha',
    bonuses: { strength: 2, ki: 2 },
    multipliers: { physical: 1.15, ki: 1.15, defense: 1.08, speed: 1.05 },
  },
  {
    id: 'saiyajin_ss2_forja', // ramo A: físico
    name: 'Super Saiyajin 2 — Forja',
    race: 'saiyajin',
    description: 'O poder do SSJ2 canalizado no corpo: músculos densos como aço e punhos que racham o céu.',
    icon: '💪',
    color: 'from-orange-400 to-red-600',
    order: 3,
    minLevel: 20,
    requiredStats: { strength: 90 },
    requiresTransformation: 'saiyajin_ss1',
    bonuses: { strength: 4, defense: 2 },
    multipliers: { physical: 1.3, defense: 1.1 },
  },
  {
    id: 'saiyajin_ss2_mestre', // ramo B: equilibrado
    name: 'Super Saiyajin 2 — Mestre',
    race: 'saiyajin',
    description: 'O SSJ2 perfeito: equilíbrio absoluto entre corpo e energia, sem desperdício de Ki.',
    icon: '⚡',
    color: 'from-yellow-300 to-yellow-600',
    order: 3,
    minLevel: 20,
    requiredStats: { strength: 60, ki: 60, speed: 55 },
    requiresTransformation: 'saiyajin_ss1',
    bonuses: { strength: 2, defense: 2, speed: 2, ki: 2 },
    multipliers: { physical: 1.2, ki: 1.2, defense: 1.12, speed: 1.1 },
  },
  {
    id: 'saiyajin_ss2_furia', // ramo C: Ki
    name: 'Super Saiyajin 2 — Fúria',
    race: 'saiyajin',
    description: 'A fúria relâmpago do SSJ2: aura elétrica que transforma cada golpe em trovão.',
    icon: '🌩️',
    color: 'from-sky-400 to-indigo-600',
    order: 3,
    minLevel: 20,
    requiredStats: { ki: 90 },
    requiresTransformation: 'saiyajin_ss1',
    bonuses: { ki: 4, speed: 2 },
    multipliers: { ki: 1.3, speed: 1.12 },
  },

  // ===== Humano: Despertar → Potencial Desbloqueado → ramos =====
  {
    id: 'humano_despertar',
    name: 'Despertar Interior',
    race: 'humano',
    description: 'Técnicas milenares da Torre de Karin abrem os caminhos da energia interior humana.',
    icon: '🌅',
    color: 'from-amber-500 to-orange-700',
    order: 1,
    minLevel: 5,
    requiredStats: { ki: 15 },
    multipliers: { ki: 1.1 },
  },
  {
    id: 'humano_potencial',
    name: 'Potencial Desbloqueado',
    race: 'humano',
    description: 'O ritual do Ancião Kaio libera 100% do seu potencial adormecido — sem perder a razão.',
    icon: '✨',
    color: 'from-purple-400 to-violet-700',
    order: 2,
    minLevel: 12,
    requiredStats: { ki: 40, speed: 30 },
    requiresTransformation: 'humano_despertar',
    requiredMission: 'academico', // v0.6: era missão 'karin' — agora exige 1 trabalho de Acadêmico
    bonuses: { ki: 2, speed: 2 },
    multipliers: { physical: 1.12, ki: 1.12, speed: 1.08 },
  },
  {
    id: 'humano_instinto', // ramo A: velocidade/precisão
    name: 'Instinto Superior',
    race: 'humano',
    description: 'Anos de treino viram reflexo: o corpo reage antes do pensamento.',
    icon: '🌀',
    color: 'from-cyan-400 to-blue-700',
    order: 3,
    minLevel: 20,
    requiredStats: { speed: 90 },
    requiresTransformation: 'humano_potencial',
    bonuses: { speed: 4, defense: 2 },
    multipliers: { speed: 1.3, defense: 1.12 },
  },
  {
    id: 'humano_aura', // ramo B: equilíbrio
    name: 'Aura Serena',
    race: 'humano',
    description: 'A mente calma e a aura estável: o auge do guerreiro completo.',
    icon: '☯️',
    color: 'from-emerald-400 to-teal-700',
    order: 3,
    minLevel: 20,
    requiredStats: { strength: 55, ki: 55, defense: 55 },
    requiresTransformation: 'humano_potencial',
    bonuses: { strength: 2, defense: 2, speed: 2, ki: 2 },
    multipliers: { physical: 1.2, ki: 1.2, defense: 1.16 },
  },
  {
    id: 'humano_kaio', // ramo C: energia
    name: 'Chamado dos Kaios',
    race: 'humano',
    description: 'Energia divina canalizada por um mortal determinado — o impossível feito realidade.',
    icon: '🌟',
    color: 'from-yellow-200 to-amber-500',
    order: 3,
    minLevel: 20,
    requiredStats: { ki: 90 },
    requiresTransformation: 'humano_potencial',
    requiredTechnique: 'genki_dama',
    bonuses: { ki: 4 },
    multipliers: { ki: 1.32 },
  },

  // ===== Namekuseijin: Sinergia → Super Namekuseijin → ramos =====
  {
    id: 'nameku_sinergia',
    name: 'Sinergia Interior',
    race: 'namekuseijin',
    description: 'Os dois lados do coração namekuseijin combatem como um só pela primeira vez.',
    icon: '🌱',
    color: 'from-green-500 to-emerald-800',
    order: 1,
    minLevel: 5,
    requiredStats: { defense: 15 },
    multipliers: { defense: 1.1 },
  },
  {
    id: 'nameku_super',
    name: 'Super Namekuseijin',
    race: 'namekuseijin',
    description: 'A fusão perfeita consigo mesmo: o poder de vários guerreiros em um único corpo.',
    icon: '🐲',
    color: 'from-emerald-400 to-green-700',
    order: 2,
    minLevel: 12,
    requiredStats: { strength: 35, ki: 35 },
    requiresTransformation: 'nameku_sinergia',
    requiredTechnique: 'makankosappo',
    bonuses: { strength: 2, defense: 2 },
    multipliers: { physical: 1.12, ki: 1.12, defense: 1.12 },
  },
  {
    id: 'nameku_dragao', // ramo A: defesa
    name: 'Dragão de Namekusei',
    race: 'namekuseijin',
    description: 'A lendária forma do dragão: escamas de energia que nenhum golpe atravessa.',
    icon: '🛡️',
    color: 'from-teal-400 to-emerald-800',
    order: 3,
    minLevel: 20,
    requiredStats: { defense: 90 },
    requiresTransformation: 'nameku_super',
    bonuses: { defense: 4, strength: 2 },
    multipliers: { defense: 1.34, physical: 1.17 },
  },
  {
    id: 'nameku_guardiao', // ramo B: equilíbrio
    name: 'Guardião Celestial',
    race: 'namekuseijin',
    description: 'O posto de Guardião da Terra aceita você: serenidade e poder em harmonia.',
    icon: '🌏',
    color: 'from-lime-400 to-green-700',
    order: 3,
    minLevel: 20,
    requiredStats: { strength: 55, ki: 55, defense: 55 },
    requiresTransformation: 'nameku_super',
    bonuses: { strength: 2, defense: 2, speed: 2, ki: 2 },
    multipliers: { physical: 1.21, ki: 1.21, defense: 1.21 },
  },
  {
    id: 'nameku_sabio', // ramo C: Ki
    name: 'Sábio do Dragão Eterno',
    race: 'namekuseijin',
    description: 'O conhecimento proibido dos Namekuseijins ancestrais flui pelas suas veias verdes.',
    icon: '📜',
    color: 'from-green-300 to-emerald-600',
    order: 3,
    minLevel: 20,
    requiredStats: { ki: 90 },
    requiresTransformation: 'nameku_super',
    bonuses: { ki: 4 },
    multipliers: { ki: 1.3, defense: 1.1 },
  },

  // ===== Androide: Overclock → Nano-melhorias → ramos =====
  {
    id: 'androide_overclock',
    name: 'Overclock',
    race: 'androide',
    description: 'Reatores internos além do limite de fábrica. Aviso: esquentando.',
    icon: '⚙️',
    color: 'from-slate-400 to-slate-700',
    order: 1,
    minLevel: 5,
    requiredStats: { ki: 15 },
    multipliers: { ki: 1.08, speed: 1.05 },
  },
  {
    id: 'androide_nanotech',
    name: 'Nano-melhorias',
    race: 'androide',
    description: 'Nanomáquinas absorvem tecnologias de batalha e reescrevem seu núcleo de combate.',
    icon: '🤖',
    color: 'from-sky-500 to-slate-800',
    order: 2,
    minLevel: 12,
    requiredStats: { ki: 40, strength: 30 },
    requiresTransformation: 'androide_overclock',
    bonuses: { strength: 2, ki: 2 },
    multipliers: { physical: 1.12, ki: 1.12, defense: 1.1 },
  },
  {
    id: 'androide_absorcao', // ramo A: dano
    name: 'Protocolo de Absorção',
    race: 'androide',
    description: 'Palmas que sugam a energia do inimigo: cada luta te deixa mais forte.',
    icon: '🫱',
    color: 'from-red-400 to-rose-800',
    order: 3,
    minLevel: 20,
    requiredStats: { strength: 90 },
    requiresTransformation: 'androide_nanotech',
    bonuses: { strength: 4 },
    multipliers: { physical: 1.24, ki: 1.12 },
  },
  {
    id: 'androide_eterno', // ramo B: equilíbrio
    name: 'Reator Eterno',
    race: 'androide',
    description: 'Energia infinita: a buggy final dos Drs. Gero e Brief combinados.',
    icon: '♾️',
    color: 'from-violet-400 to-indigo-800',
    order: 3,
    minLevel: 20,
    requiredStats: { strength: 55, ki: 55, defense: 55 },
    requiresTransformation: 'androide_nanotech',
    bonuses: { strength: 2, defense: 2, speed: 2, ki: 2 },
    multipliers: { physical: 1.15, ki: 1.15, defense: 1.12, speed: 1.08 },
  },
  {
    id: 'androide_raio', // ramo C: Ki
    name: 'Canhão de Raio Puro',
    race: 'androide',
    description: 'Todo o reator convertido em um único disparo aniquilador.',
    icon: '⚡',
    color: 'from-yellow-300 to-amber-600',
    order: 3,
    minLevel: 20,
    requiredStats: { ki: 90 },
    requiresTransformation: 'androide_nanotech',
    bonuses: { ki: 4 },
    multipliers: { ki: 1.32 },
  },

  // ===== Majin: Forma Pura → Caos → ramos =====
  {
    id: 'majin_pura',
    name: 'Forma Pura',
    race: 'majin',
    description: 'A casca externa cai: o mal puro de milênios finalmente respira.',
    icon: '🍬',
    color: 'from-pink-400 to-fuchsia-700',
    order: 1,
    minLevel: 5,
    requiredStats: { ki: 15 },
    multipliers: { ki: 1.1 },
  },
  {
    id: 'majin_caos',
    name: 'Caos Desencadeado',
    race: 'majin',
    description: 'Magia antiga sem coleiras: a realidade verga ao seu redor quando você ri.',
    icon: '😈',
    color: 'from-purple-400 to-fuchsia-900',
    order: 2,
    minLevel: 12,
    requiredStats: { ki: 45 },
    requiresTransformation: 'majin_pura',
    requiredMission: 'atleta', // v0.6: era missão 'dinossauros' — agora exige 1 trabalho de Atleta
    bonuses: { ki: 3 },
    multipliers: { ki: 1.16, physical: 1.1, defense: 1.08 },
  },
  {
    id: 'majin_kid', // ramo A: destruição total
    name: 'Forma Original',
    race: 'majin',
    description: 'O terror absoluto de tempos antigos: puro instinto de destruição.',
    icon: '💥',
    color: 'from-rose-400 to-red-800',
    order: 3,
    minLevel: 20,
    requiredStats: { strength: 85, ki: 60 },
    requiresTransformation: 'majin_caos',
    bonuses: { strength: 3, ki: 2 },
    multipliers: { physical: 1.25, ki: 1.22, defense: 1.05 },
  },
  {
    id: 'majin_absoluto', // ramo B: equilíbrio
    name: 'Majin Absoluto',
    race: 'majin',
    description: 'Caos e ordem dançando juntos: o corpo elástico perfeito do universo.',
    icon: '🔮',
    color: 'from-fuchsia-400 to-purple-800',
    order: 3,
    minLevel: 20,
    requiredStats: { strength: 55, ki: 55, defense: 55 },
    requiresTransformation: 'majin_caos',
    bonuses: { strength: 2, defense: 2, speed: 2, ki: 2 },
    multipliers: { physical: 1.18, ki: 1.18, defense: 1.15, speed: 1.08 },
  },
  {
    id: 'majin_arcano', // ramo C: magia/Ki
    name: 'Feitiço Arcano Supremo',
    race: 'majin',
    description: 'As palavras proibidas do Bibidi ecoam: magia bruta convertida em Ki infinito.',
    icon: '🕯️',
    color: 'from-indigo-400 to-violet-900',
    order: 3,
    minLevel: 20,
    requiredStats: { ki: 90 },
    requiresTransformation: 'majin_caos',
    bonuses: { ki: 4 },
    multipliers: { ki: 1.32, defense: 1.08 },
  },
];

export function getTransformation(id: string): TransformationDef | undefined {
  return TRANSFORMATIONS.find((t) => t.id === id);
}

/** Transformações disponíveis para uma raça, em ordem de árvore. */
export function transformationsForRace(race: string): TransformationDef[] {
  return TRANSFORMATIONS.filter((t) => t.race === race).sort((a, b) => a.order - b.order);
}
