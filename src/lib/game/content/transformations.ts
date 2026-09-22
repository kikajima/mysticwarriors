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
    description: 'A herança predatória dos Solaris desperta sob radiação lunar: sentidos ampliados, musculatura lupina e resistência brutal.',
    icon: '🐺',
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
    description: 'A pelagem ganha brilho prateado e o Aether circula como plasma pela musculatura, elevando força, energia e velocidade.',
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
    description: 'O corpo Solaris comprime Aether nos músculos e ossos, formando uma couraça viva feita para impacto frontal.',
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
    description: 'Disciplina de alfa sem depender da matilha: corpo, Aether, defesa e movimento entram em equilíbrio absoluto.',
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
    description: 'Impulsos elétricos de Aether percorrem a pelagem e convertem agressividade em rajadas rápidas e violentas.',
    icon: '🌩️',
    color: 'from-sky-400 to-indigo-600',
    order: 3,
    minLevel: 20,
    requiredStats: { ki: 90 },
    requiresTransformation: 'saiyajin_ss1',
    bonuses: { ki: 4, speed: 2 },
    multipliers: { ki: 1.3, speed: 1.12 },
  },

  // ===== Vanguardiano: Disciplina Interior → Potencial Vanguardiano → ramos =====
  {
    id: 'humano_despertar',
    name: 'Disciplina Interior',
    race: 'humano',
    description: 'Treino respiratório e biofeedback refinam o controle interno de Aether dos Vanguardianos.',
    icon: '🌅',
    color: 'from-amber-500 to-orange-700',
    order: 1,
    minLevel: 5,
    requiredStats: { ki: 15 },
    multipliers: { ki: 1.1 },
  },
  {
    id: 'humano_potencial',
    name: 'Potencial Vanguardiano',
    race: 'humano',
    description: 'Protocolos de combate e meditação adaptativa removem travas mentais sem sacrificar precisão ou autocontrole.',
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
    name: 'Pulso do Horizonte',
    race: 'humano',
    description: 'O Vanguardiano sincroniza seu pulso interno com o campo de Aether de Caelum e converte foco em potência energética.',
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
    description: 'As redes sensoriais do Verdant se conectam ao Aether de Sylva e estabilizam corpo, mente e regeneração.',
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
    description: 'Tecidos vegetais e fibras minerais aumentam de densidade enquanto o fluxo de Aether atravessa todo o corpo.',
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
    description: 'Placas orgânicas crescem como casca mineral, criando uma forma colossal construída para absorver impacto.',
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
    description: 'O Verdant sincroniza sentidos, força e Aether com a rede viva de Sylva em perfeita harmonia.',
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
    description: 'Memórias bioenergéticas de gerações Verdant ampliam percepção e domínio de Aether a níveis excepcionais.',
    icon: '📜',
    color: 'from-green-300 to-emerald-600',
    order: 3,
    minLevel: 20,
    requiredStats: { ki: 90 },
    requiresTransformation: 'nameku_super',
    bonuses: { ki: 4 },
    multipliers: { ki: 1.3, defense: 1.1 },
  },

  // ===== Sintético: Sobrecarga → Nanoevolução → ramos =====
  {
    id: 'androide_overclock',
    name: 'Sobrecarga',
    race: 'androide',
    description: 'O núcleo remove travas térmicas e opera acima do regime nominal por curtos períodos.',
    icon: '⚙️',
    color: 'from-slate-400 to-slate-700',
    order: 1,
    minLevel: 5,
    requiredStats: { ki: 15 },
    multipliers: { ki: 1.08, speed: 1.05 },
  },
  {
    id: 'androide_nanotech',
    name: 'Nanoevolução',
    race: 'androide',
    description: 'Nanomáquinas reconfiguram o chassi em tempo real usando telemetria coletada em combate.',
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
    description: 'Um reator fechado de Nexus-9 redistribui energia entre ataque, defesa e mobilidade sem perda significativa.',
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
    description: 'A biomassa abandona estruturas supérfluas e assume uma configuração compacta, elástica e extremamente eficiente.',
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
    description: 'O núcleo do Amorph libera instabilidade molecular controlada e transforma o próprio corpo em uma tempestade de plasma vivo.',
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
    description: 'A biomassa retorna ao padrão primordial: denso, veloz e orientado por instinto de sobrevivência absoluto.',
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
    description: 'Elasticidade e rigidez alternam em microssegundos enquanto o núcleo mantém estabilidade energética perfeita.',
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
    description: 'Padrões arcanos de Aether são inscritos na própria biomassa e convertidos em projeções energéticas de grande alcance.',
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
