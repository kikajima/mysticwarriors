import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// =====================================================================
// ANALYTICS — camada de eventos anônimos (sem dados pessoais)
// ---------------------------------------------------------------------
// * Eventos de jogo são emitidos pelo SERVIDOR (na ação que os produz);
// * eventos de navegação (landing) são enviados pelo cliente via
//   /api/analytics/event — APENAS nomes da whitelist pública;
// * Nenhum PII é armazenado;
// * IMPORTANTE (anti-deadlock): quando o evento faz parte de uma
//   transação de gameplay, passe o `tx` — nunca use o db global no meio
//   de uma $transaction (evita lock extra em SQLite e consistência
//   incorreta em PostgreSQL).
// =====================================================================

export type GameEventName =
  | 'visit_landing'
  | 'click_play'
  | 'guest_started'
  | 'account_created'
  | 'character_created'
  | 'tutorial_completed'
  | 'first_training'
  | 'first_battle'
  | 'first_mission'
  | 'pvp_started'
  | 'pvp_battle'
  | 'guild_joined'
  | 'transformation_unlocked'
  | 'daily_completed'
  | 'weekly_completed'
  | 'world_boss_attack'
  | 'level_up'
  | 'zenkai_granted'
  | 'quest_claimed'
  | 'achievement_claimed'
  | 'cosmetic_purchased'
  | 'cosmetic_equipped'
  | 'avatar_updated'
  | 'character_deleted';

/**
 * Whitelist de eventos que o CLIENTE pode reportar via /api/analytics/event.
 * Eventos de gameplay NUNCA entram aqui — são registrados pelo servidor.
 */
export const PUBLIC_ANALYTICS_EVENTS: ReadonlySet<string> = new Set([
  'visit_landing',
  'click_play',
  'play_page_view',
  'pwa_install',
]);

/** Emite um evento de analytics (best-effort: nunca quebra a ação principal). */
export async function trackEvent(
  name: string,
  opts: { playerId?: string; accountId?: string | null; metadata?: Record<string, unknown> } = {},
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? db;
  try {
    await client.analyticsEvent.create({
      data: {
        name,
        playerId: opts.playerId,
        accountId: opts.accountId,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
      },
    });
  } catch (error) {
    console.error('[analytics] falha ao registrar evento', name, error);
  }
}
