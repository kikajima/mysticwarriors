import { requirePanelAdmin } from '@/lib/supabase/admin';
import { invokeUniversalThreat } from '@/lib/worldboss';
import { ApiError, ok, toErrorResponse } from '@/lib/api';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const guard = await requirePanelAdmin(request);
    if (!guard.ok) {
      return Response.json(
        { success: false, error: { code: guard.code, message: guard.message } },
        { status: guard.status }
      );
    }
    const rl = rateLimit(`admin-universal-threat:${clientIp(request)}`, 3, 5 * 60_000);
    if (!rl.allowed) {
      throw new ApiError('RATE_LIMITED', 'Muitas invocações seguidas. Aguarde alguns minutos.');
    }
    await invokeUniversalThreat();
    return ok({ message: 'Ameaça Universal invocada por 24 horas.' });
  } catch (error) {
    return toErrorResponse(error);
  }
}