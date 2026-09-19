// =====================================================================
// v0.9.24 (B2) — DELTA OTIMISTA CONSISTENTE (cliente)
// ---------------------------------------------------------------------
// O PADRÃO (mesmo das conquistas v0.9.20, GENERALIZADO):
//   1. o clique aplica o delta NA HORA (feedback < 300ms);
//   2. a resposta do servidor RECONCILIA com a verdade (applyPlayerState);
//   3. falha → refreshGameState() desfaz o otimismo com a verdade real.
//
// A REGRA DE OURO (a causa raiz do bug "363/234 XP e nível 2"): o delta
// de XP é SEMPRE aplicado JUNTO com o level-up e o carry — nunca existe
// um estado intermediário com XP acima do limiar e nível antigo. A mesma
// curva do servidor (xpToNextLevel, de content/world) é usada aqui:
//   enquanto xp >= xpToNextLevel(nível): xp -= limiar; nível += 1;
// e level-up restaura a vida (política do servidor — ver grantXp).
//
// ONDE USAR: qualquer transação com delta CONHECIDO no cliente (custo
// exibido, recompensa anunciada). Transações cujo valor só o servidor
// conhece continuam apenas com a reconciliação (nada de inventar número).
// =====================================================================

import { xpToNextLevel, SHOP_ITEMS, SELL_PRICE_RATIO, HEAL_COST_PER_HP, GUILD_CREATION_COST } from './content/world';
import { TECHNIQUES } from './content/techniques';
import { TALENTS } from './content/talents';
import { COSMETICS } from './content/cosmetics';
import { trainingCost, BATTLE_ENERGY_COST, TRAIN_ENERGY_COST } from './constants';
import { BOSS_ATTACK_ENERGY_COST } from './rules';
import type { PlayerView } from './types';

/** Delta de estado aplicável de forma otimista. */
export interface OptimisticDelta {
  zeni?: number;
  crystals?: number;
  /** Ganho de XP — sempre aplicado COM level-up + carry (atômico). */
  xp?: number;
  /** Gasto de energia. */
  energy?: number;
  /** Vida definida diretamente (ex.: hospital cheio). */
  hp?: number;
  /** Atributo somado (ex.: treino +1). */
  stat?: { key: 'strength' | 'defense' | 'speed' | 'ki'; amount: number };
}

/**
 * Aplica o delta ao estado do personagem de forma CONSISTENTE.
 * Função PURA (não muta o original) — devolve uma nova PlayerView.
 */
export function applyOptimisticDelta(
  player: PlayerView,
  delta: OptimisticDelta
): PlayerView {
  let next: PlayerView = { ...player };

  if (delta.zeni !== undefined) {
    next.zeni = Math.max(0, next.zeni + delta.zeni);
  }
  if (delta.crystals !== undefined) {
    next.crystals = Math.max(0, next.crystals + delta.crystals);
  }
  if (delta.energy !== undefined) {
    const wasFull = next.energy >= next.derived.maxEnergy;
    next.energy = Math.max(0, Math.min(next.derived.maxEnergy, next.energy + delta.energy));
    // O servidor zera o "tempo acumulado" enquanto a energia está cheia.
    // Se o cliente gasta a partir de 100%, reiniciamos o relógio local para
    // não mostrar regeneração retroativa antes da resposta autoritativa.
    if (wasFull && next.energy < next.derived.maxEnergy && delta.energy < 0) {
      next.regen = { ...next.regen, lastRegenAt: new Date().toISOString() };
    }
  }
  if (delta.hp !== undefined) {
    next.hp = Math.max(1, Math.min(next.derived.maxHp, delta.hp));
  }
  if (delta.stat !== undefined) {
    const k = delta.stat.key;
    next[k] = next[k] + delta.stat.amount;
  }

  // ===== XP: ganho + level-up + carry SEMPRE JUNTOS =====
  if (delta.xp !== undefined && delta.xp > 0) {
    let xp = next.xp + delta.xp;
    let level = next.level;
    let levelsGained = 0;
    let need = xpToNextLevel(level);
    while (xp >= need && level < 999) {
      xp -= need;
      level += 1;
      levelsGained += 1;
      need = xpToNextLevel(level);
    }
    next.xp = xp;
    next.level = level;
    next.xpToNext = need;
    if (levelsGained > 0) {
      // mesma política do servidor (grantXp): subir de nível restaura a
      // vida — maxHp = 80 + nível×15 + defesa×5 (fórmula de computeDerived)
      const newMaxHp = 80 + level * 15 + next.defense * 5;
      next.hp = newMaxHp;
      next.derived = { ...next.derived, maxHp: newMaxHp };
    }
  }

  return next;
}

/** Nível que o estado otimista alcançaria (para o toast de level-up). */
export function optimisticLevelsGained(player: PlayerView, xpGain: number): number {
  let xp = player.xp + xpGain;
  let level = player.level;
  let gained = 0;
  let need = xpToNextLevel(level);
  while (xp >= need && level < 999) {
    xp -= need;
    level += 1;
    gained += 1;
    need = xpToNextLevel(level);
  }
  return gained;
}

// =====================================================================
// builtinOptimisticDelta — deltas de TABELA (custos conhecidos no
// cliente sem nenhuma incerteza de servidor). Ações cujo resultado só o
// servidor conhece (recompensas com RNG, roubos de PvP, drops) devolvem
// null — a reconciliação da resposta continua sendo a única verdade.
// =====================================================================

/**
 * Delta otimista embutido por tipo de ação (v0.9.24 B2). Recebe o
 * personagem ATUAL (pré-ação) e o payload da ação; devolve o delta
 * conhecido ou null quando não há certeza suficiente.
 */
export function builtinOptimisticDelta(
  player: PlayerView,
  payload: Record<string, unknown>
): OptimisticDelta | null {
  const type = String(payload.type ?? '');

  switch (type) {
    // ===== Batalhas: custo de energia tabelado =====
    case 'battle':
    case 'tournament_fight':
    case 'attack_player':
      return { energy: -BATTLE_ENERGY_COST };

    case 'world_boss_attack':
      return { energy: -BOSS_ATTACK_ENERGY_COST };

    // ===== Treino: energia tabelada + custo exibido no painel =====
    case 'train': {
      const statKey = String(payload.stat ?? '');
      if (statKey !== 'strength' && statKey !== 'defense' && statKey !== 'speed' && statKey !== 'ki') {
        return null;
      }
      const current = player[statKey];
      return {
        energy: -TRAIN_ENERGY_COST,
        zeni: -trainingCost(current, player.race),
        // ganho de stat: base 1 + bônus de equipamento (incerto — o
        // servidor reconcilia; aqui só o custo, que é certo)
      };
    }

    // ===== Hospital: cura total =====
    case 'heal': {
      const missing = player.derived.maxHp - player.hp;
      if (missing <= 0) return null;
      return {
        hp: player.derived.maxHp,
        zeni: -missing * HEAL_COST_PER_HP,
      };
    }

    // ===== Técnicas: preço de tabela =====
    case 'learn_technique': {
      const tech = TECHNIQUES.find((t) => t.id === String(payload.techniqueId ?? ''));
      if (!tech) return null;
      return { zeni: -tech.price };
    }

    // ===== Loja: preço de tabela × quantidade =====
    case 'buy': {
      const item = SHOP_ITEMS.find((i) => i.id === String(payload.itemId ?? ''));
      if (!item) return null;
      const qty = Math.max(1, Math.floor(Number(payload.quantity ?? 1)) || 1);
      if (item.currency === 'crystal') return { crystals: -item.price * qty };
      return { zeni: -item.price * qty };
    }

    case 'sell': {
      const item = SHOP_ITEMS.find((i) => i.id === String(payload.itemId ?? ''));
      if (!item) return null;
      const qty = Math.max(1, Math.floor(Number(payload.quantity ?? 1)) || 1);
      const unit = Math.max(0, Math.floor(item.price * SELL_PRICE_RATIO));
      if (item.currency === 'crystal') return { crystals: unit * qty };
      return { zeni: unit * qty };
    }

    // ===== Guildas =====
    case 'create_guild':
      return { zeni: -GUILD_CREATION_COST };

    case 'donate_guild': {
      const amount = Math.floor(Number(payload.amount ?? 0));
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return { zeni: -amount };
    }

    // ===== Cosméticos (cristais de tabela) =====
    case 'buy_cosmetic': {
      const cosmetic = COSMETICS.find((c) => c.id === String(payload.cosmeticId ?? ''));
      if (!cosmetic) return null;
      return { crystals: -cosmetic.price };
    }

    // ===== Talentos (Zeni de tabela) =====
    case 'buy_talent': {
      const talent = TALENTS.find((t) => t.id === String(payload.talentId ?? ''));
      if (!talent) return null;
      return { zeni: -talent.price };
    }

    // ===== Recompensas com RNG / lógica de servidor: SEM otimismo =====
    default:
      return null;
  }
}
