import { NextResponse } from 'next/server';
import db from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amount } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valor de doação inválido' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Doação realizada com sucesso' });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao processar doação' }, { status: 500 });
  }
}