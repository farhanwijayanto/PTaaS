import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { findUserById } from '@/lib/server-store';
import { getVmStatusService, type VmBusEvent } from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = getVmStatusService();
  const actor = findUserById(session.userId);
  const encoder = new TextEncoder();

  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastKnownAllowedVmIds = new Set<string>();

      const sendEvent = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const pushSnapshot = async (forceRefresh = false) => {
        if (closed) return;
        try {
          const snap = await service.getScopedSnapshot(session, forceRefresh);
          lastKnownAllowedVmIds = new Set(snap.vms.map((v) => v.id));
          sendEvent('snapshot', snap);
        } catch {
          // Ignore transient push errors
        }
      };

      await pushSnapshot(false);

      const unsubscribe = service.subscribe((evt: VmBusEvent) => {
        if (closed) return;
        if (evt.type === 'session_invalidated') {
          if (session.role === 'admin' || lastKnownAllowedVmIds.has(evt.vmId)) {
            sendEvent('session_invalidated', evt);
          }
          return;
        }
        if (evt.type === 'creation_progress') {
          const canSee =
            session.role === 'admin' ||
            evt.owner === session.userId ||
            (session.role === 'instructor' && Boolean(actor?.cohorts.includes(evt.tenant)));
          if (canSee) {
            sendEvent('creation_progress', evt);
          }
          return;
        }
        if (evt.type === 'status_changed') {
          void pushSnapshot(false);
        }
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 20000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch { /* ignore */ }
      };

      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
