import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deploymentIdentity } from '@/lib/release';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  const deployment = deploymentIdentity();

  try {
    await db.$queryRawUnsafe('SELECT 1');

    return NextResponse.json(
      {
        ok: true,
        service: 'myst-ki-warriors',
        releaseStage: deployment.stage,
        release: deployment.release,
        deployment,
        cloudAuthority: 'server',
        database: 'ok',
        latencyMs: Date.now() - startedAt,
        time: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: 'myst-ki-warriors',
        releaseStage: deployment.stage,
        release: deployment.release,
        deployment,
        cloudAuthority: 'server',
        database: 'unavailable',
        latencyMs: Date.now() - startedAt,
        time: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
