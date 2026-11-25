import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { DockerApiError, getVmStatusService } from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  const service = getVmStatusService();
  const snapshot = await service.getScopedSnapshot(session, forceRefresh);

  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      imageId?: string;
      os?: string;
      vcpu?: number;
      ram?: number;
      disk?: number;
      vpc?: string;
      cohort?: string;
      grantId?: string;
      idempotencyKey?: string;
      restartPolicy?: string;
      waitForReady?: boolean;
    };

    // Never accept free-form image references or URLs from the client; only allow-listed catalog IDs
    if ('image' in (body as Record<string, unknown>)) {
      return NextResponse.json(
        { error: 'Free-form image names are not allowed. Use an allow-listed imageId from the catalog.', code: 'invalid_image' },
        { status: 400 }
      );
    }

    const headerIdemp = req.headers.get('idempotency-key') || undefined;
    const service = getVmStatusService();
    const vm = await service.createVm(session, {
      name: body.name,
      imageId: body.imageId,
      os: body.os,
      vcpu: body.vcpu,
      ram: body.ram,
      disk: body.disk,
      vpc: body.vpc,
      cohort: body.cohort,
      grantId: body.grantId,
      idempotencyKey: headerIdemp || body.idempotencyKey,
      restartPolicy: body.restartPolicy === 'no' ? 'no' : 'unless-stopped',
      waitForReady: Boolean(body.waitForReady),
    });

    return NextResponse.json(
      {
        vm,
        statusSource: vm.statusSource,
        statusUpdatedAt: vm.statusUpdatedAt,
        stale: vm.stale,
      },
      { status: 201 }
    );
  } catch (err) {
    const e = err as Error & { code?: string; statusCode?: number };
    const status =
      e instanceof DockerApiError
        ? e.statusCode >= 400 && e.statusCode < 600
          ? e.statusCode
          : 502
        : e.statusCode || 400;

    return NextResponse.json(
      {
        error: e?.message || 'Failed to create VM',
        ...(e?.code ? { code: e.code } : {}),
      },
      { status }
    );
  }
}
