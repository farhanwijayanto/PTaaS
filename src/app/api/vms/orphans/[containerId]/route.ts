import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { DockerApiError, getVmStatusService } from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  context: { params: Promise<{ containerId: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { containerId } = await context.params;
  try {
    const service = getVmStatusService();
    await service.cleanupOrphan(session, containerId);
    return NextResponse.json({ success: true, containerId });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    const status = e instanceof DockerApiError ? 502 : e.statusCode || 500;
    return NextResponse.json(
      { error: e?.message || 'Failed to clean up orphaned container' },
      { status }
    );
  }
}
