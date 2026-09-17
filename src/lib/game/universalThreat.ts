export const UNIVERSAL_THREAT = {
  name: 'Kronar',
  title: 'o Devorador de Mundos',
  power: 100_000,
  weekendHours: 48,
  invocationHours: 24,
} as const;

/** Brasília is UTC−3; weekend ends on Monday at 00:00 Brasília. */
export function universalThreatWindowEnd(now: Date, invokedUntil?: string | null): Date | null {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const day = local.getUTCDay();
  const weekendEnd = day === 6 || day === 0
    ? Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (day === 6 ? 2 : 1), 3)
    : 0;
  const invoked = invokedUntil ? Date.parse(invokedUntil) : 0;
  const end = Math.max(weekendEnd, Number.isFinite(invoked) ? invoked : 0);
  return end > now.getTime() ? new Date(end) : null;
}

export function isUniversalThreatWeekend(now = new Date()): boolean {
  return universalThreatWindowEnd(now) !== null;
}
