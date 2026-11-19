import { NextResponse } from 'next/server';
import {
  findUserByIdentifier,
  sanitizeUser,
  verifyUserPassword,
} from '@/lib/server-store';
import { createSessionToken, getSessionCookieConfig } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const identifier = (body.email || '').trim();
    const password = typeof body.password === 'string' ? body.password : '';

    if (!identifier || !password) {
      return NextResponse.json({ error: 'invalid', message: 'Email and password are required.' }, { status: 400 });
    }

    const user = findUserByIdentifier(identifier);
    if (!user || !verifyUserPassword(user, password)) {
      return NextResponse.json({ error: 'invalid', message: 'Invalid email or password.' }, { status: 401 });
    }

    if (user.status === 'suspended') {
      return NextResponse.json({ error: 'locked', message: 'Account is suspended.' }, { status: 403 });
    }

    user.lastLogin = new Date().toISOString();
    const token = createSessionToken(user);

    const response = NextResponse.json({
      success: true,
      user: sanitizeUser(user),
      mustChangePassword: !!user.mustChangePassword,
    });
    response.cookies.set(getSessionCookieConfig(token));
    return response;
  } catch {
    return NextResponse.json({ error: 'invalid', message: 'Invalid request payload.' }, { status: 400 });
  }
}
