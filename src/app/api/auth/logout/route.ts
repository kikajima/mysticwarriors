import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearSessionCookie, revokeSession, SESSION_COOKIE } from '@/lib/auth';
import { toErrorResponse } from '@/lib/api';

/** Logout real: invalida a sessão no banco e limpa o cookie. */
export async function POST() {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) {
      await revokeSession(token);
    }
    return clearSessionCookie(NextResponse.json({ success: true }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
