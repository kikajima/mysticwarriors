// =====================================================================
// Tipos compartilhados do jogo (fonte única de contratos front/back)
// =====================================================================

import type { CosmeticSlot } from './content/cosmetics';

export type RaceId = 'saiyajin' | 'humano' | 'namekuseijin' | 'androide' | 'majin';

// ===== Raças (mecânicas declarativas — única fonte de verdade) =====

/** Efeitos mecânicos de uma raça. Aplicados simetricamente a atacante e defensor. */
export interface RaceCombatDef {
  physicalDamageMult: number;  // multiplicador de dano físico causado
  kiDamageMult: number;        // multiplicador de dano de Ki causado
  defenseMult: number;         // multiplicador de defesa física e resistência
  dodgeBonus: number;          // bônus de chance de esquiva
  speedMult: number;           // multiplicador de velocidade total
  kiAttackChanceBonus: number; // bônus na chance de escolher ataque de energia
  absorbOnWinPct: number;      // % do HP máximo absorvido ao vencer
}

export interface RaceEconomyDef {
  xpBattleMult: number;      // XP de batalhas
  zeniMissionMult: number;   // Zeni de missões
  zeniBattleMult: number;    // Zeni de batalhas
  missionEnergyMult: number; // custo de energia das missões
  trainCostMult: number;     // custo de treino
  energyRegenMult: number;   // velocidade de regeneração de energia
  hpRegenMult: number;       // velocidade de regeneração de vida
  zenkai: boolean;           // bônus Saiyajin ao perder batalhas
}

export interface RaceInfo {
  id: RaceId;
  name: string;
  tagline: string;
  description: string;
  color: string;
  avatar: string;
  perks: string[];         // lista de bônus exibidos na UI (espelham os números reais)
  combat: RaceCombatDef;
  economy: RaceEconomyDef;
}

// ===== Profissões — Carreira 1–10 + loot =====

export type ProfessionId = 'agricultor' | 'cientista' | 'academico' | 'policial' | 'atleta';
export type ProfessionAttribute = 'strength' | 'defense' | 'speed' | 'ki' | null;
export type ProfessionMaterialRarity = 'common' | 'rare';

/** Progresso persistido de UMA profissão. O nível é sempre DERIVADO das horas. */
export interface ProfessionProgress {
  /** Horas acumuladas no ciclo atual de carreira (0..4450). */
  hours: number;
  /** Horas históricas, nunca diminuem; será usada por conquistas/Prestígio. */
  lifetimeHours: number;
  /** Reservado para a PR de Prestígio. Nesta fase começa em 0. */
  prestige: number;
  /** Campo legado de compatibilidade; ganhos atuais são inteiros e este valor permanece 0. */
  statMilliRemainder: number;
  /** Atributo realmente concedido neste ciclo; necessário para Prestígio futuro. */
  cycleStatGranted: number;
}

/** Mapa professionId → progresso (JSON na coluna Player.professions). */
export type ProfessionsMap = Record<string, ProfessionProgress>;

export interface ProfessionDef {
  id: ProfessionId;
  name: string;
  description: string;
  icon: string;
  /** Atributo beneficiado pelo trabalho; Acadêmico é utilitário/meta. */
  attribute: ProfessionAttribute;
}

/** Balanceamento compartilhado dos Níveis 1–10. */
export interface ProfessionLevelRewards {
  level: number;
  hoursInLevel: number;
  cumulativeHours: number;
  zeniPerHour: number;
  /** Ganho inteiro de atributo/hora, codificado em milésimos por compatibilidade (sempre múltiplo de 1000). */
  attributeMilliPerHour: number;
  /** XP/hora por nível do personagem (ex.: 4 = 4 × nível por hora). */
  xpPerPlayerLevel: number;
  /** Chance base de material raro por HORA, antes do multiplicador do turno. */
  rareChance: number;
}

export interface ProfessionShiftDef {
  hours: 1 | 2 | 4 | 8;
  /** Multiplicador aplicado a XP e à chance de raro; turnos longos podem passar de 100%. */
  efficiency: number;
}

export interface ProfessionMaterialDef {
  id: string;
  name: string;
  professionId: ProfessionId;
  rarity: ProfessionMaterialRarity;
  tier: 1 | 2 | 3 | 4 | 5;
  icon: string;
}

export interface ProfessionLootEntry {
  itemId: string;
  quantity: number;
}

// ===== Oficina / Crafting =====

export interface CraftIngredientDef {
  itemId: string;
  quantity: number;
}

export interface CraftProfessionRequirement {
  professionId: ProfessionId;
  level: number;
}

export interface CraftStackItemDef {
  id: string;
  name: string;
  description: string;
  tier: 1 | 2 | 3 | 4 | 5;
  icon: string;
  kind: 'blueprint';
}

export interface CraftRecipeDef {
  id: string;
  name: string;
  description: string;
  tier: 1 | 2 | 3 | 4 | 5;
  icon: string;
  outputItemId: string;
  outputQuantity: number;
  outputKind: 'stack' | 'player_item';
  costZeni: number;
  baseDurationMin: number;
  /** Quantidade máxima por lote. Ausente = apenas 1 unidade por fabricação. */
  maxBatch?: number;
  /** Blueprints são receitas acadêmicas e aparecem na seção de Projetos. */
  requiresAcademic?: boolean;
  /** Níveis mínimos de carreira exigidos para iniciar esta fabricação. */
  professionRequirements?: CraftProfessionRequirement[];
  ingredients: CraftIngredientDef[];
}

// ===== Inimigos (PvE) =====

export interface Enemy {
  id: string;
  name: string;
  taunt: string;
  level: number;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
  zeniReward: number;
  xpReward: number;
  color: string;
  emoji: string;
}

// ===== Itens =====

export type EquipmentSlot = 'head' | 'wrists' | 'armor' | 'accessory' | 'weapon' | 'legs' | 'boots';
/** Categorias reais de equipamento. Acessórios usam dois espaços equipáveis. */
export type EquippedSlot = EquipmentSlot | 'accessory2';
export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['head', 'wrists', 'armor', 'accessory', 'weapon', 'legs', 'boots'];
export const EQUIPPED_SLOTS: EquippedSlot[] = ['head', 'wrists', 'armor', 'accessory', 'accessory2', 'weapon', 'legs', 'boots'];

export const EQUIPMENT_SLOT_META: Record<EquipmentSlot, { label: string; icon: string }> = {
  head: { label: 'Cabeça', icon: '🪖' },
  wrists: { label: 'Punhos', icon: '🥊' },
  armor: { label: 'Torso', icon: '🛡️' },
  accessory: { label: 'Acessório', icon: '💍' },
  weapon: { label: 'Arma', icon: '⚔️' },
  legs: { label: 'Pernas', icon: '👖' },
  boots: { label: 'Botas', icon: '🥾' },
};

export const EQUIPPED_SLOT_META: Record<EquippedSlot, { label: string; icon: string }> = {
  ...EQUIPMENT_SLOT_META,
  accessory: { label: 'Acessório I', icon: '💍' },
  accessory2: { label: 'Acessório II', icon: '💍' },
};

export type ItemCategory = EquipmentSlot | 'consumable' | 'training';

export interface TrainBonus {
  all?: number;
  strength?: number;
  defense?: number;
  speed?: number;
  ki?: number;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  price: number;
  /** v0.9.2 — moeda do preço: 'zeni' (padrão) ou 'crystal' (diamantes).
   * Equipamentos de TREINO e CONSUMÍVEIS agora custam diamantes — o Zeni
   * continua valendo para armas/armaduras/acessórios e treinos. */
  currency?: 'zeni' | 'crystal';
  minLevel: number;
  // bônus de equipamento em combate
  atk?: number;   // poder de ataque físico
  def?: number;   // defesa física
  spd?: number;   // velocidade
  ki?: number;    // poder de ataque de energia / resistência
  // equipamentos de treino: bônus aplicado ao treinar atributos
  trainBonus?: TrainBonus;
  /** Bônus absoluto na chance da Busca pelas Esferas (0.02 = +2 p.p.). */
  dragonBallSearchChanceBonus?: number;
  // consumíveis
  effect?: 'full_hp' | 'full_energy' | 'stat_boost' | 'heal_30pct';
  icon: string;
}

export interface ItemsState {
  weapon: string | null;
  armor: string | null;
  accessory: string | null;
  /** Segundo acessório; opcional para tolerar saves anteriores à expansão. */
  accessory2?: string | null;
  /** Slots adicionais introduzidos pela Oficina; opcionais para tolerar saves legados. */
  head?: string | null;
  wrists?: string | null;
  legs?: string | null;
  boots?: string | null;
  /** ids ÚNICOS de equipamentos/treino possuídos (duplicatas NUNCA entram
   *  aqui — o bônus de itens de treino soma por entrada; quantidades
   *  ficam no mapa `stacks`). */
  owned: string[];
  consumables: Record<string, number>;
  /** v0.9.10 (Mudança 2): quantidade por id de equipamento/treino
   *  (unidades empilháveis — reservas). Uma unidade pode estar "em uso"
   *  num slot (weapon/armor/accessory) ou ativa como passivo (treino);
   *  as demais são reservas vendáveis. Ausente/1 = comportamento antigo. */
  stacks: Record<string, number>;
}

// ===== Técnicas (data-driven) =====

export type TechniqueType = 'physical' | 'energy';
export type TechniqueCategory = 'basic' | 'advanced' | 'supreme';

export interface TechniqueDef {
  id: string;
  name: string;
  description: string;
  type: TechniqueType;          // dimensionado por Força ou por Ki
  category: TechniqueCategory;  // básica, avançada ou suprema (slot do loadout)
  power: number;                // multiplicador de dano
  kiCost: number;               // Ki consumido por uso em combate
  accuracy: number;             // modificador de precisão (0 = normal; 0.1 = +10%)
  minLevel: number;             // requisito de nível para aprender
  price: number;                // custo em Zeni com o mestre
  effects?: {
    selfHealPct?: number;       // cura % do HP máximo ao usar
    defensePierce?: number;     // ignora % da defesa
    extraDodge?: number;        // esquiva bônus no próximo turno (reservado)
  };
  icon: string;
}

export interface TrainingMaster {
  id: string;
  name: string;
  title: string;
  quote: string;
  location: string;
  gradient: string;
  emoji: string;
  techniques: string[];
}

/** Loadout de técnicas equipadas: 3 slots normais + 1 slot suprema. */
export type LoadoutSlot = '1' | '2' | '3' | 'S';
export type Loadout = Record<LoadoutSlot, string | null>;

// ===== Estratégias de combate =====

export type StrategyId = 'balanced' | 'aggressive' | 'defensive' | 'melee' | 'ki_specialist';

export interface StrategyDef {
  id: StrategyId;
  name: string;
  description: string;
  icon: string;
  /** ajustes da engine — sem garantia de vitória */
  damageDealtMult: number;
  damageTakenMult: number;
  physicalBias: number;     // -1..1 (>0 prefere físico, <0 prefere energia)
  techniqueAggression: number; // 0..1 chance extra de usar técnica
  dodgeBonus: number;
}

// ===== Transformações =====

export interface TransformationDef {
  id: string;
  name: string;
  race: RaceId | 'any';
  description: string;
  icon: string;
  color: string;              // gradiente tailwind
  order: number;              // profundidade na árvore
  minLevel: number;
  requiredStats?: { strength?: number; defense?: number; speed?: number; ki?: number };
  requiresTransformation?: string;   // pré-requisito na árvore
  requiredMission?: string;
  requiredTechnique?: string;
  requiredItem?: string;
  bonuses?: { strength?: number; defense?: number; speed?: number; ki?: number }; // ganho permanente ao desbloquear
  multipliers?: { physical?: number; ki?: number; defense?: number; speed?: number }; // ativos em combate
}

// ===== Quests diárias/semanais =====

export type QuestMetric =
  | 'battle_win'
  | 'pvp_battle'
  | 'training_done'
  | 'mission_completed'
  | 'technique_used'
  | 'energy_spent'
  // v0.9.18 — torneio de artes marciais
  | 'tournament_win';

export interface QuestDef {
  id: string;
  kind: 'daily' | 'weekly';
  name: string;
  description: string;
  metric: QuestMetric;
  target: number;
  rewardZeni: number;
  rewardXp: number;
  rewardCrystals: number;
  icon: string;
}

export interface QuestView {
  questId: string;
  kind: 'daily' | 'weekly';
  name: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  rewardZeni: number;
  rewardXp: number;
  rewardCrystals: number;
  claimed: boolean;
  ready: boolean;
}

// ===== Conquistas =====

export type AchievementMetric =
  | 'battlesWon'
  | 'battlesLost'
  | 'missionsDone'
  | 'level'
  | 'techniquesLearned'
  | 'guildMembership'
  | 'itemsOwned'
  | 'transformationsOwned'
  | 'dragonBalls'
  | 'pvpWins'
  | 'trainingDone'
  | 'guildDonated'
  | 'miracleWins'
  | 'davidWins'
  // v0.9.18 — torneio de artes marciais
  | 'tournamentTitles'
  | 'tournamentRoundWins';

export interface AchievementDef {
  id: string;
  category: 'battle' | 'training' | 'level' | 'pvp' | 'technique' | 'guild' | 'collection' | 'progression' | 'narrative' | 'tournament';
  name: string;
  description: string;
  metric: AchievementMetric;
  target: number;
  rewardZeni: number;
  rewardXp: number;
  rewardCrystals: number;
  icon: string;
}

export interface AchievementView {
  achievementId: string;
  category: string;
  name: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  rewardZeni: number;
  rewardXp: number;
  rewardCrystals: number;
  unlocked: boolean;
  claimed: boolean;
}

// ===== Guildas =====

export interface GuildSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  totalPower: number;
  leaderName: string;
  level: number;
  totalDonated: number;
}

export interface GuildMemberView {
  roleId?: string | null;
  roleName?: string;
  rank?: number;
  online?: boolean;
  donated?: number;
  id: string;
  name: string;
  race: RaceId;
  level: number;
  power: number;
  isLeader: boolean;
  isMe: boolean;
}

export interface GuildDetail {
  motd?: string;
  capacity?: number;
  permissions?: string[];
  myRank?: number;
  roles?: Array<{ id: string; name: string; rank: number; permissions: string[] }>;
  donors?: Array<{ id: string; name: string; total: number }>;
  invitations?: Array<{ id: string; name: string; expiresAt: string }>;
  id: string;
  name: string;
  description: string;
  leaderId: string;
  level: number;
  xp: number;
  xpToNext: number;
  totalDonated: number;
  members: GuildMemberView[];
}

// ===== Combate =====

export interface Combatant {
  guildCritical?: number;
  name: string;
  emoji: string;
  level: number;
  race: RaceId | 'none';
  strength: number;
  defense: number;
  speed: number;      // velocidade total (com equipamentos e multiplicadores)
  ki: number;         // Ki total (com equipamentos)
  maxHp: number;
  atkPower: number;   // poder de ataque físico
  kiPower: number;    // poder de ataque de energia
  defPower: number;   // defesa física
  resPower: number;   // resistência de energia
  /** Poder de luta do scouter — alimenta a ESCALA DE PODER (regra 5.1). */
  power: number;
  raceCombat: RaceCombatDef;
  techniques: TechniqueDef[];
  strategy: StrategyDef;
  maxBattleKi: number;
  battleKi: number;
  transformation?: { name: string; icon: string; physical: number; ki: number; defense: number; speed: number } | null;
  /** v0.9.15 — Talentos de Ímpeto dominados (Cap. 7); NPCs não têm. */
  talents?: string[];
}

export interface BattleRound {
  round: number;
  attacker: 'player' | 'enemy';
  action: 'attack' | 'energy' | 'dodge' | 'technique' | 'miss';
  damage: number;
  playerHp: number;
  enemyHp: number;
  playerKi: number;
  enemyKi: number;
  text: string;
  technique?: string;
  techniqueIcon?: string;
  /** v0.9.12 — Armadura de Escala (regras 5.1/5.3): evento narrativo
   * do round para a UI destacar (cor/ícone) no log de batalha. */
  scaleEvent?: 'armor' | 'advantage' | 'crushing' | 'abertura' | 'breakthrough';
  /** v0.9.13 — Ímpeto (Cap. 7 do ASCENSÃO Z): instante do Ímpeto de
   * cada lado ao final do round (0–6) para o medidor do log animado. */
  playerImpeto?: number;
  enemyImpeto?: number;
  /** v0.9.13 — evento de Ímpeto do round para destaque na UI. */
  impetoEvent?:
    | 'gain'
    | 'combo'
    | 'heroic-defense'
    | 'quebra-de-limite'
    | 'reroll'
    | 'reposition'
    | 'exaustao'
    | 'segundo-vento';
  /** v0.9.21 — rodada de DECISÃO DOS JURADOS (limite de rodadas sem
   * nocaute): entrada narrada especial publicando o critério do
   * desempate no próprio log (regra exigida: o jogador precisa ver
   * POR QUE a luta foi decidida). */
  decision?: 'round-limit';
}

export interface BattleSimulation {
  won: boolean;
  rounds: BattleRound[];
  /** Quem desferiu o PRIMEIRO golpe — SEMPRE assignado pela engine.
   *  Nullable por contrato: o frontend DEVE fazer null-check antes de usar. */
  firstAction: { isPlayer: boolean } | null;
  playerStartHp: number;
  playerEndHp: number;
  playerMaxHp: number;
  enemyStartHp: number;
  enemyEndHp: number;
  enemyMaxHp: number;
  techniquesUsed: string[];
  /** v0.9.17 — conquista "Milagre no Limite": venceu com a Quebra de
   * Limite ativada em algum momento do combate (narrativa do Cap. 29). */
  miracleWin?: boolean;
  /** v0.9.17 — conquista "David vs Golias": Reposicionamento Dramático
   * anulou um golpe poderoso de oponente 2+ escalas acima. */
  davidReposition?: boolean;
}

export interface BattleResult extends BattleSimulation {
  xpGain: number;
  zeniGain: number;
  /** v0.9.18 — cristais ganhos (torneio; ausente = 0) */
  crystalsGain?: number;
  zeniStolen?: number;
  dragonBallStolen?: number;
  dragonBallStolenStar?: number;
  enemyName: string;
  enemyEmoji: string;
  opponentLevel: number;
  zenkaiGranted?: boolean;
}

export interface DerivedStats {
  maxHp: number;
  maxEnergy: number;
  atkPower: number;
  kiPower: number;
  defPower: number;
  resPower: number;
  /** Bônus crus somados pelos equipamentos equipados. */
  equipmentBonuses: {
    strength: number;
    defense: number;
    speed: number;
    ki: number;
  };
  /** Atributo base + bônus dos equipamentos, para exibição clara ao jogador. */
  totalStats: {
    strength: number;
    defense: number;
    speed: number;
    ki: number;
  };
  power: number; // poder de luta total (scouter)
}

/** Dados de regeneração por tempo — alimentam o contador do Dashboard. */
export interface RegenInfo {
  energyIntervalSec: number; // segundos entre pontos de energia (com bônus racial)
  hpIntervalSec: number;     // segundos entre pontos de vida (com bônus racial)
  lastRegenAt: string;       // ISO timestamp do relógio de ENERGIA
  lastRegenHpAt: string;     // ISO timestamp do relógio de VIDA (independente)
}

export interface ActiveMission {
  missionId: string;
  startedAt: string;
  endsAt: string;
  hours: 1 | 2 | 4 | 8;
}

/** Missão concluída aguardando coleta (timer expirou). */
export interface ClaimableMission {
  missionId: string;
  hours: 1 | 2 | 4 | 8;
}

/**
 * ATIVIDADE COM DURAÇÃO SERVER-SIDE (treino/batalha):
 * o servidor persiste início/término/identidade e concede o resultado
 * APENAS após o término — recarregar a página retoma o trecho restante.
 */
export interface PlayerNotificationView {
  id: string;
  kind: 'dragon_ball_stolen' | 'dragon_ball_lost' | 'admin';
  title: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityView {
  id: string;
  kind: 'train' | 'battle' | 'dragon_ball_search';
  startedAt: string;
  endsAt: string;
  /** ms restantes calculados pelo servidor no momento da resposta */
  remainingMs: number;
  /** resultado COMPUTADO no início (animação da UI); aplicado no término */
  result: {
    message: string;
    levelsGained: number;
    battle?: BattleResult;
    missionResult?: { zeniGain: number; xpGain: number; foundDragonBall: boolean };
    bossAttack?: { damage: number; xpGain: number; killed: boolean; cooldownSec: number };
    searchResult?: { found: boolean; chance: number };
  };
}

/** Cosméticos do personagem: posse é por CONTA, equipar é por PERSONAGEM. */
export interface CosmeticsView {
  /** ids de cosméticos adquiridos pela conta */
  owned: string[];
  /** cosmético equipado por slot (deste personagem) */
  equipped: Partial<Record<CosmeticSlot, string>>;
}

/** v0.9.18 — Torneio de Artes Marciais (visão do cliente). */
export interface TournamentView {
  /** rodada da PRÓXIMA luta (1–3); 0 = fora de campanha */
  round: number;
  /** vitórias na campanha atual */
  wins: number;
  /** nº da campanha atual/última (rotação do elenco) */
  runCount: number;
  /** melhor rodada alcançada em qualquer campanha (0 = nunca lutou) */
  bestRound: number;
  /** títulos de campeão conquistados (coluna permanente) */
  titles: number;
  /** lutas de torneio vencidas no total (coluna permanente) */
  roundWins: number;
  /** fim do cooldown p/ nova inscrição (ISO); null = livre */
  cooldownEndsAt: string | null;
}

export interface PlayerView {
  id: string;
  name: string;
  race: RaceId;
  // v0.16 — gender REMOVIDO da view (mecânica extinta — DESIGN-DECISIONS.md).
  avatarUrl: string | null;
  level: number;
  xp: number;
  xpToNext: number;
  zeni: number;
  crystals: number;
  hp: number;
  energy: number;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
  battlesWon: number;
  battlesLost: number;
  missionsDone: number;
  dragonBalls: number;
  /** Quantas das sete estrelas globais estão atualmente sem dono. */
  dragonBallsAvailable?: number;
  items: ItemsState;
  techniques: string[];
  loadout: Loadout;
  strategy: StrategyId;
  transformation: { id: string; name: string; icon: string } | null;
  transformationsOwned: string[];
  guild: { id: string; name: string; isLeader: boolean; level: number } | null;
  /** Trabalho de profissão com timer CORRENDO (bloqueia ações). Null se expirado. */
  activeMission: ActiveMission | null;
  /** Trabalho concluído aguardando coleta (não bloqueia nada). */
  claimableMission: ClaimableMission | null;
  /** Progresso nas profissões (rank/completions por professionId). */
  professions: ProfessionsMap;
  /** Atividade em andamento (treino/batalha com duração server-side). */
  runningActivity: ActivityView | null;
  /** Cosméticos: posse (conta) + equipados (personagem). */
  cosmetics: CosmeticsView;
  /** v0.9.15 — Talentos de Ímpeto dominados (ids). */
  talents: string[];
  /** v0.9.18 — Torneio de Artes Marciais: campanha atual + palmarés. */
  tournament: TournamentView;
  derived: DerivedStats;
  regen: RegenInfo;
  isBot: boolean;
  rankingPosition?: number | null;
}

export interface RankingEntry {
  id: string;
  name: string;
  race: RaceId;
  level: number;
  power: number;
  battlesWon: number;
  battlesLost: number;
  isMe: boolean;
  isBot: boolean;
  attackable: boolean;
  guildName?: string | null;
  /** Visível apenas para quem possui o Radar das Esferas. */
  dragonBallStars?: number[] | null;
  position?: number;
  /** Only level differences restrict ranking challenges. */
  blockReason?: 'level' | null;
}

export interface RankingPage {
  entries: RankingEntry[];
  total: number;
  page: number;
  pageSize: number;
  myPosition: number | null;
  /** v0.9.5 — de onde veio a lista: nuvem (todos do Supabase) ou servidor (reserva). */
  source?: 'cloud' | 'local';

}

// ===== Ameaça Universal =====

export interface WorldBossView {
  id: string;
  name: string;
  emoji: string;
  description: string;
  maxHp: number;
  currentHp: number;
  endsAt: string;
  status: string;
  level: number;
  /** v0.9.12 — poder de luta do scouter (mesma fórmula única) para o
   * selo da Escala de Poder e a regra 5.1 no card. */
  power: number;
  zeniReward: number;
  xpReward: number;
  crystalReward: number;
  myDamage: number;
  myPosition: number | null;
  topDamage: Array<{ name: string; damage: number; isMe: boolean }>;
  totalAttackers: number;
  canAttackAt: string | null; // quando poderá atacar de novo
}

// ===== Temporadas =====

export interface SeasonView {
  id: string;
  name: string;
  number: number;
  startsAt: string;
  endsAt: string;
  status: string;
  daysLeft: number;
  myPoints: number;
  myPosition: number | null;
}
