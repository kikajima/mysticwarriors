import type { PlayerView } from './types';

/** Absolute deadlines keep counting down between server refreshes. */
export function hpRecovery(player: Pick<PlayerView, 'hp' | 'derived' | 'regen'>, now: number) {
  const missing = Math.max(0, player.derived.maxHp - player.hp);
  const interval = Math.max(1, player.regen.hpIntervalSec) * 1000;
  const reference = Date.parse(player.regen.lastRegenHpAt);
  if (!missing || !Number.isFinite(reference)) return null;
  return {
    nextMs: Math.max(0, reference + interval - now),
    fullMs: Math.max(0, reference + missing * interval - now),
  };
}

export function recoveryDuration(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${seconds}s`;
}
