import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server-auth';
import {
  createStoredUser,
  findUserById,
  listAllUsers,
  sanitizeUser,
  type UserQuota,
  type UserRole,
  type UserStatus,
} from '@/lib/server-store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== 'admin' && session.role !== 'instructor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const all = listAllUsers();
  if (session.role === 'admin') {
    return NextResponse.json({ users: all.map(sanitizeUser) });
  }

  const actor = findUserById(session.userId);
  const allowedCohorts = actor?.cohorts || [];
  const filtered = all.filter(
    (u) => u.role === 'student' && u.cohort && allowedCohorts.includes(u.cohort)
  );
  return NextResponse.json({ users: filtered.map(sanitizeUser) });
}

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== 'admin' && session.role !== 'instructor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      role?: UserRole;
      idNum?: string;
      cohort?: string;
      password?: string;
      mustChangePassword?: boolean;
      status?: UserStatus;
      quota?: UserQuota;
      idleTimeoutMin?: number;
    };

    if (!body.name?.trim() || !body.email?.trim()) {
      return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
    }

    const requestedRole: UserRole =
      session.role === 'instructor' ? 'student' : body.role || 'student';

    if (body.password && body.password.trim().length > 0 && body.password.trim().length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const { user, plainPassword } = createStoredUser({
      name: body.name,
      email: body.email,
      role: requestedRole,
      idNum: body.idNum,
      cohort: body.cohort,
      password: body.password,
      mustChangePassword: body.mustChangePassword ?? !body.password?.trim(),
      status: session.role === 'instructor' ? 'pending' : body.status || 'active',
      quota: body.quota,
      idleTimeoutMin: body.idleTimeoutMin,
    });

    return NextResponse.json(
      { user: sanitizeUser(user), tempPassword: plainPassword },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create user' },
      { status: 400 }
    );
  }
}
