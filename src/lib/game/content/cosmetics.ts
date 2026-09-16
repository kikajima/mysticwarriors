// =====================================================================
// COSMÉTICOS E PRODUTOS (preparação de monetização — SEM cobrança real)
// ---------------------------------------------------------------------
// Cristais são conquistados JOGANDO (quests, conquistas, world boss).
// Cosméticos NÃO alteram atributos — nenhuma venda de poder.
// VIP / Passe de Temporada: apenas estrutura de dados + UI "em breve".
// Nenhum gateway de pagamento está conectado.
// =====================================================================

export type CosmeticSlot =
  | 'aura'
  | 'outfit'
  | 'avatar'
  | 'frame'
  | 'title'
  | 'pose'
  | 'effect'
  | 'background'
  | 'card';

export const COSMETIC_SLOTS: ReadonlySet<string> = new Set<CosmeticSlot>([
  'aura',
  'outfit',
  'avatar',
  'frame',
  'title',
  'pose',
  'effect',
  'background',
  'card',
]);

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  price: number; // em cristais
  rarity: 'comum' | 'raro' | 'épico' | 'lendário';
  icon: string;
  previewCss?: string; // classe tailwind para pré-visualização de aura/efeito
  // ===== v0.5: metadados visuais USADOS DE VERDADE pela UI =====
  /** slot 'title': texto exibido junto ao nome do guerreiro */
  titleText?: string;
  /** slot 'aura': glow aplicado ao redor do avatar em TODA a UI */
  avatarGlowCss?: string;
  /** slot 'frame': anel/moldura aplicado ao avatar */
  avatarFrameCss?: string;
  /** slot 'avatar': overlay por cima da imagem do avatar */
  avatarOverlayCss?: string;
  /** slot 'background': fundo da ficha de personagem (Dashboard) */
  profileBgCss?: string;
  /** slot 'effect': animação de entrada em tela cheia */
  screenEffect?: 'teleport' | 'kiwave';
  /** slots 'pose'/'outfit': selo exibido na ficha de personagem */
  profileBadge?: { icon: string; label: string };
  /** slot 'aura': gradiente PULSANTE atrás do retrato (v0.6 — era grátis) */
  avatarPulseCss?: string;
  /** slot 'card': classe CSS do brilho envolvente do card da ficha (v0.6 — era grátis) */
  cardGlowCss?: string;
}

export const COSMETICS: CosmeticDef[] = [
  // Auras — glow ao redor do avatar (header, ficha, seleção de personagem)
  {
    id: 'aura_chama',
    slot: 'aura',
    name: 'Aura de Chamas',
    description: 'Uma aura flamejante envolve seu guerreiro.',
    price: 20,
    rarity: 'raro',
    icon: '🔥',
    previewCss: 'shadow-[0_0_18px_rgba(249,115,22,0.7)]',
    avatarGlowCss: 'shadow-[0_0_24px_rgba(249,115,22,0.8)]',
  },
  {
    id: 'aura_trovao',
    slot: 'aura',
    name: 'Aura de Trovão',
    description: 'Descargas elétricas crepitam ao seu redor.',
    price: 35,
    rarity: 'épico',
    icon: '⚡',
    previewCss: 'shadow-[0_0_18px_rgba(56,189,248,0.75)]',
    avatarGlowCss: 'shadow-[0_0_24px_rgba(56,189,248,0.85)]',
  },
  {
    id: 'aura_divina',
    slot: 'aura',
    name: 'Aura Divina',
    description: 'A luz dos próprios deuses emana do seu corpo.',
    price: 60,
    rarity: 'lendário',
    icon: '✨',
    previewCss: 'shadow-[0_0_22px_rgba(250,204,21,0.85)]',
    avatarGlowCss: 'shadow-[0_0_30px_rgba(250,204,21,0.95)] animate-pulse',
  },
  {
    // v0.6 — o brilho dourado pulsante que era GRÁTIS ao redor do retrato
    // virou cosmético adquirível com diamantes (decisão do usuário).
    id: 'aura_ki_pulsante',
    slot: 'aura',
    name: 'Aura de Ki Pulsante',
    description:
      'O brilho dourado clássico que pulsa ao redor do retrato do seu guerreiro, em qualquer tela do jogo.',
    price: 45,
    rarity: 'épico',
    icon: '🌟',
    previewCss: 'shadow-[0_0_20px_rgba(251,146,60,0.65)] animate-pulse',
    avatarPulseCss: 'bg-gradient-to-br from-orange-500/30 to-amber-600/20 blur-lg animate-pulse',
  },
  // Títulos — exibidos junto ao nome do guerreiro
  {
    id: 'title_lendario',
    slot: 'title',
    name: 'Título: o Lendário',
    description: 'Seu nome carrega o peso das lendas.',
    price: 15,
    rarity: 'raro',
    icon: '📜',
    titleText: 'o Lendário',
  },
  {
    id: 'title_destruidor',
    slot: 'title',
    name: 'Título: o Destruidor',
    description: 'Para quem não conhece limites.',
    price: 30,
    rarity: 'épico',
    icon: '💀',
    titleText: 'o Destruidor',
  },
  {
    id: 'title_campeao',
    slot: 'title',
    name: 'Título: Campeão Universal',
    description: 'O maior dos títulos para o maior dos guerreiros.',
    price: 50,
    rarity: 'lendário',
    icon: '👑',
    titleText: 'Campeão Universal',
  },
  // Molduras de perfil — anel ao redor do avatar
  {
    id: 'frame_dourada',
    slot: 'frame',
    name: 'Moldura Dourada',
    description: 'Moldura de ouro puro para o seu perfil.',
    price: 25,
    rarity: 'raro',
    icon: '🖼️',
    avatarFrameCss: 'ring-4 ring-yellow-400/90 shadow-[0_0_16px_rgba(250,204,21,0.45)]',
  },
  {
    id: 'frame_dragao',
    slot: 'frame',
    name: 'Moldura do Dragão',
    description: 'Entalhada nas escamas de Shenlon.',
    price: 45,
    rarity: 'épico',
    icon: '🐲',
    avatarFrameCss: 'ring-4 ring-emerald-400/90 shadow-[0_0_16px_rgba(52,211,153,0.45)]',
  },
  // Fundos de perfil — atrás da ficha de personagem
  {
    id: 'bg_sala_tempo',
    slot: 'background',
    name: 'Fundo: Sala do Tempo',
    description: 'O infinito branco do outro lado da porta.',
    price: 20,
    rarity: 'raro',
    icon: '⏳',
    profileBgCss: 'bg-gradient-to-br from-slate-100/20 via-white/10 to-slate-200/15',
  },
  {
    id: 'bg_planeta_namek',
    slot: 'background',
    name: 'Fundo: Namekusei',
    description: 'Céus verdes e dois sóis no horizonte.',
    price: 20,
    rarity: 'raro',
    icon: '🌍',
    profileBgCss: 'bg-gradient-to-br from-emerald-900/60 via-teal-950/40 to-green-900/50',
  },
  // Efeitos — animação ao entrar em cena
  {
    id: 'fx_teleporte',
    slot: 'effect',
    name: 'Efeito: Teleporte',
    description: 'Um clarão azul quando você entra em cena.',
    price: 30,
    rarity: 'épico',
    icon: '💫',
    screenEffect: 'teleport',
  },
  {
    id: 'fx_onda',
    slot: 'effect',
    name: 'Efeito: Onda de Ki',
    description: 'Uma onda de energia percorre a tela.',
    price: 40,
    rarity: 'épico',
    icon: '🌊',
    screenEffect: 'kiwave',
  },
  // Avatar + pose + roupa
  {
    id: 'avatar_dourado',
    slot: 'avatar',
    name: 'Avatar Dourado',
    description: 'Um retrato seu banhado em ouro.',
    price: 25,
    rarity: 'raro',
    icon: '🥇',
    avatarOverlayCss: 'bg-gradient-to-br from-yellow-300/45 via-transparent to-amber-500/40',
  },
  {
    id: 'pose_suprema',
    slot: 'pose',
    name: 'Pose Suprema',
    description: 'A pose final do guerreiro que venceu tudo.',
    price: 35,
    rarity: 'épico',
    icon: '🦸',
    profileBadge: { icon: '🦸', label: 'Pose Suprema' },
  },
  {
    id: 'roupa_gi_branco',
    slot: 'outfit',
    name: 'Gi Branco Mestre',
    description: 'O uniforme dos que transcendem a tartaruga.',
    price: 28,
    rarity: 'raro',
    icon: '🥋',
    profileBadge: { icon: '🥋', label: 'Gi Branco Mestre' },
  },
  {
    // v0.6 — a aura que envolvia o CARD da ficha de graça virou cosmético
    // adquirível com diamantes (decisão do usuário). Classe .aura do globals.css.
    id: 'card_aura_ancestral',
    slot: 'card',
    name: 'Aura Ancestral do Card',
    description:
      'Sua ficha de personagem emana um brilho místico laranja que pulsa suavemente, como o Ki de um mestre.',
    price: 60,
    rarity: 'lendário',
    icon: '🃏',
    previewCss: 'shadow-[0_0_20px_rgba(249,115,22,0.6)] animate-pulse',
    cardGlowCss: 'aura',
  },
];

export function getCosmetic(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}

/** Definição do cosmético equipado em um slot (undefined se vazio/inválido). */
export function equippedCosmetic(
  equipped: Partial<Record<CosmeticSlot, string>> | null | undefined,
  slot: CosmeticSlot
): CosmeticDef | undefined {
  const id = equipped?.[slot];
  return id ? getCosmetic(id) : undefined;
}

// ===== Parse/serialização do JSON de cosméticos equipados (Player) =====

export function parseCosmeticsEquipped(raw: string | null | undefined): Partial<Record<CosmeticSlot, string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Partial<Record<CosmeticSlot, string>> = {};
    for (const [slot, id] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === 'string' && COSMETIC_SLOTS.has(slot) && getCosmetic(id)) {
        out[slot as CosmeticSlot] = id;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeCosmeticsEquipped(equipped: Partial<Record<CosmeticSlot, string>>): string {
  return JSON.stringify(equipped);
}

// ===== Produtos (estrutura para monetização futura — NÃO à venda ainda) =====

export interface ProductDef {
  id: string;
  kind: 'cosmetic' | 'vip' | 'season_pass';
  name: string;
  description: string;
  available: boolean; // false = "em breve" (VIP/passe)
  vipBenefits?: string[];
  passBenefits?: { free: string[]; premium: string[] };
}

export const PRODUCTS: ProductDef[] = [
  {
    id: 'vip_month',
    kind: 'vip',
    name: 'VIP Guerreiro (mensal)',
    description: 'Benefícios de conveniência e cosméticos. Em breve.',
    available: false,
    vipBenefits: [
      '+2 slots de missões na fila (futuro)',
      'Regeneração de energia +20% (conveniência)',
      'Aura exclusiva de VIP',
      'Título exclusivo',
      'Sem anúncios (futuro)',
    ],
  },
  {
    id: 'season_pass',
    kind: 'season_pass',
    name: 'Passe de Temporada',
    description: 'Trilha de recompensas gratuita + premium por temporada. Em breve.',
    available: false,
    passBenefits: {
      free: ['Zeni e cristais por nível do passe', 'Cosmético comum ao final'],
      premium: ['Cristais extras em cada nível', 'Cosmético lendário exclusivo', 'Moldura de temporada'],
    },
  },
];

/**
 * Política anti pay-to-win (documentada no código de propósito):
 * - NUNCA vender atributos, XP, Zeni ou vantagem de combate;
 * - Cristais comprados (futuro) só compram COSMÉTICOS;
 * - VIP é conveniente, nunca mais forte.
 */
