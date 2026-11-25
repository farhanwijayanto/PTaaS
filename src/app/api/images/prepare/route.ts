import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { getVmStatusService } from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { imageId?: string };
    const service = getVmStatusService();
    const result = await service.triggerImagePull(session, body.imageId || 'kali-2024.3');
    return NextResponse.json({ success: true, image: result });
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    return NextResponse.json(
      { error: e?.message || 'Failed to prepare image', ...(e?.code ? { code: e.code } : {}) },
      { status: e?.statusCode || 500 }
    );
  }
}
