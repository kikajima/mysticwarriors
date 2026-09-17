import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const guilds = await prisma.guild.findMany({
      include: {
        members: true,
      },
    });

    return NextResponse.json(guilds);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar guildas.' },
      { status: 500 }
    );
  }
}