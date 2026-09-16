import type { Player } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { getRace } from './content/races';
import { baseTrainingCost } from './content/world';
import type { RaceCombatDef, RaceEconomyDef, RaceId } from './types';

// =====================================================================
// REGRAS DO JOGO — fonte única, aplicada SEMPRE no servidor
// ---------------------------------------------------------------------
// Nenhuma rota pode alterar atributos/saldos sem passar por aqui.
// =====================================================================

/** Limite máximo absoluto de qualquer atributo. */
export const STAT_CAP = 999;

/**
 * VERSÃO DO BALANCEAMENTO (v0.6) — política de atualizações:
 *  * CONTAS nunca são deletadas por atualizações (regra absoluta);
 *  * quando esta versão AUMENTA, os PERSONAGENS são resetados para o
 *    estado inicial de criação (preservando conta, nome, raça, avatar,
 *    guilda, cristais e cosméticos) — mantendo todos sob o mesmo
 *    balanceamento, sem misturar stats de versões diferentes;
 *  * a primeira execução em um banco SEM versão registrada apenas
 *    REGISTRA a versão atual (personagens já progrediram sob ela).
 * v0.6: energia 5min/ponto, batalhas gastam energia, profissões com
 *       promoções (recompensas totalmente novas) → reset obrigatório.
 * Detalhes: src/lib/game/balance.ts
 */
export const BALANCE_VERSION = 6;

/**
 * v0.16 — MATRIZ DE OCUPAÇÃO DEFINITIVA (3ª ordem; ver DESIGN-DECISIONS.md).
 *
 * TRABALHANDO bloqueia APENAS as 2 ações abaixo. TUDO mais é LIBERADO:
 * Treino, PvP, Chefe Global, loja (comprar/vender/usar), gestão completa de
 * guilda, coleta de recompensas (conquista/diária/missão/torneio),
 * hospital, equipamento/inventário, perfil e visualizações, Shenron,
 * cosméticos, talentos, técnicas, transformações, estratégia.
 *
 * REGRA DE COLETA (parte 2 da 3ª ordem): coleta de recompensa de
 * QUALQUER tipo NUNCA é bloqueada por ocupação — nem trabalho, nem
 * treino, nem batalha pendente. As ações claim_* não constam aqui
 * (nem em ACTIVITY_BLOCKED_ACTIONS) por design: um teste anti-drift
 * permanente (tests/occupation-matrix.test.ts) vigia a matriz inteira.
 *
 * Substitui a antiga ALLOWLIST de missão da v0.9.3 (negava por padrão —
 * bloqueava loja/guilda/hospital/coleta durante o trabalho): exatamente
 * o erro corrigido agora. O teste de contrato vigia que a allowlist
 * morreu e que a blocklist continua fechada em 2.
 */
export const MISSION_BLOCKED_ACTIONS: ReadonlySet<string> = new Set([
  'battle', // ❌ combate PvE contra inimigos (Chefe Global é EXCEÇÃO — liberado)
  'tournament_fight', // ❌ torneio
]);

/**
 * Ações bloqueadas enquanto o personagem tem uma ATIVIDADE em andamento
 * (batalha com duração server-side ainda não concluída — PvE/PvP/torneio;
 * o treino é instantâneo desde a v0.9, mas segue listado por segurança).
 * Este é o estado "EM LUTA": uma atividade POR VEZ (invariante do sistema,
 * não a matriz de trabalho). Loja, guilda, hospital, equipamento, perfil
 * e TODAS as coletas (claim_*) seguem LIBERADAS — regra da 3ª ordem:
 * coleta de recompensa NUNCA é bloqueada por ocupação (anti-drift em
 * tests/occupation-matrix.test.ts).
 */
export const ACTIVITY_BLOCKED_ACTIONS: ReadonlySet<string> = new Set([
  'train',
  'battle',
  'attack_player',
  'mission',
  // v0.9.18 — luta do torneio é uma batalha com duração
  'tournament_fight',
]);

/**
 * Intervalo do replay round-a-round no cliente (fonte ÚNICA, consultada
 * pelo BattleLogDialog e pela duração server-side da atividade para que
 * os dois relógios terminem juntos — ver ACTIVITY_DURATION abaixo).
 */
export const BATTLE_REVEAL_INTERVAL_MS = 480;

/**
 * DURAÇÕES DE ATIVIDADE (fonte central — servidor e UI consultam aqui).
 * O servidor persiste início/término/identidade da atividade; a duração é
 * exigida de verdade: o resultado só é concedido após o término.
 */
export const ACTIVITY_DURATION = {
  /** LEGADO — não usado, ver wiki-audit v0.9.23: o treino é INSTANTÂNEO
   * desde a v0.9 (actionStartTrain aplica na hora, sem atividade
   * temporizada). Mantido por compatibilidade de re-export; a wiki
   * publica "instantâneo" e o teste de contrato vigia. */
  trainMs: 1600,
  /** batalha: base + por rodada (limitado ao máximo) */
  battleBaseMs: 1100,
  /**
   * v0.9.21 (correção 2 — causa raiz da dessincronização): era 230ms por
   * entrada de log enquanto o replay do cliente animava cada entrada a
   * 480ms, com teto de 5,2s. Resultado: o servidor "encerrava" a luta
   * em ~5s, o estado de fundo atualizava NO MEIO da animação (que
   * seguia por 14s+) e o resultado só aparecia muito depois. Agora a
   * duração server-side usa o MESMO intervalo do replay (constante
   * acima) — a atividade termina JUNTO com a última rodada animada.
   * ("rodada" aqui = entrada do log; combos geram entradas extras.)
   */
  battlePerRoundMs: BATTLE_REVEAL_INTERVAL_MS,
  /** teto anti-travamento p/ lutas patológicas (replay de 40 rodadas
   * com combos fica ~19s; o teto antigo de 5,2s é que cortava a luta
   * antes do fim da animação) */
  battleMaxMs: 32_000,
} as const;

/**
 * v0.9.24 (B2) — custo de energia do ataque ao chefe mundial. Vivia em
 * worldboss.ts (server-only); movido para cá (fonte central de regras,
 * importável pelo cliente) — o delta otimista da UI e o servidor passam
 * a ler O MESMO número.
 */
export const BOSS_ATTACK_ENERGY_COST = 10;

/**
 * Helper central: o personagem está ocupado em trabalho de profissão ATIVO?
 * Trabalho "ativo" = missionId definido E timer ainda não expirado.
 * (Trabalho concluído mas não coletado NÃO bloqueia — só aguarda claim.)
 */
export function isOnActiveMission(
  player: Pick<Player, 'missionId' | 'missionEndsAt'>,
  now: Date = new Date()
): boolean {
  return (
    !!player.missionId &&
    !!player.missionEndsAt &&
    player.missionEndsAt.getTime() > now.getTime()
  );
}

/**
 * Garante que o personagem pode executar a ação (regra central do
 * servidor — o frontend apenas DESABILITA botões, quem decide é aqui).
 * v0.16 — MATRIZ DEFINITIVA: durante trabalho ativo, SÓ as 2 ações da
 * MISSION_BLOCKED_ACTIONS são negadas; tudo mais passa (loja, guilda,
 * hospital, coletas, PvP, chefe mundial, equipamento, perfil…).
 * Mensagem clara EXISTENTE apenas nos 2 casos negados.
 */
export function assertPlayerAvailableForAction(
  player: Pick<Player, 'name' | 'missionId' | 'missionEndsAt'>,
  action: string,
  now: Date = new Date()
): void {
  if (isOnActiveMission(player, now) && MISSION_BLOCKED_ACTIONS.has(action)) {
    throw new ApiError(
      'PLAYER_BUSY_ON_MISSION',
      'Seu guerreiro está trabalhando — batalhas contra inimigos e o torneio ficam liberados só quando ele voltar. (Treinar, atacar jogadores e o Chefe Global, loja, guilda, hospital e coletas seguem funcionando normalmente!)'
    );
  }
}

export type StatKey = 'strength' | 'defense' | 'speed' | 'ki';

export function capStat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(STAT_CAP, Math.max(0, Math.floor(value)));
}

/**
 * Única forma permitida de aumentar/diminuir atributos.
 * Aplica o limite global (STAT_CAP) — Elixir, desejos, treino, Zenkai,
 * bônus raciais e qualquer fonte futura passam obrigatoriamente por aqui.
 */
export function addStat(player: Pick<Player, StatKey>, stat: StatKey, amount: number): { before: number; after: number; capped: boolean } {
  const before = player[stat];
  const after = capStat(before + amount);
  player[stat] = after;
  return { before, after, capped: after === STAT_CAP && after > before };
}

export function statAtCap(player: Pick<Player, StatKey>, stat: StatKey): boolean {
  return player[stat] >= STAT_CAP;
}

// ===== Raças: helpers com fallback seguro =====

const NEUTRAL_COMBAT: RaceCombatDef = {
  physicalDamageMult: 1,
  kiDamageMult: 1,
  defenseMult: 1,
  dodgeBonus: 0,
  speedMult: 1,
  kiAttackChanceBonus: 0,
  absorbOnWinPct: 0,
};

const NEUTRAL_ECONOMY: RaceEconomyDef = {
  xpBattleMult: 1,
  zeniMissionMult: 1,
  zeniBattleMult: 1,
  missionEnergyMult: 1,
  trainCostMult: 1,
  energyRegenMult: 1,
  hpRegenMult: 1,
  zenkai: false,
};

export function raceCombat(race: string): RaceCombatDef {
  return getRace(race)?.combat ?? NEUTRAL_COMBAT;
}

export function raceEconomy(race: string): RaceEconomyDef {
  return getRace(race)?.economy ?? NEUTRAL_ECONOMY;
}

/** Custo de treino já com multiplicador racial (humano -10%). */
export function trainingCost(statValue: number, race: string): number {
  const econ = raceEconomy(race);
  return Math.max(1, Math.floor(baseTrainingCost(statValue) * econ.trainCostMult));
}

// ===== Zenkai (Saiyajin) — balanceado por RISCO, não por cota diária =====

/**
 * ZENKAI v0.4 — sem teto diário. O ganho permanente é limitado pelo
 * RISCO REAL da derrota e pela economia de recuperação:
 *  1. só conta derrota para adversário RELEVANTE (nível >= 60% do seu —
 *     perder de propósito para fracos não ativa nada);
 *  2. não repete contra o mesmo adversário em 12h (variedade forçada);
 *  3. é preciso ENTRAR na luta com vida >= 50% do máximo (luta de verdade,
 *     não suicídio — ver zenkaiRequiresHpPct);
 *  4. cada derrota deixa o guerreiro com 1 de vida: o custo do hospital
 *     (3 Zeni/HP) cresce com o nível — o preço do Zenkai escala com a
 *     progressão, exatamente como o custo de treino.
 */
export const ZENKAI = {
  /** adversário precisa ter nível >= player.level * factor */
  relevanceFactor: 0.6,
  /** não repetir contra o mesmo adversário dentro de N horas */
  sameOpponentCooldownHours: 12,
  /** vida mínima (fração do máximo) ao INICIAR a luta para contar Zenkai */
  zenkaiRequiresHpPct: 0.5,
  /** bônus por Zenkai */
  strengthGain: 1,
} as const;

export interface ZenkaiContext {
  race: string;
  level: number;
  lastZenkaiAt: Date | null;
  lastZenkaiOpponentId: string | null;
}

export interface ZenkaiDecision {
  granted: boolean;
  reason?: 'not_saiyajin' | 'same_opponent' | 'irrelevant_opponent';
}

/**
 * Decide se um Zenkai pode ser concedido (sem cota diária — ver ZENKAI).
 */
export function shouldGrantZenkai(
  ctx: ZenkaiContext,
  opponentLevel: number,
  opponentId: string,
  now = new Date()
): ZenkaiDecision {
  if (!raceEconomy(ctx.race).zenkai) return { granted: false, reason: 'not_saiyajin' };

  if (
    ctx.lastZenkaiOpponentId === opponentId &&
    ctx.lastZenkaiAt &&
    now.getTime() - ctx.lastZenkaiAt.getTime() < ZENKAI.sameOpponentCooldownHours * 60 * 60 * 1000
  ) {
    return { granted: false, reason: 'same_opponent' };
  }

  if (opponentLevel < Math.max(1, Math.floor(ctx.level * ZENKAI.relevanceFactor))) {
    return { granted: false, reason: 'irrelevant_opponent' };
  }

  return { granted: true };
}

/** Atualiza os campos de controle após conceder um Zenkai (muta o objeto). */
export function registerZenkai(ctx: ZenkaiContext, opponentId: string, now = new Date()): void {
  ctx.lastZenkaiAt = now;
  ctx.lastZenkaiOpponentId = opponentId;
}

/* =====================================================================
 * ANTI-FARM PvE — REMOVIDO INTEGRALMENTE (v0.4)
 * ---------------------------------------------------------------------
 * O antigo sistema (FARM.tiers 50%/25%/10% + sameEnemyRepeatMult +
 * farmMultiplierLegacy) foi eliminado: nenhuma redução de XP/Zeni por
 * volume de batalhas no dia. Os contadores pveBattleDay/pveBattleCount
 * permanecem no schema APENAS como estatística/histórico — nunca
 * alteram recompensas. Consulte a tabela de balanceamento para a
 * análise econômica com farm livre.
 * ===================================================================== */

/** Chave do dia (YYYY-MM-DD) no fuso do servidor (America/Sao_Paulo). */
export function dayKey(date = new Date()): string {
  const saoPaulo = new Date(date.getTime() - 3 * 60 * 60 * 1000); // UTC-3
  return saoPaulo.toISOString().slice(0, 10);
}

/** Chave da semana ISO (YYYY-Www) no fuso do servidor. */
export function weekKey(date = new Date()): string {
  const saoPaulo = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(saoPaulo.getUTCFullYear(), saoPaulo.getUTCMonth(), saoPaulo.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // domingo=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ===== Guardas de valor =====

/** Teto absoluto de Zeni (Int32 seguro com folga — nenhuma fonte ultrapassa). */
export const ZENI_CAP = 2_000_000_000;

export function assertValidAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'Valor inválido.');
  }
}

export function statName(stat: string): string {
  const names: Record<string, string> = {
    strength: 'Força',
    defense: 'Defesa',
    speed: 'Velocidade',
    ki: 'Ki',
  };
  return names[stat] ?? stat;
}

/** Energia de ações é independente do atributo Ki de combate. */
export const MAX_ACTION_ENERGY = 100;
