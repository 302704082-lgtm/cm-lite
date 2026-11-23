import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { ROLE_NAMES } from '@/lib/constants';
import Shell from '@/components/shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');

  return (
    <Shell
      user={{
        name: user.name,
        roleLabel: ROLE_NAMES[user.role] ?? user.role,
        tenantName: user.tenantName,
      }}
    >
      {children}
    </Shell>
  );
}
