// src/app/api/guild/roles.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../prisma/client';
import { withAuth } from '../../../utils/auth';

export default withAuth(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { guildId, name, rank, permissions } = req.body;

  const account = req.account;
  if (!account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { leaderId: true },
  });

  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }

  if (guild.leaderId !== account.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (rank >= guild.members.find(m => m.playerId === account.id).rank) {
    return res.status(403).json({ error: 'Cannot assign role with equal or higher rank' });
  }

  const role = await prisma.guildRole.create({
    data: {
      guild: { connect: { id: guildId } },
      name,
      rank,
      permissions: JSON.stringify(permissions),
    },
  });

  return res.status(200).json({ role });
}));