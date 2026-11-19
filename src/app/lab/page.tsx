import { redirect } from 'next/navigation';
import KaliDesktop from '@/components/KaliDesktop';
import { getServerSession } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function LabPage() {
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }

  return <KaliDesktop />;
}
