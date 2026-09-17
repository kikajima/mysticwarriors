const globalPresence = globalThis as unknown as { guildPresence?: Map<string, number> };
const presence = globalPresence.guildPresence ??= new Map<string, number>();
export function touchPresence(id: string) {
  const now = Date.now();
  presence.set(id, now);
  if (presence.size > 1000) for (const [key, at] of presence) if (now - at > 120000) presence.delete(key);
}
export const isOnline = (id: string) => Date.now() - (presence.get(id) ?? 0) < 120000;
