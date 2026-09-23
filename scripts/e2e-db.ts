import { db } from '../src/lib/db';

const [, , command, ...args] = process.argv;

function activeRunId(): string {
  const runId = process.env.MW_E2E_RUN_ID ?? '';
  if (!/^\d+$/.test(runId)) throw new Error('MW_E2E_RUN_ID ausente/inválido');
  return runId;
}

function namesForRun(runId: string): string[] {
  return [
    `AuditA${runId}`,
    `AuditB${runId}`,
    `GuestAudit${runId}`,
    `ExtA${runId}`,
    `ExtB${runId}`,
  ];
}

async function qaPlayer(id: string) {
  const runId = activeRunId();
  const player = await db.player.findUnique({ where: { id } });
  if (!player) throw new Error('QA player not found');
  if (!namesForRun(runId).includes(player.name)) {
    throw new Error(`Refusing to mutate player outside E2E run ${runId}: ${player.name}`);
  }
  return player;
}

async function main() {
  if (!command) throw new Error('missing command');

  if (command === 'set-crystals') {
    const [id, raw] = args; await qaPlayer(id);
    await db.player.update({ where: { id }, data: { crystals: Number(raw) } });
    return;
  }
  if (command === 'get-crystals') {
    const [id] = args; const p = await qaPlayer(id); console.log(p.crystals); return;
  }
  if (command === 'set-zeni') {
    const [id, raw] = args; await qaPlayer(id);
    await db.player.update({ where: { id }, data: { zeni: Number(raw) } });
    return;
  }
  if (command === 'setup-high-stats') {
    const [id] = args; await qaPlayer(id);
    await db.player.update({
      where: { id },
      data: {
        level: 30, zeni: 5_000_000,
        strength: 5_000, defense: 5_000, speed: 5_000, ki: 5_000,
        items: JSON.stringify({
          weapon: null, armor: null, accessory: null,
          owned: ['elixir_dragao'],
          consumables: { elixir_dragao: 3 },
        }),
      },
    });
    console.log('ok'); return;
  }
  if (command === 'set-strength') {
    const [id, raw] = args; await qaPlayer(id);
    await db.player.update({ where: { id }, data: { strength: Number(raw) } });
    return;
  }
  if (command === 'set-combat-stats') {
    const [id] = args; await qaPlayer(id);
    await db.player.update({ where: { id }, data: { defense: 10, speed: 10, ki: 500, level: 30 } });
    return;
  }
  if (command === 'get-consumable') {
    const [id, itemId] = args; const p = await qaPlayer(id);
    const items = JSON.parse(p.items || '{}') as { consumables?: Record<string, number> };
    console.log(items.consumables?.[itemId] ?? 0); return;
  }
  if (command === 'set-hp-energy') {
    const [id, hpRaw, energyRaw] = args; await qaPlayer(id);
    await db.player.update({ where: { id }, data: { hp: Number(hpRaw), energy: Number(energyRaw) } });
    return;
  }
  if (command === 'set-level-hp-energy') {
    const [id, levelRaw, hpRaw, energyRaw] = args; await qaPlayer(id);
    await db.player.update({
      where: { id },
      data: { level: Number(levelRaw), hp: Number(hpRaw), energy: Number(energyRaw) },
    });
    return;
  }
  if (command === 'reset-training-quest') {
    const [id] = args; await qaPlayer(id);
    const day = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    await db.questProgress.upsert({
      where: { playerId_questId_period: { playerId: id, questId: 'daily_trainings', period: day } },
      update: { progress: 0, claimed: false, claimedAt: null },
      create: {
        playerId: id, questId: 'daily_trainings', kind: 'daily', period: day,
        target: 5, rewardZeni: 300, rewardXp: 80, rewardCrystals: 1,
      },
    });
    console.log('quest ok'); return;
  }
  if (command === 'get-zeni') {
    const [id] = args; const p = await qaPlayer(id); console.log(p.zeni); return;
  }
  if (command === 'get-guild-level') {
    const [name] = args;
    if (!name.startsWith('Audit Guild ')) throw new Error('Refusing non-QA guild lookup');
    const g = await db.guild.findFirst({ where: { name } });
    console.log(g?.level ?? ''); return;
  }
  if (command === 'get-ledger-count') {
    const [id] = args; await qaPlayer(id);
    console.log(await db.walletTransaction.count({ where: { playerId: id } })); return;
  }
  if (command === 'setup-release-extended') {
    const [aId, bId] = args;
    await qaPlayer(aId); await qaPlayer(bId);
    for (const id of [aId, bId]) {
      await db.player.update({
        where: { id },
        data: {
          level: 30,
          zeni: 100_000,
          crystals: 1_000,
          hp: 2_000,
          energy: 999,
          strength: 200,
          defense: 200,
          speed: 200,
          ki: 200,
        },
      });
    }
    for (const [playerId, herb, alloy] of [
      [aId, 20, 20],
      [bId, 10, 10],
    ] as const) {
      await db.inventoryStack.upsert({
        where: { playerId_itemId: { playerId, itemId: 'erva_medicinal' } },
        update: { quantity: herb },
        create: { playerId, itemId: 'erva_medicinal', quantity: herb },
      });
      await db.inventoryStack.upsert({
        where: { playerId_itemId: { playerId, itemId: 'liga_metais_leves' } },
        update: { quantity: alloy },
        create: { playerId, itemId: 'liga_metais_leves', quantity: alloy },
      });
    }
    console.log('ok'); return;
  }
  if (command === 'finish-craft') {
    const [id] = args; await qaPlayer(id);
    const result = await db.craftJob.updateMany({
      where: { playerId: id },
      data: { endsAt: new Date(Date.now() - 1_000) },
    });
    if (result.count !== 1) throw new Error('QA craft job not found');
    console.log('ok'); return;
  }
  if (command === 'finish-activity') {
    const [id] = args; await qaPlayer(id);
    const result = await db.activity.updateMany({
      where: { playerId: id, completedAt: null },
      data: { endsAt: new Date(Date.now() - 1_000) },
    });
    if (result.count < 1) throw new Error('QA active activity not found');
    console.log(result.count); return;
  }
  if (command === 'give-all-horizon-keys') {
    const [id] = args; await qaPlayer(id);
    for (let star = 1; star <= 7; star++) {
      await db.dragonBallPossession.upsert({
        where: { star },
        update: { playerId: id, acquiredAt: new Date() },
        create: { star, playerId: id },
      });
    }
    await db.player.update({ where: { id }, data: { dragonBalls: 7 } });
    console.log('7'); return;
  }
  if (command === 'get-horizon-key-count') {
    const [id] = args; await qaPlayer(id);
    console.log(await db.dragonBallPossession.count({ where: { playerId: id } })); return;
  }
  if (command === 'cleanup-run') {
    const [ts] = args;
    if (!/^\d+$/.test(ts)) throw new Error('invalid QA run id');
    const qaNames = namesForRun(ts);
    const players = await db.player.findMany({
      where: { name: { in: qaNames } },
      select: { id: true, accountId: true, guildId: true },
    });
    const playerIds = players.map((p) => p.id);
    const accountIds = [...new Set(players.map((p) => p.accountId).filter((id): id is string => !!id))];
    const guildIds = [...new Set(players.map((p) => p.guildId).filter((id): id is string => !!id))];

    if (guildIds.length) {
      const guilds = await db.guild.findMany({
        where: { id: { in: guildIds } },
        select: { id: true, name: true },
      });
      const expectedGuild = `Audit Guild ${ts}`;
      const unsafe = guilds.find((g) => g.name !== expectedGuild);
      if (unsafe) {
        throw new Error(`Refusing cleanup: QA player linked to non-QA guild "${unsafe.name}"`);
      }
      await db.guildInvitation.deleteMany({ where: { guildId: { in: guildIds } } });
      await db.guildRole.deleteMany({ where: { guildId: { in: guildIds } } });
      await db.guildDonation.deleteMany({ where: { guildId: { in: guildIds } } });
    }
    if (playerIds.length) await db.player.deleteMany({ where: { id: { in: playerIds } } });
    if (guildIds.length) await db.guild.deleteMany({ where: { id: { in: guildIds } } });
    if (accountIds.length) {
      for (const accountId of accountIds) {
        const remaining = await db.player.count({ where: { accountId } });
        if (remaining === 0) await db.account.deleteMany({ where: { id: accountId } });
      }
    }
    console.log(`cleanup QA ${ts}: ${playerIds.length} player(s)`);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main()
  .catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
