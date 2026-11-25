import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { getSystemPolicies, updateSystemPolicies, type SystemPolicies } from '@/lib/server-store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getSystemPolicies(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PUT(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as Partial<SystemPolicies>;
    const updated = updateSystemPolicies(body);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Invalid policy payload' }, { status: 400 });
  }
}
