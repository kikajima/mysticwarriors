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
  // ===== Solaris: Fera Lupina → Ascensão Prateada → 3 ramos =====
  {
    id: 'saiyajin_oozaru',
    name: 'Fera Lupina',
    race: 'saiyajin',
    description: 'A herança lupina desperta sob radiação lunar e comprime Aether nos músculos, sentidos e ossatura.',
    icon: '🐒',
    color: 'from-amber-700 to-orange-900',
    order: 1,
    minLevel: 5,
    requiredStats: { strength: 15 },
    multipliers: { physical: 1.1, defense: 1.05 },
  },
  {
    id: 'saiyajin_ss1',
    name: 'Ascensão Prateada',
    race: 'saiyajin',
    description: 'A pelagem assume brilho prateado e o Aether percorre o corpo em descargas controladas de plasma.',
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
    name: 'Forja do Titã Lupino',
    race: 'saiyajin',
    description: 'O Aether é comprimido em musculatura e estrutura óssea, convertendo impulso estelar em força bruta.',
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
    name: 'Matilha Solitária',
    race: 'saiyajin',
    description: 'Instinto e razão entram em sincronia perfeita, sem desperdício de Aether entre ataque, defesa e movimento.',
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
    name: 'Fúria da Alcateia',
    race: 'saiyajin',
    description: 'Descargas de Aether percorrem a pelagem e explodem em rajadas rápidas como uma tempestade estelar.',
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
    description: 'Disciplina vanguardiana e respiração de combate abrem os canais internos de Aether.',
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
    description: 'Um protocolo meditativo de Aethel Prime libera reservas neuromusculares sem comprometer o controle.',
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
    name: 'Reflexo Absoluto',
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
    name: 'Convergência Celeste',
    race: 'humano',
    description: 'O guerreiro ancora múltiplas correntes de Aether e as converte em uma única descarga de altíssima densidade.',
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

  // ===== Verdant: Sinergia Raiz → Ascensão Silvestre → ramos =====
  {
    id: 'nameku_sinergia',
    name: 'Sinergia Raiz',
    race: 'namekuseijin',
    description: 'A rede sensorial do Verdant sincroniza corpo, memória ancestral e biosfera em um único pulso.',
    icon: '🌱',
    color: 'from-green-500 to-emerald-800',
    order: 1,
    minLevel: 5,
    requiredStats: { defense: 15 },
    multipliers: { defense: 1.1 },
  },
  {
    id: 'nameku_super',
    name: 'Ascensão Silvestre',
    race: 'namekuseijin',
    description: 'Tecidos vegetais mineralizam em combate e ampliam simultaneamente força, defesa e condução de Aether.',
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
    name: 'Colosso de Sylva',
    race: 'namekuseijin',
    description: 'Camadas de fibra cristalina crescem sobre o corpo, criando uma couraça viva de densidade extrema.',
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
    description: 'A sintonia com as correntes de Sylva equilibra corpo, mente e Aether em uma forma de proteção total.',
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
    name: 'Oráculo do Horizonte',
    race: 'namekuseijin',
    description: 'Memórias da rede viva de Sylva ampliam percepção e controle de Aether até o limite biológico.',
    icon: '📜',
    color: 'from-green-300 to-emerald-600',
    order: 3,
    minLevel: 20,
    requiredStats: { ki: 90 },
    requiresTransformation: 'nameku_super',
    bonuses: { ki: 4 },
    multipliers: { ki: 1.3, defense: 1.1 },
  },

  // ===== Sintético: Sobrecarga → Nano-melhorias → ramos =====
  {
    id: 'androide_overclock',
    name: 'Sobrecarga',
    race: 'androide',
    description: 'Travas térmicas e de potência são temporariamente removidas para elevar a vazão do núcleo de Aether.',
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
    description: 'Enxames de nanomáquinas de Nexus-9 reconfiguram blindagem, sensores e condução energética em tempo real.',
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
    description: 'Coletores de contato drenam energia cinética e Aether residual para alimentar subsistemas ofensivos.',
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
    description: 'Um reator fechado recicla perdas térmicas e mantém todos os subsistemas em equilíbrio contínuo.',
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

  // ===== Amorph: Forma Pura → Caos Desencadeado → ramos =====
  {
    id: 'majin_pura',
    name: 'Forma Pura',
    race: 'majin',
    description: 'A biomassa abandona estruturas supérfluas e retorna a uma configuração compacta de plasma orgânico.',
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
    description: 'A matriz molecular perde estabilidade deliberadamente e converte deformação corporal em potência de combate.',
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
    description: 'A forma primordial concentra massa, impulso e Aether em uma configuração agressiva de alta densidade.',
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
    name: 'Núcleo Caótico',
    race: 'majin',
    description: 'Flexibilidade e rigidez estrutural alternam em microssegundos, produzindo uma forma equilibrada e imprevisível.',
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
    description: 'Símbolos de ressonância dimensional convertem instabilidade do Vazio em Aether ofensivo concentrado.',
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
