// src/app/api/guilds/donate-to-guild.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../prisma/client';
import { withAuth, withZeniCheck } from '../../../utils/auth';

export default withAuth(withZeniCheck(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { guildId, amount } = req.body;

  const account = req.account;
  if (!account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { members: true },
  });

  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }

  const member = guild.members.find(m => m.playerId === account.activePlayerId);
  if (!member) {
    return res.status(403).json({ error: 'Player not a member of the guild' });
  }

  const totalDonated = guild.totalDonated + amount;
  const newLevel = calculateLevel(totalDonated);

  const transaction = await prisma.$transaction(async () => {
    await prisma.walletTransaction.create({
      data: {
        account: { connect: { id: account.id } },
        playerId: account.activePlayerId!,
        currency: 'zeni',
        amount: -amount,
        type: 'spend',
        source: 'guild',
        balanceBefore: account.zeni,
        balanceAfter: account.zeni - amount,
        metadata: JSON.stringify({ guildId }),
        externalPaymentId: null,
        createdAt: new Date(),
      },
    });

    await prisma.guild.update({
      where: { id: guildId },
      data: {
        xp: guild.xp + calculateGainedXp(amount, newLevel),
        totalDonated,
        level: newLevel,
        stateVersion: guild.stateVersion + 1,
      },
    });

    await prisma.guildDonationLog.create({
      data: {
        guildId,
        playerId: account.activePlayerId!,
        amount,
        createdAt: new Date(),
      },
    });

    return { guildId, playerId: account.activePlayerId!, amount };
  });

  return res.status(200).json({ transaction });
}));

function calculateLevel(totalDonated: number): number {
  // Tabela de níveis fixa
  if (totalDonated >= 800000) return 10;
  if (totalDonated >= 260000) return 9;
  if (totalDonated >= 470000) return 8;
  if (totalDonated >= 145000) return 7;
  if (totalDonated >= 80000) return 6;
  if (totalDonated >= 45000) return 5;
  if (totalDonated >= 25000) return 4;
  if (totalDonated >= 14000) return 3;
  if (totalDonated >= 8000) return 2;
  return 1;
}

function calculateGainedXp(amount: number, newLevel: number): number {
  // Tabela de bônus por nível
  switch (newLevel) {
    case 2: return amount * 0.05;
    case 3: return amount * 0.05;
    case 4: return amount * 0.05;
    case 5: return amount * 0.05;
    case 6: return amount * 0.05;
    case 7: return amount * 0.05;
    case 8: return amount * 0.02;
    case 9: return amount * 0.05;
    case 10: return amount * 0.05;
    default: return amount;
  }
}