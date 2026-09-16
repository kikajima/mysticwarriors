// Diagnóstico rápido do banco: contas, personagens, timestamps
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const accounts = await db.account.findMany({
    select: {
      id: true,
      username: true,
      createdAt: true,
      updatedAt: true,
      isGuest: true,
      players: { select: { id: true, name: true, level: true, createdAt: true, updatedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`=== CONTAS: ${accounts.length} ===`)
  for (const a of accounts) {
    console.log(
      `- ${a.username ?? '(convidado)'} (guest=${a.isGuest}) criada=${a.createdAt.toISOString()} updatedAt=${a.updatedAt.toISOString()} players=[${a.players.map((p) => `${p.name}(nv${p.level})`).join(', ')}]`
    )
  }
  const players = await db.player.findMany({ select: { id: true, name: true, isBot: true, level: true, createdAt: true } })
  const bots = players.filter((p) => p.isBot)
  const humans = players.filter((p) => !p.isBot)
  console.log(`=== PLAYERS: total=${players.length} bots=${bots.length} humanos=${humans.length} ===`)
  for (const p of humans) console.log(`- ${p.name} nv${p.level} criado=${p.createdAt.toISOString()}`)
  const meta = await db.gameMeta.findFirst()
  console.log(`=== GAME META: ${JSON.stringify(meta)} ===`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
