import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guildId, targetPlayerId, inviterId } = body;

    if (!guildId || !targetPlayerId) {
      return NextResponse.json({ error: 'Parâmetros ausentes.' }, { status: 400 });
    }

    const invitation = await prisma.guildInvitation.create({
      data: {
        guildId,
        playerId: targetPlayerId,
        inviterId: inviterId || targetPlayerId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({ success: true, invitation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao criar convite.' }, { status: 500 });
  }
}