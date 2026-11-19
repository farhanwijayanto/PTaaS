import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromSession, getSessionFromRequest } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  const user = getAuthenticatedUserFromSession(session);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, user });
}
