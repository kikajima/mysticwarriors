import { requirePanelAdmin } from '@/lib/supabase/admin';
export async function GET(request: Request) {
  const guard = await requirePanelAdmin(request);
  if (!guard.ok) return Response.json({ success: false }, { status: guard.status });
  return Response.json({ success: true, canDelete: true }, { headers: { 'Cache-Control': 'no-store' } });
}
