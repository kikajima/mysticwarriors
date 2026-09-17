import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuth } from '@/lib/auth';
import { ok, toErrorResponse } from '@/lib/api';
import { UNIVERSAL_THREAT } from '@/lib/game/universalThreat';
import { universalThreatIsAvailable } from '@/lib/worldboss';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const restoreSchema = z.object({
  id: z.string().min(1).max(80),
  currentHp: z.number().int().nonnegative(),
  endsAt: z.string().datetime(),
  status: z.string().max(20),
  damages: z.array(z.object({ playerId: z.string(), damage: z.number().int().nonnegative(), attacks: z.number().int().nonnegative(), rewarded: z.boolean(), lastAttackedAt: z.string().datetime() })).max(1000),
});

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return Response.json({ success: false }, { status: 401 });
    if (!(await universalThreatIsAvailable())) return ok({ snapshot: null });
    const boss = await db.worldBoss.findFirst({ where: { status: 'active' } });
    if (!boss) return ok({ snapshot: null });
    const damages = await db.worldBossDamage.findMany({ where: { bossId: boss.id }, include: { player: { select: { name: true } } } });
    return ok({ snapshot: {
      id: boss.id, name: boss.name, emoji: boss.emoji, description: boss.description,
      maxHp: boss.maxHp, currentHp: boss.currentHp, level: boss.level, power: UNIVERSAL_THREAT.power,
      startsAt: boss.startsAt.toISOString(), endsAt: boss.endsAt.toISOString(), status: boss.status,
      zeniReward: boss.zeniReward, xpReward: boss.xpReward, crystalReward: boss.crystalReward,
      defeatedAt: boss.defeatedAt?.toISOString() ?? null, savedAt: new Date().toISOString(),
      damages: damages.map((d) => ({ playerId: d.playerId, name: d.player.name, damage: d.damage, attacks: d.attacks, rewarded: d.rewarded, lastAttackedAt: d.lastAttackedAt.toISOString() })),
    } });
  } catch (error) { return toErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return Response.json({ success: false }, { status: 401 });
    const parsed = restoreSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ success: false }, { status: 400 });
    const snapshot = parsed.data;
    if (!(await universalThreatIsAvailable()) || Date.parse(snapshot.endsAt) <= Date.now()) {
      return ok({ restored: false, reason: 'expired' });
    }
    const boss = await db.worldBoss.findUnique({ where: { id: snapshot.id } });
    if (!boss || boss.status !== 'active' || boss.endsAt.getTime() <= Date.now()) {
      return ok({ restored: false });
    }
    const localDamageCount = await db.worldBossDamage.count({ where: { bossId: boss.id } });
    // O snapshot só pode repor um banco recém-criado. Depois que existe
    // progresso local, o servidor é a fonte autoritativa e nenhum polling
    // pode sobrescrever HP ou dano de um ataque recém concluído.
    if (localDamageCount > 0 || boss.currentHp !== boss.maxHp) return ok({ restored: false, reason: 'local-progress' });
    const owned = await db.player.findMany({ where: { accountId: auth.account.id, isBot: false }, select: { id: true } });
    const ownedIds = new Set(owned.map((p) => p.id));
    // The server owns the event calendar. A backup cannot extend the weekend.
    await db.worldBoss.update({ where: { id: boss.id }, data: { currentHp: Math.min(boss.maxHp, snapshot.currentHp), status: snapshot.currentHp === 0 ? 'defeated' : 'active' } });
    for (const damage of snapshot.damages.filter((d) => ownedIds.has(d.playerId))) {
      await db.worldBossDamage.upsert({
        where: { bossId_playerId: { bossId: boss.id, playerId: damage.playerId } },
        update: { damage: damage.damage, attacks: damage.attacks, rewarded: damage.rewarded, lastAttackedAt: new Date(damage.lastAttackedAt) },
        create: { bossId: boss.id, playerId: damage.playerId, damage: damage.damage, attacks: damage.attacks, rewarded: damage.rewarded, lastAttackedAt: new Date(damage.lastAttackedAt) },
      });
    }
    return ok({ restored: true });
  } catch (error) { return toErrorResponse(error); }
}
