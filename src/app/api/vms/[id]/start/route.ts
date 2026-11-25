import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { DockerApiError, getVmStatusService } from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';

export async function POST(
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
    const result = await service.performAction(session, id, 'start');
    return NextResponse.json({
      success: true,
      vm: result.vm,
      status: result.vm?.status ?? 'unknown',
      statusSource: result.vm?.statusSource ?? 'docker',
      statusUpdatedAt: result.vm?.statusUpdatedAt ?? new Date().toISOString(),
    });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    const status = e instanceof DockerApiError ? 502 : e.statusCode || 500;
    return NextResponse.json(
      { error: e?.message || 'Failed to start VM', ...(e?.code ? { code: e.code } : {}) },
      { status }
    );
  }
}
