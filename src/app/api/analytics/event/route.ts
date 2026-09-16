import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse, ApiError } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

// =====================================================================
// POST /api/analytics/event — eventos de navegação do cliente
// (visit_landing, click_play). Eventos de jogo são emitidos server-side.
// Sem dados pessoais.
// =====================================================================

const eventSchema = z.object({
  name: z.string().min(1).max(60),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit(`analytics:${ip}`, LIMITS.analytics.limit, LIMITS.analytics.windowMs);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED');

    const body = await request.json();
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR');

    await db.analyticsEvent.create({
      data: {
        name: parsed.data.name,
        metadata: parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : undefined,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
