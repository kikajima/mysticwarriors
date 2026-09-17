// src/app/api/guilds/// src/app/api/game/guilds/create-guild.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@prisma/client';
import { withAuth, withZeniCheck } from '../../../utils/auth';

export default withAuth(withZeniCheck(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name } = req.body;

  const account = req.account;
  if (!account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const existingGuild = await prisma.guild.findFirst({
    where: { leaderId: account.id },
  });

  if (existingGuild) {
    return res.status(400).json({ error: 'Player already has a guild' });
  }

  const leaderRole = await prisma.guildRole.create({
    data: {
      guild: { connect: { id: '' } },
      name: 'Leader',
      rank: 0,
    },
  });

  const guildMember = await prisma.guildMember.create({
    data: {
      player: { connect: { id: account.activePlayerId! } },
      guild: { connect: { id: '' } },
      stateVersion: 0,
    },
  });

  const guild = await prisma.guild.create({
    data: {
      name,
      description: '',
      leaderId: account.id,
      level: 1,
      xp: 0,
      totalDonated: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      stateVersion: 0,
      members: { connect: [guildMember] },
      roles: { connect: [leaderRole] },
    },
  });

  return res.status(200).json({ guild });
}));create-guild.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../prisma/client';
import { withAuth, withZeniCheck } from '../../../utils/auth';

export default withAuth(withZeniCheck(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name } = req.body;

  const account = req.account;
  if (!account) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const existingGuild = await prisma.guild.findFirst({
    where: { leaderId: account.id },
  });

  if (existingGuild) {
    return res.status(400).json({ error: 'Player already has a guild' });
  }

  const leaderRole = await prisma.guildRole.create({
    data: {
      guild: { connect: { id: '' } },
      name: 'Leader',
      rank: 0,
    },
  });

  const guildMember = await prisma.guildMember.create({
    data: {
      player: { connect: { id: account.activePlayerId! } },
      guild: { connect: { id: '' } },
      stateVersion: 0,
    },
  });

  const guild = await prisma.guild.create({
    data: {
      name,
      description: '',
      leaderId: account.id,
      level: 1,
      xp: 0,
      totalDonated: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      stateVersion: 0,
      members: { connect: [guildMember] },
      roles: { connect: [leaderRole] },
    },
  });

  return res.status(200).json({ guild });
}));