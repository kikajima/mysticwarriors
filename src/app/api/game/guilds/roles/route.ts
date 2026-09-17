import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guildId, name, rank, permissions } = body;

    if (!guildId || !name) {
      return NextResponse.json({ error: 'Nome do cargo e ID da guilda são obrigatórios.' }, { status: 400 });
    }

    const role = await prisma.guildRole.create({
      data: {
        guildId,
        name,
        rank: rank ?? 1,
        permissions: JSON.stringify(permissions || []),
      },
    });

    return NextResponse.json({ success: true, role }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao criar cargo.' }, { status: 500 });
  }
}