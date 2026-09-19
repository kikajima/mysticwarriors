import type { PlayerView } from './types';

/**
 * Projeta no cliente apenas a regeneração que o servidor já concederia pelo
 * relógio. Não inventa recursos: usa os mesmos intervalos e timestamps
 * entregues em PlayerView. A próxima ação continua sendo validada pelo
 * servidor, que recalcula applyRegen de forma autoritativa.
 */
export function projectPlayerRegen(player: PlayerView, nowMs: number): PlayerView {
  let energy = player.energy;
  let hp = player.hp;
  let lastEnergyMs = Date.parse(player.regen.lastRegenAt);
  let lastHpMs = Date.parse(player.regen.lastRegenHpAt);

  if (!Number.isFinite(lastEnergyMs) || !Number.isFinite(lastHpMs) || !Number.isFinite(nowMs)) {
    return player;
  }

  let changed = false;

  const energyIntervalMs = Math.max(1000, player.regen.energyIntervalSec * 1000);
  if (energy < player.derived.maxEnergy) {
    const elapsed = nowMs - lastEnergyMs;
    if (elapsed >= energyIntervalMs) {
      const gain = Math.floor(elapsed / energyIntervalMs);
      energy = Math.min(player.derived.maxEnergy, energy + gain);
      lastEnergyMs += Math.floor(gain * energyIntervalMs);
      // Ao atingir o máximo não "guardamos" tempo para regeneração futura.
      if (energy >= player.derived.maxEnergy) lastEnergyMs = nowMs;
      changed = true;
    }
  }

  const hpIntervalMs = Math.max(1000, player.regen.hpIntervalSec * 1000);
  if (hp < player.derived.maxHp) {
    const elapsed = nowMs - lastHpMs;
    if (elapsed >= hpIntervalMs) {
      const gain = Math.floor(elapsed / hpIntervalMs);
      hp = Math.min(player.derived.maxHp, hp + gain);
      lastHpMs += Math.floor(gain * hpIntervalMs);
      if (hp >= player.derived.maxHp) lastHpMs = nowMs;
      changed = true;
    }
  }

  if (!changed) return player;

  return {
    ...player,
    energy,
    hp,
    regen: {
      ...player.regen,
      lastRegenAt: new Date(lastEnergyMs).toISOString(),
      lastRegenHpAt: new Date(lastHpMs).toISOString(),
    },
  };
}
