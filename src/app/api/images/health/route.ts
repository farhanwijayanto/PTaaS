import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { getVmStatusService } from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = getVmStatusService();
  const health = await service.checkImagesHealth();
  return NextResponse.json(health, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
