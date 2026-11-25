import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { getVmStatusService } from '@/lib/vm-status-service';

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
    const res = await service.cancelCreation(session, id);
    return NextResponse.json({ success: true, ...res });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    return NextResponse.json(
      { error: e?.message || 'Failed to cancel creation' },
      { status: e?.statusCode || 500 }
    );
  }
}
