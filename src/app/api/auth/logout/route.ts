import { NextResponse } from 'next/server';
import { getClearSessionCookieConfig } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(getClearSessionCookieConfig());
  return response;
}
