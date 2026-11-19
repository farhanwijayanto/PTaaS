import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest } from '@/lib/server-auth';
import { findVmByIdOrName } from '@/lib/server-store';

export const dynamic = 'force-dynamic';

function clampInt(raw: string | null, min: number, max: number, fallback: number): string {
  const n = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.min(max, Math.max(min, n)));
}

export async function GET(req: Request) {
  // Enforce authenticated session cookie
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized. Please sign in first.' },
      { status: 401 }
    );
  }

  const key = process.env.GUAC_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ error: 'GUAC_SECRET_KEY is not set' }, { status: 500 });
  }

  const url = new URL(req.url);
  const protocol = url.searchParams.get('protocol') === 'ssh' ? 'ssh' : 'rdp';
  const requestedVm = (url.searchParams.get('vm') || '').trim();
  const width = clampInt(url.searchParams.get('width'), 640, 3840, 1280);
  const height = clampInt(url.searchParams.get('height'), 480, 2160, 720);

  const defaultHost = process.env.GUAC_DEFAULT_HOST || 'kali-lab-01';
  const multiHost = process.env.GUAC_MULTI_HOST === 'true';

  let targetHost = defaultHost;
  let vmLabel = requestedVm || defaultHost;

  if (requestedVm) {
    const matched = findVmByIdOrName(requestedVm);
    if (matched) {
      // Enforce ownership for students
      if (session.role === 'student' && matched.owner !== session.userId) {
        return NextResponse.json({ error: 'Forbidden: VM belongs to another user.' }, { status: 403 });
      }
      targetHost = matched.rdpHost || (multiHost ? matched.name : defaultHost);
      vmLabel = matched.name;
    } else if (multiHost && /^[a-zA-Z0-9-]+$/.test(requestedVm)) {
      targetHost = requestedVm;
      vmLabel = requestedVm;
    }
  }

  const username = process.env.GUAC_KALI_USER || 'student';
  const password = process.env.GUAC_KALI_PASS || 'student123';

  const iv = crypto.randomBytes(16);

  const payload =
    protocol === 'ssh'
      ? {
          connection: {
            type: 'ssh',
            settings: {
              hostname: targetHost,
              port: '22',
              username,
              password,
              'font-size': '13',
              'color-scheme': 'green-black',
            },
          },
        }
      : {
          connection: {
            type: 'rdp',
            settings: {
              hostname: targetHost,
              port: '3389',
              username,
              password,
              'ignore-cert': 'true',
              security: 'any',
              'resize-method': 'display-update',
              width,
              height,
            },
          },
        };

  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const tokenData = {
    iv: iv.toString('base64'),
    value: encrypted,
  };

  const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

  return NextResponse.json({
    token,
    vm: vmLabel,
    host: targetHost,
    protocol,
    user: session.email,
    role: session.role,
  });
}
