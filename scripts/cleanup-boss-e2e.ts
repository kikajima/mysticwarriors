// Remove contas/personagens de teste do e2e-boss-cooldown (BossCd/Tcd + convidados de teste)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const players = await db.player.findMany({ where: { name: { startsWith: 'Tcd ' } }, select: { id: true, accountId: true } });
for (const p of players) {
  await db.player.delete({ where: { id: p.id } }).catch(() => {});
  if (p.accountId) await db.account.delete({ where: { id: p.accountId } }).catch(() => {});
}
const guests = await db.account.findMany({ where: { isGuest: true, username: { startsWith: 'BossCd' } }, select: { id: true } });
for (const g of guests) await db.account.delete({ where: { id: g.id } }).catch(() => {});
console.log(`limpo: ${players.length} personagem(ns) Tcd, ${guests.length} convidado(s) BossCd`);
await db.$disconnect();
