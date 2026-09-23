import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'mystic-warriors',
    securityStage: 12,
    cloudAuthority: 'server',
    time: new Date().toISOString(),
  });
}
