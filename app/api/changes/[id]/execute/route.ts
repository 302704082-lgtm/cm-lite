import { z } from 'zod';
import { handle, ok, requireUser, toId, ApiError } from '@/lib/api';
import { executeChange } from '@/lib/change-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  note: z.string().trim().min(1, '请填写执行说明'),
  verified: z.boolean().default(false),
});

/** CN 执行确认：建 CN 单据 + 落库（升版或换号）+ CR 转 EXECUTED */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await ctx.params;
    const changeId = toId(rawId);

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');

    const result = await executeChange(user, changeId, parsed.data.note, parsed.data.verified);
    return ok(result);
  });
}
