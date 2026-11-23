import { handle, ok } from '@/lib/api';
import { clearAuthCookies } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return handle(async () => {
    await clearAuthCookies();
    return ok();
  });
}
