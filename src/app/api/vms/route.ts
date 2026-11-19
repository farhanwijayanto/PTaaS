import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { createStoredVm, findUserById, listAllVms } from '@/lib/server-store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const all = listAllVms();
  const actor = findUserById(session.userId);
  let visible = all;
  if (session.role === 'student') {
    visible = all.filter((v) => v.owner === session.userId);
  } else if (session.role === 'instructor' && actor) {
    visible = all.filter((v) => actor.cohorts.includes(v.tenant));
  }

  return NextResponse.json({ vms: visible });
}

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      os?: string;
      vcpu?: number;
      ram?: number;
      disk?: number;
      vpc?: string;
      cohort?: string;
    };

    const requestedOs = (body.os || 'kali').toLowerCase();
    if (requestedOs !== 'kali') {
      return NextResponse.json(
        { error: 'Saat ini hanya image Kali Linux yang tersedia untuk pembuatan VM baru.' },
        { status: 400 }
      );
    }

    const all = listAllVms();
    const actor = findUserById(session.userId);
    const limit = actor?.maxSelfServiceVms || 3;
    const ownedCount = all.filter((v) => v.owner === session.userId).length;
    if (session.role === 'student' && ownedCount >= limit) {
      return NextResponse.json(
        { error: `Maximum self-service VM limit (${limit}) reached.`, code: 'vm_limit_reached' },
        { status: 403 }
      );
    }

    let provisionedHost: string | undefined;
    // Optional hook for real Docker container creation on b1-6 when PROVISIONER_API_URL is set
    if (process.env.PROVISIONER_API_URL) {
      const provRes = await fetch(`${process.env.PROVISIONER_API_URL.replace(/\/+$/, '')}/vms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.PROVISIONER_API_KEY
            ? { Authorization: `Bearer ${process.env.PROVISIONER_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({
          name: body.name,
          os: 'kali',
          vcpu: body.vcpu || 2,
          ram: body.ram || 4,
          owner: session.userId,
        }),
      });
      if (!provRes.ok) {
        const text = await provRes.text().catch(() => 'Provisioner failed');
        return NextResponse.json({ error: `Provisioner error: ${text}` }, { status: 502 });
      }
      const provData = (await provRes.json().catch(() => ({}))) as { hostname?: string };
      provisionedHost = provData.hostname;
    }

    const vm = createStoredVm({
      name: body.name || `kali-lab-${Date.now().toString().slice(-4)}`,
      os: 'kali',
      vcpu: Number(body.vcpu) || 2,
      ram: Number(body.ram) || 4,
      disk: Number(body.disk) || 30,
      vpc: body.vpc || 'vpc-cs401-01',
      owner: session.userId,
      tenant: body.cohort || session.cohort || 'CS-401',
      rdpHost: provisionedHost,
    });

    return NextResponse.json({ vm }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create VM' },
      { status: 400 }
    );
  }
}
