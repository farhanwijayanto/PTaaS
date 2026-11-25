import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { DockerApiError, getVmStatusService } from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const service = getVmStatusService();
  const { vm, forbidden, snapshot } = await service.getScopedVmById(session, id);

  if (forbidden) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!vm) {
    return NextResponse.json({ error: 'Virtual machine not found' }, { status: 404 });
  }

  return NextResponse.json(
    {
      vm,
      statusUpdatedAt: snapshot.statusUpdatedAt,
      statusSource: snapshot.statusSource,
      stale: snapshot.stale,
      dockerReachable: snapshot.dockerReachable,
      demoMode: snapshot.demoMode,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const service = getVmStatusService();
    const res = await service.performAction(session, id, 'delete');
    return NextResponse.json({ success: true, deleted: Boolean(res.deleted) });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    const status =
      e instanceof DockerApiError ? 502 : e.statusCode || 500;
    return NextResponse.json(
      { error: e?.message || 'Failed to delete VM', ...(e?.code ? { code: e.code } : {}) },
      { status }
    );
  }
}
