// Presença é apenas informativa: fica em memória do processo e nunca
// interfere em autorização, combate ou economia. Após restart todos
// aparecem offline até o próximo polling de /api/game/state.
const ONLINE_WINDOW_MS = 2 * 60_000;

type PresenceStore = { seenAt: Map<string, number>; touches: number };
const globalPresence = globalThis as typeof globalThis & { __mwPresence?: PresenceStore };
const store = globalPresence.__mwPresence ??= { seenAt: new Map<string, number>(), touches: 0 };

function prune(now: number) {
  // limpeza amortizada para não varrer o mapa a cada poll.
  store.touches += 1;
  if (store.touches % 128 !== 0) return;
  for (const [playerId, seenAt] of store.seenAt) {
    if (now - seenAt > ONLINE_WINDOW_MS * 4) store.seenAt.delete(playerId);
  }
}

export const isOnline = (playerId: string, now = Date.now()): boolean => {
  const seenAt = store.seenAt.get(playerId);
  return seenAt !== undefined && now - seenAt <= ONLINE_WINDOW_MS;
};

export const touchPresence = (playerId?: string): boolean => {
  if (!playerId) return false;
  const now = Date.now();
  store.seenAt.set(playerId, now);
  prune(now);
  return true;
};
