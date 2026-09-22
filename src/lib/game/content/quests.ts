import type { QuestDef, AchievementDef } from '../types';

// =====================================================================
// QUESTS DIÁRIAS E SEMANAIS — templates data-driven
// ---------------------------------------------------------------------
// O servidor sorteia (deterministicamente por jogador+período) um subconjunto
// desses templates. Progresso é acumulado pelas ações do jogo.
// =====================================================================

export const DAILY_QUESTS: QuestDef[] = [
  {
    id: 'daily_battles',
    kind: 'daily',
    name: 'Sangue quente',
    description: 'Vença 3 batalhas hoje (PvE ou PvP).',
    metric: 'battle_win',
    target: 3,
    rewardZeni: 400,
    rewardXp: 120,
    rewardCrystals: 1,
    icon: '⚔️',
  },
  {
    id: 'daily_trainings',
    kind: 'daily',
    name: 'Disciplina de ferro',
    description: 'Complete 5 treinos de atributos.',
    metric: 'training_done',
    target: 5,
    rewardZeni: 300,
    rewardXp: 80,
    rewardCrystals: 1,
    icon: '💪',
  },
  {
    id: 'daily_missions',
    kind: 'daily',
    name: 'Dia produtivo',
    description: 'Conclua 2 turnos de trabalho (profissões).',
    metric: 'mission_completed',
    target: 2,
    rewardZeni: 500,
    rewardXp: 150,
    rewardCrystals: 0,
    icon: '🗺️',
  },
  {
    id: 'daily_pvp',
    kind: 'daily',
    name: 'Rival de hoje',
    description: 'Lute 1 batalha PvP contra outro guerreiro.',
    metric: 'pvp_battle',
    target: 1,
    rewardZeni: 600,
    rewardXp: 200,
    rewardCrystals: 1,
    icon: '🎯',
  },
  {
    id: 'daily_techniques',
    kind: 'daily',
    name: 'Fluxo de energia',
    description: 'Use 5 técnicas em batalhas.',
    metric: 'technique_used',
    target: 5,
    rewardZeni: 350,
    rewardXp: 100,
    rewardCrystals: 0,
    icon: '🔥',
  },
  {
    id: 'daily_energy',
    kind: 'daily',
    name: 'Sem preguiça',
    description: 'Gaste 60 pontos de energia em batalhas, treinos e trabalhos.',
    metric: 'energy_spent',
    target: 60,
    rewardZeni: 450,
    rewardXp: 130,
    rewardCrystals: 1,
    icon: '⚡',
  },
];

export const WEEKLY_QUESTS: QuestDef[] = [
  {
    id: 'weekly_battles',
    kind: 'weekly',
    name: 'Semana de guerra',
    description: 'Vença 15 batalhas nesta semana.',
    metric: 'battle_win',
    target: 15,
    rewardZeni: 3500,
    rewardXp: 1200,
    rewardCrystals: 5,
    icon: '🏆',
  },
  {
    id: 'weekly_trainings',
    kind: 'weekly',
    name: 'Templo da persistência',
    description: 'Complete 25 treinos nesta semana.',
    metric: 'training_done',
    target: 25,
    rewardZeni: 2500,
    rewardXp: 900,
    rewardCrystals: 4,
    icon: '🏋️',
  },
  {
    id: 'weekly_missions',
    kind: 'weekly',
    name: 'Herói local',
    description: 'Conclua 10 turnos de trabalho (profissões) nesta semana.',
    metric: 'mission_completed',
    target: 10,
    rewardZeni: 3000,
    rewardXp: 1000,
    rewardCrystals: 4,
    icon: '📜',
  },
  {
    id: 'weekly_pvp',
    kind: 'weekly',
    name: 'Caçador de rivais',
    description: 'Lute 5 batalhas PvP nesta semana.',
    metric: 'pvp_battle',
    target: 5,
    rewardZeni: 4000,
    rewardXp: 1500,
    rewardCrystals: 6,
    icon: '🗡️',
  },
  {
    // v0.9.18 — torneio de artes marciais
    id: 'weekly_tournament',
    kind: 'weekly',
    name: 'Gladiador da arena',
    description: 'Vença 5 lutas de torneio nesta semana (as rodadas vencidas na chave de 8 contam).',
    metric: 'tournament_win',
    target: 5,
    rewardZeni: 3500,
    rewardXp: 1100,
    rewardCrystals: 5,
    icon: '🏟️',
  },
];

// =====================================================================
// CONQUISTAS — progressão permanente por métricas acumuladas
// =====================================================================

export const ACHIEVEMENTS: AchievementDef[] = [
  // Batalha
  { id: 'first_blood', category: 'battle', name: 'Primeiro Sangue', description: 'Vença sua primeira batalha.', metric: 'battlesWon', target: 1, rewardZeni: 200, rewardXp: 50, rewardCrystals: 1, icon: '🩸' },
  { id: 'veteran_50', category: 'battle', name: 'Veterano de Guerra', description: 'Vença 50 batalhas.', metric: 'battlesWon', target: 50, rewardZeni: 3000, rewardXp: 800, rewardCrystals: 3, icon: '🎖️' },
  { id: 'veteran_250', category: 'battle', name: 'Lenda do Campo', description: 'Vença 250 batalhas.', metric: 'battlesWon', target: 250, rewardZeni: 15000, rewardXp: 5000, rewardCrystals: 10, icon: '🏅' },
  { id: 'phoenix_25', category: 'battle', name: 'Fênix Guerreira', description: 'Perca 25 batalhas e levante de novo.', metric: 'battlesLost', target: 25, rewardZeni: 1500, rewardXp: 400, rewardCrystals: 2, icon: '🔥' },
  // Treino
  { id: 'train_100', category: 'training', name: 'Mãos Calejadas', description: 'Complete 100 treinos.', metric: 'trainingDone', target: 100, rewardZeni: 5000, rewardXp: 1500, rewardCrystals: 4, icon: '🥊' },
  { id: 'train_500', category: 'training', name: 'Corpo de Aço', description: 'Complete 500 treinos.', metric: 'trainingDone', target: 500, rewardZeni: 25000, rewardXp: 8000, rewardCrystals: 12, icon: '🗿' },
  // Nível
  { id: 'level_10', category: 'level', name: 'Aquecimento', description: 'Alcance o nível 10.', metric: 'level', target: 10, rewardZeni: 1000, rewardXp: 0, rewardCrystals: 2, icon: '⭐' },
  { id: 'level_25', category: 'level', name: 'Guerreiro de Elite', description: 'Alcance o nível 25.', metric: 'level', target: 25, rewardZeni: 8000, rewardXp: 0, rewardCrystals: 6, icon: '🌟' },
  { id: 'level_50', category: 'level', name: 'Beyond the Limits', description: 'Alcance o nível 50.', metric: 'level', target: 50, rewardZeni: 40000, rewardXp: 0, rewardCrystals: 20, icon: '💫' },
  // PvP
  { id: 'pvp_first', category: 'pvp', name: 'Rival Nato', description: 'Vença 1 batalha PvP.', metric: 'pvpWins', target: 1, rewardZeni: 500, rewardXp: 150, rewardCrystals: 1, icon: '🎯' },
  { id: 'pvp_25', category: 'pvp', name: 'Dominador de Arena', description: 'Vença 25 batalhas PvP.', metric: 'pvpWins', target: 25, rewardZeni: 6000, rewardXp: 2000, rewardCrystals: 8, icon: '👑' },
  // Técnicas
  { id: 'tech_3', category: 'technique', name: 'Estudioso', description: 'Aprenda 3 técnicas com os mestres.', metric: 'techniquesLearned', target: 3, rewardZeni: 1200, rewardXp: 300, rewardCrystals: 2, icon: '📖' },
  { id: 'tech_8', category: 'technique', name: 'Mestre das Artes', description: 'Aprenda 8 técnicas com os mestres.', metric: 'techniquesLearned', target: 8, rewardZeni: 8000, rewardXp: 2500, rewardCrystals: 8, icon: '🧙' },
  // Guilda
  { id: 'guild_member', category: 'guild', name: 'Irmão de Armas', description: 'Faça parte de uma guilda.', metric: 'guildMembership', target: 1, rewardZeni: 800, rewardXp: 200, rewardCrystals: 1, icon: '🛡️' },
  { id: 'guild_donator', category: 'guild', name: 'Mecenas', description: 'Doe 50.000 Créditos para guildas (total).', metric: 'guildDonated', target: 50000, rewardZeni: 10000, rewardXp: 3000, rewardCrystals: 10, icon: '💰' },
  // Coleção
  { id: 'items_10', category: 'collection', name: 'Colecionador', description: 'Tenha 10 itens diferentes no inventário.', metric: 'itemsOwned', target: 10, rewardZeni: 2000, rewardXp: 600, rewardCrystals: 3, icon: '🎒' },
  { id: 'dragao_7', category: 'collection', name: 'Guardião das Chaves', description: 'Tenha as 7 Chaves do Horizonte ao mesmo tempo.', metric: 'dragonBalls', target: 7, rewardZeni: 7000, rewardXp: 2000, rewardCrystals: 15, icon: '🔮' },
  // Progressão
  { id: 'missions_50', category: 'progression', name: 'Trabalhador Incansável', description: 'Conclua 50 turnos de trabalho.', metric: 'missionsDone', target: 50, rewardZeni: 4000, rewardXp: 1200, rewardCrystals: 4, icon: '📋' },
  { id: 'transform_1', category: 'progression', name: 'Além dos Limites', description: 'Desbloqueie sua primeira transformação.', metric: 'transformationsOwned', target: 1, rewardZeni: 5000, rewardXp: 1500, rewardCrystals: 5, icon: '⚡' },
  { id: 'transform_3', category: 'progression', name: 'Evolução Suprema', description: 'Desbloqueie 3 transformações.', metric: 'transformationsOwned', target: 3, rewardZeni: 20000, rewardXp: 6000, rewardCrystals: 15, icon: '🌈' },
  // v0.9.17 — Narrativa (ASCENSÃO Z): os momentos dramáticos do sistema
  // de Ímpeto/Quebra viram conquistas contáveis pela engine
  { id: 'milagre_limite', category: 'narrative', name: 'Milagre no Limite', description: 'Vença 3 batalhas nas quais você rompeu seus próprios limites (Quebra de Limite ativada) — e sobreviveu para contar.', metric: 'miracleWins', target: 3, rewardZeni: 6000, rewardXp: 2000, rewardCrystals: 6, icon: '⚡' },
  { id: 'david_golias', category: 'narrative', name: 'David vs Golias', description: 'Anule um golpe poderoso com o Reposicionamento Dramático contra um oponente 2 ou mais escalas de poder acima de você.', metric: 'davidWins', target: 1, rewardZeni: 4000, rewardXp: 1200, rewardCrystals: 4, icon: '🐜' },
  // v0.9.18 — Torneio de Artes Marciais (chave de 8)
  { id: 'tournament_debut', category: 'tournament', name: 'Estreia no Ringue', description: 'Vença sua primeira luta de torneio — as arquibancadas já conhecem seu nome.', metric: 'tournamentRoundWins', target: 1, rewardZeni: 800, rewardXp: 200, rewardCrystals: 2, icon: '🏟️' },
  { id: 'tournament_champion', category: 'tournament', name: 'Campeão Mundial', description: 'Vença a GRANDE FINAL do Torneio de Artes Marciais e levante o cinturão.', metric: 'tournamentTitles', target: 1, rewardZeni: 10000, rewardXp: 3000, rewardCrystals: 10, icon: '🏆' },
  { id: 'tournament_dynasty', category: 'tournament', name: 'Dinastia do Ringue', description: 'Conquiste 5 títulos de campeão do Torneio de Artes Marciais — uma era com seu nome.', metric: 'tournamentTitles', target: 5, rewardZeni: 45000, rewardXp: 15000, rewardCrystals: 30, icon: '👑' },
];

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
