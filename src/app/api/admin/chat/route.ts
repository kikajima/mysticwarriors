import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { db } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { requirePanelAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  confirm: z.literal('LIMPAR CHAT', { message: 'Digite LIMPAR CHAT para confirmar.' }),
});

export async function POST(request: Request) {
  try {
    const guard = await requirePanelAdmin(request);
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: { code: guard.code, message: guard.message } },
        { status: guard.status }
      );
    }

    const rl = rateLimit(`admin-clear-chat:${clientIp(request)}`, 3, 5 * 60_000);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas limpezas seguidas. Aguarde alguns minutos.');

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Confirmação inválida.');
    }

    const count = await db.chatMessage.count();
    await db.$transaction(async (tx) => {
      await tx.chatMessage.deleteMany({});
      await tx.adminActionLog.create({
        data: {
          adminEmail: guard.email,
          action: 'clear_chat',
          targetType: 'chat',
          targetName: 'Todos os canais',
          layers: JSON.stringify({ local: 'ok', cloud: 'na' }),
          result: 'ok',
          details: JSON.stringify({ messagesDeleted: count }),
        },
      });
    });

    return ok({
      message: `Histórico do chat limpo: ${count} mensagem(ns) removida(s). Preferências de silêncio foram preservadas.`,
      messagesDeleted: count,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } },
    { status: 404 }
  );
}
