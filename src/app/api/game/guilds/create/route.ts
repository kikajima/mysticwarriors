import { NextResponse } from 'next/server';
import db from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Nome da guilda é obrigatório' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Guilda criada com sucesso' });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao processar criação da guilda' }, { status: 500 });
  }
}