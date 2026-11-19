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
  const width = clampInt(url.searchParams.get('width'), 480, 3840, 1280);
  const height = clampInt(url.searchParams.get('height'), 320, 2160, 720);
  const fontSize = clampInt(url.searchParams.get('fontSize'), 10, 22, 13);
  const themeKey = (url.searchParams.get('theme') || 'kali').toLowerCase();
  const colorScheme = SSH_COLOR_SCHEMES[themeKey] || SSH_COLOR_SCHEMES.kali;

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
              'font-name': 'monospace',
              'font-size': fontSize,
              'color-scheme': colorScheme,
              'terminal-type': 'xterm-256color',
              width,
              height,
              dpi: '96',
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
