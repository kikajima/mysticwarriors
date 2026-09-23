// =====================================================================
// ESTADO INICIAL DE PERSONAGEM — serviço ÚNICO (v0.9.11)
// ---------------------------------------------------------------------
// Regra de ouro introduzida aqui: "resetar um personagem" e "criar um
// personagem" passam a usar a MESMA fonte de verdade. Antes, os dois
// caminhos enumeravam por conta própria a lista de campos iniciais — e
// a lista do reset tinha sido escrita antes de cosméticos, diamantes e
// avatar pertencerem ao personagem (v0.9.6), então o reset "esquecia"
// de zerá-los (bug do cosmético sobrevivente).
//
// SEMÂNTICA DO RESET DE PERSONAGEM (painel admin), a partir da v0.9.11:
//   "Escrever o estado INICIAL de um personagem novo, preservando
//    apenas a IDENTIDADE."
//   PRESERVADO: id, vínculo com a conta, nome, raça, sexo, guilda.
//   ZERADO: todo o resto — cosméticos (comprados e equipados), avatar,
//   itens/inventário, auras, transformações, zenni, diamantes, esferas,
//   XP/nível/atributos, vida/energia, conquistas, missões
//   diárias/semanais, profissão (níveis e turnos), treinamentos,
//   cooldowns, pontos de temporada e dano no Ameaça Universal atual.
//
// NÃO CONFUNDIR com o reset de BALANCEAMENTO (balance.ts /
// CREATION_DEFAULTS): aquele é outro contrato, com política própria e
// registrada do dono ("contas, nomes, raças, avatares, guildas, cristais
// e cosméticos NUNCA são deletados" quando só as fórmulas mudam). Ele
// permanece intocado e preservacionista por design.
// =====================================================================

import type { CloudCharacterSnapshot } from '@/lib/supabase/progress';

/**
 * Estado COMPLETO de um personagem recém-criado — todos os campos DE
 * JOGO do model Player. A criação (/api/game/create) e o reset de
 * personagem do painel admin PARTEM daqui: qualquer campo novo do jogo
 * que entrar no Player deve entrar neste objeto, e automaticamente
 * nasce consistente nos dois caminhos.
 */
export const INITIAL_PLAYER_DATA = {
  level: 1,
  xp: 0,
  zeni: 500,
  crystals: 0, // reset de personagem ZERA diamantes (balanceamento não)
  hp: 145, // 80 + 15*1 + 10*5 — igual à criação
  strength: 10,
  defense: 10,
  speed: 10,
  ki: 10,
  energy: 100,
  battlesWon: 0,
  battlesLost: 0,
  pvpWins: 0,
  trainingsDone: 0,
  guildDonated: 0,
  missionsDone: 0,
  dragonBalls: 0,
  avatarUrl: null, // avatar volta ao padrão da raça
  items: '{"weapon":null,"armor":null,"accessory":null,"accessory2":null,"head":null,"wrists":null,"legs":null,"boots":null,"owned":[],"consumables":{},"stacks":{}}',
  techniques: '[]',
  loadout: '{"1":null,"2":null,"3":null,"S":null}',
  strategy: 'balanced',
  missionId: null,
  missionStartedAt: null,
  missionEndsAt: null,
  missionHours: null,
  missionsCompleted: '[]',
  professions: '{}',
  transformationId: null,
  transformationsOwned: '[]',
  cosmeticsEquipped: '{}',
  cosmeticsOwned: '[]',
  // anti-farm Resiliência Estelar (Solaris)
  lastZenkaiAt: null,
  zenkaiWindowStart: null,
  zenkaiCount24h: 0,
  lastZenkaiOpponentId: null,
  // anti-farm PvE
  pveBattleDay: null,
  pveBattleCount: 0,
} as const;

/** Cópia fresca dos dados iniciais (Prisma Player.update/create). */
export function initialPlayerData(): typeof INITIAL_PLAYER_DATA {
  return { ...INITIAL_PLAYER_DATA };
}

/** Identidade que sobrevive a um reset de personagem.
 * v0.16 — sem gênero: a identidade do jogador é nome + raça (decisão
 * definitiva, DESIGN-DECISIONS.md). Snapshots legados da nuvem que ainda
 * carregam "gender" são tolerados (o campo é simplesmente ignorado). */
export interface CharacterIdentity {
  id: string | null;
  name: string;
  race: CloudCharacterSnapshot['race'];
}

/**
 * Snapshot v3 (nuvem) no estado INICIAL, carregando apenas a identidade
 * de um personagem existente. Usado pelo reset de personagem que vive
 * só na nuvem (patch direto no `estado` da linha em `personagens`).
 * Relógios de regeneração nascem AGORA — nunca retroativos.
 */
export function initialCloudCharacterState(identity: CharacterIdentity): CloudCharacterSnapshot {
  const nowIso = new Date().toISOString();
  return {
    id: identity.id,
    name: identity.name,
    race: identity.race,
    avatarUrl: null,
    level: 1,
    xp: 0,
    zeni: 500,
    crystals: 0,
    hp: 145,
    energy: 100,
    strength: 10,
    defense: 10,
    speed: 10,
    ki: 10,
    battlesWon: 0,
    battlesLost: 0,
    pvpWins: 0,
    trainingsDone: 0,
    guildDonated: 0,
    missionsDone: 0,
    dragonBalls: 0,
    items: { weapon: null, armor: null, accessory: null, accessory2: null, head: null, wrists: null, legs: null, boots: null, owned: [], consumables: {}, stacks: {} },
    techniques: [],
    loadout: { '1': null, '2': null, '3': null, S: null },
    strategy: 'balanced',
    missionsCompleted: [],
    professions: {},
    transformationId: null,
    transformationsOwned: [],
    cosmeticsEquipped: {},
    cosmeticsOwned: [],
    missionId: null,
    missionStartedAt: null,
    missionEndsAt: null,
    missionHours: null,
    materials: [],
    lastRegen: nowIso,
    lastRegenHp: nowIso,
    quests: [],
    achievementsClaimed: [],
    // v0.9.15–v0.9.18 — progressão recente começa zerada
    talents: [],
    miracleWins: 0,
    davidWins: 0,
    tournament: null,
    tournamentTitles: 0,
    tournamentRoundWins: 0,
  };
}
