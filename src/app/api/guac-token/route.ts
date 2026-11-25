import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromRequest } from '@/lib/server-auth';
import { getVmStatusService } from '@/lib/vm-status-service';

export const dynamic = 'force-dynamic';

function clampInt(raw: string | null, min: number, max: number, fallback: number): string {
  const n = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.min(max, Math.max(min, n)));
}

const SSH_COLOR_SCHEMES: Record<string, string> = {
  kali: [
    'background: rgb:0a/0d/14',
    'foreground: rgb:c9/d1/d9',
    'color0: rgb:0a/0d/14',
    'color1: rgb:ff/7b/72',
    'color2: rgb:00/e5/99',
    'color3: rgb:d2/99/22',
    'color4: rgb:58/a6/ff',
    'color5: rgb:bc/8c/ff',
    'color6: rgb:39/c5/cf',
    'color7: rgb:d0/d7/de',
    'color8: rgb:48/4f/58',
    'color9: rgb:ff/a1/98',
    'color10: rgb:56/d3/64',
    'color11: rgb:e3/b3/41',
    'color12: rgb:79/c0/ff',
    'color13: rgb:d2/a8/ff',
    'color14: rgb:56/d4/dd',
    'color15: rgb:ff/ff/ff',
  ].join('; ') + ';',
  ubuntu: 'background: rgb:30/0a/24; foreground: rgb:ff/ff/ff; color2: rgb:8a/e2/34; color4: rgb:72/9f/cf;',
  solarized: 'background: rgb:00/2b/36; foreground: rgb:83/94/96; color2: rgb:85/99/00; color4: rgb:26/8b/d2;',
  light: 'background: rgb:f8/fa/fc; foreground: rgb:0f/17/2a; color2: rgb:16/a3/4a; color4: rgb:25/63/eb;',
  matrix: 'green-black',
};

export async function GET(req: Request) {
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
  const width = clampInt(url.searchParams.get('width'), 480, 3840, 1280);
  const height = clampInt(url.searchParams.get('height'), 320, 2160, 720);
  const dpi = clampInt(url.searchParams.get('dpi'), 96, 192, 96);
  const fontSize = clampInt(url.searchParams.get('fontSize'), 10, 22, 13);
  const themeKey = (url.searchParams.get('theme') || 'kali').toLowerCase();
  const colorScheme = SSH_COLOR_SCHEMES[themeKey] || SSH_COLOR_SCHEMES.kali;

  const service = getVmStatusService();
  let effectiveVm = requestedVm;
  if (!effectiveVm) {
    const snap = await service.getScopedSnapshot(session, false);
    const firstRunning = snap.vms.find((v) => v.status === 'running');
    if (firstRunning) {
      effectiveVm = firstRunning.id;
    } else {
      return NextResponse.json({ error: 'VM identifier is required', code: 'vm_required' }, { status: 400 });
    }
  }

  let target;
  try {
    target = await service.resolveTunnelTarget(session, effectiveVm);
  } catch (err) {
    const e = err as Error & { statusCode?: number; code?: string };
    return NextResponse.json(
      { error: e.message || 'Failed to resolve VM target', ...(e.code ? { code: e.code } : {}) },
      { status: e.statusCode || 500 }
    );
  }

  if (!target) {
    return NextResponse.json(
      { error: 'Virtual machine not found or access denied', code: 'vm_not_found' },
      { status: 404 }
    );
  }

  if (target.vm.status !== 'running') {
    return NextResponse.json(
      {
        error: 'VM is not running. Start the VM before opening desktop or terminal.',
        code: 'vm_not_running',
        status: target.vm.status,
      },
      { status: 409 }
    );
  }

  const username = process.env.GUAC_KALI_USER || 'student';
  const iv = crypto.randomBytes(16);

  // Route strictly to THIS VM's live internal container IP and unique per-VM password (never shared host/password)
  const payload =
    protocol === 'ssh'
      ? {
          connection: {
            type: 'ssh',
            settings: {
              hostname: target.host,
              port: String(target.sshPort || 2222),
              username,
              password: target.password,
              'font-name': 'monospace',
              'font-size': fontSize,
              'color-scheme': colorScheme,
              'terminal-type': 'xterm-256color',
              width,
              height,
              dpi: '96',
            },
          },
          scope: {
            vmId: target.vm.id,
            userId: session.userId,
          },
        }
      : {
          connection: {
            type: 'rdp',
            settings: {
              hostname: target.host,
              port: String(target.rdpPort || 3389),
              username,
              password: target.password,
              'ignore-cert': 'true',
              security: 'any',
              'resize-method': 'display-update',
              'color-depth': '24',
              'enable-font-smoothing': 'true',
              'force-lossless': 'true',
              width,
              height,
              dpi,
            },
          },
          scope: {
            vmId: target.vm.id,
            userId: session.userId,
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
  const sessionTokenId = crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);

  service.registerActiveSession({
    tokenId: sessionTokenId,
    vmId: target.vm.id,
    userId: session.userId,
    protocol,
  });

  // Never return passwords in API responses
  return NextResponse.json({
    token,
    sessionTokenId,
    vm: target.vm.name,
    vmId: target.vm.id,
    host: target.host,
    protocol,
    user: session.email,
    role: session.role,
  });
}
