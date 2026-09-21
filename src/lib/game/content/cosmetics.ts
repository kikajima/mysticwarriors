// =====================================================================
// COSMÉTICOS E PRODUTOS (preparação de monetização — SEM cobrança real)
// ---------------------------------------------------------------------
// Cristais são conquistados JOGANDO (quests, conquistas, Ameaça Universal).
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
  | 'card'
  | 'nameplate'
  | 'chat';

export type CosmeticSetId =
  | 'ascensao_dourada'
  | 'heranca_dragao'
  | 'vazio_cosmico'
  | 'caminho_mestre';

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
  'nameplate',
  'chat',
]);

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  price: number; // em cristais
  rarity: 'comum' | 'raro' | 'épico' | 'lendário';
  icon: string;
  /** coleção temática; serve SOMENTE para composição visual. */
  setId?: CosmeticSetId;
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
  /** slot 'nameplate': acabamento público aplicado ao nome do guerreiro. */
  nameplateCss?: string;
  /** slot 'chat': acabamento do balão de mensagem no chat. */
  chatBubbleCss?: string;
  /** slot 'outfit': acabamento visível no bloco de identidade pública. */
  identityAccentCss?: string;
  /** slot 'pose': apresentação curta usada após vitória e na ficha pública. */
  victoryPresentation?: { icon: string; label: string; css: string };
  /** Onde o item é percebido por outros jogadores (texto da loja). */
  publicSurfaces?: string[];
}

export interface CosmeticSetMilestone {
  pieces: number;
  name: string;
  description: string;
  /** selo da coleção exibido na identidade/ficha. */
  badgeCss: string;
  /** acabamento do bloco público de identidade. */
  identityCss?: string;
  /** halo adicional no avatar, sem substituir aura/moldura equipadas. */
  avatarCss?: string;
  /** acabamento da ficha/card do personagem. */
  profileCss?: string;
  /** acabamento extra do balão do chat. */
  chatCss?: string;
  /** acabamento extra da apresentação de vitória. */
  victoryCss?: string;
}

export interface CosmeticSetDef {
  id: CosmeticSetId;
  name: string;
  icon: string;
  description: string;
  pieceIds: string[];
  milestones: CosmeticSetMilestone[];
}

export interface CosmeticSetProgress {
  set: CosmeticSetDef;
  ownedCount: number;
  equippedCount: number;
  total: number;
  activeMilestone: CosmeticSetMilestone | null;
  nextMilestone: CosmeticSetMilestone | null;
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
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  {
    id: 'aura_trovao',
    setId: 'vazio_cosmico',
    slot: 'aura',
    name: 'Aura de Trovão',
    description: 'Descargas elétricas crepitam ao seu redor.',
    price: 35,
    rarity: 'épico',
    icon: '⚡',
    previewCss: 'shadow-[0_0_18px_rgba(56,189,248,0.75)]',
    avatarGlowCss: 'shadow-[0_0_24px_rgba(56,189,248,0.85)]',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  {
    id: 'aura_divina',
    setId: 'ascensao_dourada',
    slot: 'aura',
    name: 'Aura Divina',
    description: 'A luz dos próprios deuses emana do seu corpo.',
    price: 60,
    rarity: 'lendário',
    icon: '✨',
    previewCss: 'shadow-[0_0_22px_rgba(250,204,21,0.85)]',
    avatarGlowCss: 'shadow-[0_0_30px_rgba(250,204,21,0.95)] animate-pulse',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  {
    // v0.6 — o brilho dourado pulsante que era GRÁTIS ao redor do retrato
    // virou cosmético adquirível com diamantes (decisão do usuário).
    id: 'aura_ki_pulsante',
    setId: 'caminho_mestre',
    slot: 'aura',
    name: 'Aura de Ki Pulsante',
    description:
      'O brilho dourado clássico que pulsa ao redor do retrato do seu guerreiro, em qualquer tela do jogo.',
    price: 45,
    rarity: 'épico',
    icon: '🌟',
    previewCss: 'shadow-[0_0_20px_rgba(251,146,60,0.65)] animate-pulse',
    avatarPulseCss: 'bg-gradient-to-br from-orange-500/30 to-amber-600/20 blur-lg animate-pulse',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  // Títulos — exibidos junto ao nome do guerreiro
  {
    id: 'title_lendario',
    setId: 'caminho_mestre',
    slot: 'title',
    name: 'Título: o Lendário',
    description: 'Seu nome carrega o peso das lendas.',
    price: 15,
    rarity: 'raro',
    icon: '📜',
    titleText: 'o Lendário',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
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
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  {
    id: 'title_campeao',
    setId: 'ascensao_dourada',
    slot: 'title',
    name: 'Título: Campeão Universal',
    description: 'O maior dos títulos para o maior dos guerreiros.',
    price: 50,
    rarity: 'lendário',
    icon: '👑',
    titleText: 'Campeão Universal',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  // Molduras de perfil — anel ao redor do avatar
  {
    id: 'frame_dourada',
    setId: 'ascensao_dourada',
    slot: 'frame',
    name: 'Moldura Dourada',
    description: 'Moldura de ouro puro para o seu perfil.',
    price: 25,
    rarity: 'raro',
    icon: '🖼️',
    avatarFrameCss: 'ring-4 ring-yellow-400/90 shadow-[0_0_16px_rgba(250,204,21,0.45)]',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  {
    id: 'frame_dragao',
    setId: 'heranca_dragao',
    slot: 'frame',
    name: 'Moldura do Dragão',
    description: 'Entalhada nas escamas de Shenlon.',
    price: 45,
    rarity: 'épico',
    icon: '🐲',
    avatarFrameCss: 'ring-4 ring-emerald-400/90 shadow-[0_0_16px_rgba(52,211,153,0.45)]',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  // Fundos de perfil — atrás da ficha de personagem
  {
    id: 'bg_sala_tempo',
    setId: 'caminho_mestre',
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
    setId: 'heranca_dragao',
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
    setId: 'vazio_cosmico',
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
    setId: 'ascensao_dourada',
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
    setId: 'ascensao_dourada',
    slot: 'pose',
    name: 'Pose Suprema',
    description: 'A pose final do guerreiro que venceu tudo.',
    price: 35,
    rarity: 'épico',
    icon: '🦸',
    profileBadge: { icon: '🦸', label: 'Pose Suprema' },
    victoryPresentation: {
      icon: '🦸',
      label: 'POSE SUPREMA',
      css: 'border-yellow-500/70 bg-gradient-to-r from-yellow-950/80 via-orange-950/70 to-yellow-950/80 text-yellow-200 shadow-[0_0_28px_rgba(234,179,8,0.22)]',
    },
    publicSurfaces: ['Vitória', 'Perfil', 'Ranking', 'Guilda'],
  },
  {
    id: 'roupa_gi_branco',
    setId: 'caminho_mestre',
    slot: 'outfit',
    name: 'Gi Branco Mestre',
    description: 'O uniforme dos que transcendem a tartaruga.',
    price: 28,
    rarity: 'raro',
    icon: '🥋',
    profileBadge: { icon: '🥋', label: 'Gi Branco Mestre' },
    identityAccentCss: 'border-white/30 bg-gradient-to-r from-slate-100/10 via-amber-100/10 to-white/5 shadow-[0_0_18px_rgba(255,255,255,0.08)]',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  // Identidade social — itens feitos para serem vistos por outros jogadores.
  {
    id: 'nameplate_dragao_eterno',
    setId: 'heranca_dragao',
    slot: 'nameplate',
    name: 'Nameplate do Dragão Eterno',
    description: 'Seu nome aparece em uma placa esmeralda com brilho de escamas.',
    price: 42,
    rarity: 'épico',
    icon: '🐉',
    nameplateCss: 'border-emerald-500/50 bg-gradient-to-r from-emerald-950/75 via-teal-950/55 to-emerald-950/75 text-emerald-100 shadow-[0_0_14px_rgba(16,185,129,0.18)]',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  {
    id: 'nameplate_cosmico',
    setId: 'vazio_cosmico',
    slot: 'nameplate',
    name: 'Nameplate Cósmico',
    description: 'Uma placa violeta estrelada para destacar seu nome no universo.',
    price: 58,
    rarity: 'lendário',
    icon: '🌌',
    nameplateCss: 'border-violet-500/50 bg-gradient-to-r from-violet-950/80 via-fuchsia-950/55 to-indigo-950/75 text-violet-100 shadow-[0_0_16px_rgba(139,92,246,0.22)]',
    publicSurfaces: ['Perfil', 'Ranking', 'Chat', 'Guilda', 'Ameaça Global'],
  },
  {
    id: 'chat_ki_dourado',
    setId: 'ascensao_dourada',
    slot: 'chat',
    name: 'Balão de Ki Dourado',
    description: 'Suas mensagens recebem uma borda dourada e brilho discreto.',
    price: 24,
    rarity: 'raro',
    icon: '💬',
    chatBubbleCss: 'border-yellow-700/55 bg-gradient-to-r from-yellow-950/35 to-amber-950/20 shadow-[0_0_12px_rgba(234,179,8,0.10)]',
    publicSurfaces: ['Chat'],
  },
  {
    id: 'chat_abissal',
    setId: 'vazio_cosmico',
    slot: 'chat',
    name: 'Balão Abissal',
    description: 'Um acabamento violeta profundo para mensagens de presença marcante.',
    price: 38,
    rarity: 'épico',
    icon: '🟣',
    chatBubbleCss: 'border-violet-700/55 bg-gradient-to-r from-violet-950/40 to-fuchsia-950/20 shadow-[0_0_12px_rgba(139,92,246,0.12)]',
    publicSurfaces: ['Chat'],
  },
  {
    id: 'pose_mestre_sereno',
    setId: 'caminho_mestre',
    slot: 'pose',
    name: 'Pose do Mestre Sereno',
    description: 'Uma saudação calma após a vitória — confiança sem provocação.',
    price: 30,
    rarity: 'épico',
    icon: '🧘',
    profileBadge: { icon: '🧘', label: 'Mestre Sereno' },
    victoryPresentation: {
      icon: '🧘',
      label: 'MESTRE SERENO',
      css: 'border-sky-600/55 bg-gradient-to-r from-sky-950/65 via-slate-950/65 to-cyan-950/55 text-sky-100 shadow-[0_0_24px_rgba(14,165,233,0.14)]',
    },
    publicSurfaces: ['Vitória', 'Perfil', 'Ranking', 'Guilda'],
  },
  {
    // v0.6 — a aura que envolvia o CARD da ficha de graça virou cosmético
    // adquirível com diamantes (decisão do usuário). Classe .aura do globals.css.
    id: 'card_aura_ancestral',
    setId: 'caminho_mestre',
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

export const COSMETIC_SETS: CosmeticSetDef[] = [
  {
    id: 'ascensao_dourada',
    name: 'Ascensão Dourada',
    icon: '🌟',
    description: 'Prestígio, luz divina e presença de campeão.',
    pieceIds: [
      'aura_divina',
      'title_campeao',
      'frame_dourada',
      'avatar_dourado',
      'pose_suprema',
      'chat_ki_dourado',
    ],
    milestones: [
      {
        pieces: 2,
        name: 'Centelha Dourada',
        description: 'A identidade ganha um halo dourado discreto.',
        badgeCss: 'border-yellow-700/50 bg-yellow-950/50 text-yellow-300',
        identityCss: 'border-yellow-700/35 bg-gradient-to-r from-yellow-950/20 via-orange-950/15 to-yellow-950/20',
        avatarCss: 'shadow-[0_0_20px_rgba(250,204,21,0.28)]',
      },
      {
        pieces: 4,
        name: 'Ascensão',
        description: 'Ficha, chat e identidade recebem um acabamento dourado combinado.',
        badgeCss: 'border-yellow-600/60 bg-yellow-950/65 text-yellow-200',
        identityCss: 'border-yellow-600/45 bg-gradient-to-r from-yellow-950/35 via-orange-950/25 to-amber-950/35 shadow-[0_0_18px_rgba(234,179,8,0.12)]',
        avatarCss: 'shadow-[0_0_26px_rgba(250,204,21,0.38)]',
        profileCss: 'ring-1 ring-yellow-500/35 shadow-[0_0_34px_rgba(234,179,8,0.15)]',
        chatCss: 'ring-1 ring-yellow-600/30 shadow-[0_0_14px_rgba(234,179,8,0.10)]',
      },
      {
        pieces: 6,
        name: 'Lenda Solar',
        description: 'Conjunto completo: presença dourada máxima e celebração especial de vitória.',
        badgeCss: 'border-yellow-400/70 bg-gradient-to-r from-yellow-950/80 to-orange-950/70 text-yellow-100 shadow-[0_0_14px_rgba(250,204,21,0.18)]',
        identityCss: 'border-yellow-400/55 bg-gradient-to-r from-yellow-950/50 via-orange-950/35 to-yellow-950/50 shadow-[0_0_26px_rgba(250,204,21,0.18)]',
        avatarCss: 'shadow-[0_0_34px_rgba(250,204,21,0.52)]',
        profileCss: 'ring-2 ring-yellow-400/45 shadow-[0_0_46px_rgba(250,204,21,0.22)]',
        chatCss: 'ring-1 ring-yellow-400/40 shadow-[0_0_18px_rgba(250,204,21,0.14)]',
        victoryCss: 'ring-2 ring-yellow-400/45 shadow-[0_0_36px_rgba(250,204,21,0.24)]',
      },
    ],
  },
  {
    id: 'heranca_dragao',
    name: 'Herança do Dragão',
    icon: '🐉',
    description: 'Escamas, Namekusei e a assinatura ancestral do dragão.',
    pieceIds: ['frame_dragao', 'bg_planeta_namek', 'nameplate_dragao_eterno'],
    milestones: [
      {
        pieces: 2,
        name: 'Escamas Despertas',
        description: 'A identidade recebe brilho esmeralda de escamas.',
        badgeCss: 'border-emerald-700/50 bg-emerald-950/55 text-emerald-300',
        identityCss: 'border-emerald-700/40 bg-gradient-to-r from-emerald-950/30 via-teal-950/20 to-emerald-950/30',
        avatarCss: 'shadow-[0_0_22px_rgba(16,185,129,0.30)]',
      },
      {
        pieces: 3,
        name: 'Legado Eterno',
        description: 'Conjunto completo: ficha e mensagens carregam a presença do Dragão Eterno.',
        badgeCss: 'border-emerald-500/65 bg-emerald-950/75 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.16)]',
        identityCss: 'border-emerald-500/55 bg-gradient-to-r from-emerald-950/45 via-teal-950/35 to-green-950/45 shadow-[0_0_24px_rgba(16,185,129,0.16)]',
        avatarCss: 'shadow-[0_0_30px_rgba(52,211,153,0.42)]',
        profileCss: 'ring-1 ring-emerald-400/40 shadow-[0_0_38px_rgba(16,185,129,0.18)]',
        chatCss: 'ring-1 ring-emerald-500/35 shadow-[0_0_16px_rgba(16,185,129,0.12)]',
        victoryCss: 'ring-1 ring-emerald-400/40 shadow-[0_0_30px_rgba(16,185,129,0.18)]',
      },
    ],
  },
  {
    id: 'vazio_cosmico',
    name: 'Vazio Cósmico',
    icon: '🌌',
    description: 'Energia violeta, teleporte e presença de outro plano.',
    pieceIds: ['aura_trovao', 'fx_teleporte', 'nameplate_cosmico', 'chat_abissal'],
    milestones: [
      {
        pieces: 2,
        name: 'Fenda Astral',
        description: 'A identidade passa a irradiar um brilho violeta frio.',
        badgeCss: 'border-violet-700/50 bg-violet-950/55 text-violet-300',
        identityCss: 'border-violet-700/40 bg-gradient-to-r from-violet-950/30 via-indigo-950/20 to-fuchsia-950/25',
        avatarCss: 'shadow-[0_0_22px_rgba(139,92,246,0.32)]',
      },
      {
        pieces: 4,
        name: 'Horizonte do Vazio',
        description: 'Conjunto completo: ficha, chat e vitórias recebem distorção cósmica.',
        badgeCss: 'border-violet-500/65 bg-gradient-to-r from-violet-950/80 to-fuchsia-950/65 text-violet-100 shadow-[0_0_14px_rgba(139,92,246,0.18)]',
        identityCss: 'border-violet-500/55 bg-gradient-to-r from-violet-950/50 via-indigo-950/35 to-fuchsia-950/45 shadow-[0_0_26px_rgba(139,92,246,0.18)]',
        avatarCss: 'shadow-[0_0_32px_rgba(139,92,246,0.48)]',
        profileCss: 'ring-2 ring-violet-500/35 shadow-[0_0_44px_rgba(139,92,246,0.20)]',
        chatCss: 'ring-1 ring-violet-500/40 shadow-[0_0_18px_rgba(139,92,246,0.14)]',
        victoryCss: 'ring-2 ring-violet-500/35 shadow-[0_0_34px_rgba(139,92,246,0.20)]',
      },
    ],
  },
  {
    id: 'caminho_mestre',
    name: 'Caminho do Mestre',
    icon: '🥋',
    description: 'Disciplina, serenidade e a presença de quem dominou a própria energia.',
    pieceIds: [
      'aura_ki_pulsante',
      'title_lendario',
      'bg_sala_tempo',
      'roupa_gi_branco',
      'pose_mestre_sereno',
      'card_aura_ancestral',
    ],
    milestones: [
      {
        pieces: 2,
        name: 'Disciplina',
        description: 'A identidade ganha acabamento sereno de mestre.',
        badgeCss: 'border-sky-800/50 bg-sky-950/45 text-sky-300',
        identityCss: 'border-slate-600/35 bg-gradient-to-r from-slate-950/35 via-sky-950/15 to-slate-950/35',
        avatarCss: 'shadow-[0_0_18px_rgba(125,211,252,0.24)]',
      },
      {
        pieces: 4,
        name: 'Domínio Interior',
        description: 'Ficha e mensagens recebem uma presença calma e luminosa.',
        badgeCss: 'border-sky-600/55 bg-sky-950/55 text-sky-200',
        identityCss: 'border-sky-700/40 bg-gradient-to-r from-slate-950/45 via-sky-950/25 to-cyan-950/20 shadow-[0_0_16px_rgba(125,211,252,0.10)]',
        avatarCss: 'shadow-[0_0_24px_rgba(125,211,252,0.32)]',
        profileCss: 'ring-1 ring-sky-500/30 shadow-[0_0_32px_rgba(125,211,252,0.12)]',
        chatCss: 'ring-1 ring-sky-700/30 shadow-[0_0_12px_rgba(125,211,252,0.08)]',
      },
      {
        pieces: 6,
        name: 'Mestre Transcendente',
        description: 'Conjunto completo: assinatura serena máxima em todas as superfícies sociais.',
        badgeCss: 'border-cyan-400/55 bg-gradient-to-r from-slate-950/80 to-cyan-950/55 text-cyan-100 shadow-[0_0_12px_rgba(103,232,249,0.14)]',
        identityCss: 'border-cyan-500/45 bg-gradient-to-r from-slate-950/60 via-sky-950/30 to-cyan-950/35 shadow-[0_0_24px_rgba(103,232,249,0.14)]',
        avatarCss: 'shadow-[0_0_30px_rgba(103,232,249,0.40)]',
        profileCss: 'ring-2 ring-cyan-400/30 shadow-[0_0_42px_rgba(103,232,249,0.16)]',
        chatCss: 'ring-1 ring-cyan-400/30 shadow-[0_0_16px_rgba(103,232,249,0.10)]',
        victoryCss: 'ring-2 ring-cyan-400/30 shadow-[0_0_32px_rgba(103,232,249,0.16)]',
      },
    ],
  },
];

export function getCosmeticSet(id: CosmeticSetId): CosmeticSetDef | undefined {
  return COSMETIC_SETS.find((set) => set.id === id);
}

export function cosmeticSetProgress(
  set: CosmeticSetDef,
  ownedIds: Iterable<string>,
  equipped: Partial<Record<CosmeticSlot, string>> | null | undefined
): CosmeticSetProgress {
  const owned = new Set(ownedIds);
  const equippedIds = new Set(Object.values(equipped ?? {}).filter((id): id is string => typeof id === 'string'));
  const ownedCount = set.pieceIds.filter((id) => owned.has(id)).length;
  const equippedCount = set.pieceIds.filter((id) => equippedIds.has(id)).length;
  const activeMilestone =
    [...set.milestones].sort((a, b) => b.pieces - a.pieces).find((milestone) => equippedCount >= milestone.pieces) ?? null;
  const nextMilestone =
    [...set.milestones].sort((a, b) => a.pieces - b.pieces).find((milestone) => equippedCount < milestone.pieces) ?? null;
  return {
    set,
    ownedCount,
    equippedCount,
    total: set.pieceIds.length,
    activeMilestone,
    nextMilestone,
  };
}

export function activeCosmeticSets(
  equipped: Partial<Record<CosmeticSlot, string>> | null | undefined
): Array<CosmeticSetProgress & { activeMilestone: CosmeticSetMilestone }> {
  return COSMETIC_SETS
    .map((set) => cosmeticSetProgress(set, [], equipped))
    .filter(
      (progress): progress is CosmeticSetProgress & { activeMilestone: CosmeticSetMilestone } =>
        progress.activeMilestone !== null
    )
    .sort(
      (a, b) =>
        b.activeMilestone.pieces - a.activeMilestone.pieces ||
        b.equippedCount - a.equippedCount ||
        a.set.name.localeCompare(b.set.name, 'pt-BR')
    );
}

export function dominantCosmeticSet(
  equipped: Partial<Record<CosmeticSlot, string>> | null | undefined
): (CosmeticSetProgress & { activeMilestone: CosmeticSetMilestone }) | null {
  return activeCosmeticSets(equipped)[0] ?? null;
}

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

/** Recorte público: só revela o que está equipado, nunca a coleção possuída. */
export function publicCosmeticsFromRaw(raw: string | null | undefined) {
  return { equipped: parseCosmeticsEquipped(raw) };
}

/** Texto curto para a loja deixar claro onde o cosmético é visto. */
export function cosmeticPublicSurfaces(cosmetic: CosmeticDef): string[] {
  return cosmetic.publicSurfaces ?? ['Perfil'];
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
