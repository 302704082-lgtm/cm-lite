import { handle, ok, requireUser, toId } from '@/lib/api';
import { submitInstance } from '@/lib/flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 提交送签：必填齐、检查单逐项判定且无「不符合」才允许 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await ctx.params;
    await submitInstance(user, toId(rawId));
    return ok({ ok: true, status: 'SUBMITTED' });
  });
}
