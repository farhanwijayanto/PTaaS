import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import {
  deleteStoredUser,
  sanitizeUser,
  updateStoredUser,
  type UserQuota,
  type UserRole,
  type UserStatus,
} from '@/lib/server-store';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== 'admin' && session.role !== 'instructor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const body = (await req.json()) as Partial<{
      name: string;
      email: string;
      role: UserRole;
      cohort: string;
      status: UserStatus;
      password: string;
      mustChangePassword: boolean;
      maxSelfServiceVms: number;
      quota: UserQuota;
      idleTimeoutMin: number;
    }>;

    // Instructors cannot change roles to admin/instructor
    if (session.role === 'instructor' && body.role && body.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (body.password !== undefined && body.password.length > 0 && body.password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const updated = updateStoredUser(id, body);
    return NextResponse.json({ user: sanitizeUser(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update user' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  if (id === session.userId) {
    return NextResponse.json({ error: 'Cannot delete your own active account.' }, { status: 400 });
  }

  const deleted = deleteStoredUser(id);
  if (!deleted) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
