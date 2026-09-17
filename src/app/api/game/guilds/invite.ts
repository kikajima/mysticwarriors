// src/app/api/guild/invite.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../prisma/client';
import { withAuth } from '../../../utils/auth';

export default withAuth(async (req: NextApiRequest, res: NextApiResponse) => {
  if (