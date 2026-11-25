import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import {
  DockerApiError,
  getVmStatusService,
  type VmLifecycleAction,
} from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';

const ALLOWED_ACTIONS = new Set<VmLifecycleAction>([
  'start',
  'stop',
  'restart',
  'recreate',
  'reset',
  'delete',
]);

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { action?: string; wipeVolume?: boolean };
  try {
    body = (await req.json()) as { action?: string; wipeVolume?: boolean };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const action = String(body.action || '').toLowerCase() as VmLifecycleAction;
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  }

  try {
    const service = getVmStatusService();
    const result = await service.performAction(session, id, action, {
      wipeVolume: Boolean(body.wipeVolume),
    });
    const snapshot = await service.getScopedSnapshot(session, false);
    return NextResponse.json(
      {
        success: true,
        deleted: Boolean(result.deleted),
        vm: result.vm,
        statusUpdatedAt: snapshot.statusUpdatedAt,
        statusSource: snapshot.statusSource,
        stale: snapshot.stale,
        dockerReachable: snapshot.dockerReachable,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    const status =
      e instanceof DockerApiError
        ? e.statusCode >= 400 && e.statusCode < 600
          ? e.statusCode
          : 502
        : e.statusCode || 500;
    return NextResponse.json(
      { error: e?.message || `Failed to ${action} VM`, ...(e?.code ? { code: e.code } : {}) },
      { status }
    );
  }
}
