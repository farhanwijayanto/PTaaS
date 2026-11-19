import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.GUAC_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ error: 'GUAC_SECRET_KEY is not set' }, { status: 500 });
  }
  const iv = crypto.randomBytes(16);

  // Sesuaikan username & password dengan yang kamu set di Dockerfile ptaas-kali
  const payload = {
    connection: {
      type: 'rdp',
      settings: {
        hostname: 'kali-lab-01',
        port: '3389',
        username: 'student',
        password: 'student123',
        'ignore-cert': 'true',
        security: 'any',
        'resize-method': 'display-update',
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

  return NextResponse.json({ token });
}
