import { z } from 'zod';
import { handle, ok, requireUser, toId, ApiError } from '@/lib/api';
import { signStep } from '@/lib/change-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  stepNo: z.coerce.number().int().positive(),
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().trim().max(500).nullable().optional(),
});

/** 签署：SoD 先于角色校验，判定全在服务端 */
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

    const result = await signStep(
      user,
      changeId,
      parsed.data.stepNo,
      parsed.data.decision,
      parsed.data.comment ?? null,
    );
    return ok(result);
  });
}
