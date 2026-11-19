import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import { findUserById, sanitizeUser, updateStoredUser } from '@/lib/server-store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { newPassword?: string };
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    const existing = findUserById(session.userId);
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updated = updateStoredUser(existing.id, {
      password: newPassword,
      mustChangePassword: false,
      status: existing.status === 'pending' ? 'active' : existing.status,
    });

    return NextResponse.json({ success: true, user: sanitizeUser(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update password' },
      { status: 400 }
    );
  }
}
