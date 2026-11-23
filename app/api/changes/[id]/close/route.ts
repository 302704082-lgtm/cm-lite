import { handle, ok, requireUser, toId } from '@/lib/api';
import { closeChange } from '@/lib/change-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 关闭：CN 已执行且验证通过（R3） */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await ctx.params;
    await closeChange(user, toId(rawId));
    return ok();
  });
}
