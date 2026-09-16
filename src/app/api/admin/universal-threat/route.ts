import { extractBearerToken, verifySupabaseAdmin } from '@/lib/supabase/admin';
import { invokeUniversalThreat } from '@/lib/worldboss';
import { ok, toErrorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token || !(await verifySupabaseAdmin(token))) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } }, { status: 404 });
    }
    await invokeUniversalThreat();
    return ok({ message: 'Ameaça Universal invocada por 24 horas.' });
  } catch (error) {
    return toErrorResponse(error);
  }
}