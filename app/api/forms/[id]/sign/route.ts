import { z } from 'zod';
import { handle, ok, requireUser, toId, ApiError } from '@/lib/api';
import { signInstance } from '@/lib/flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  stepNo: z.coerce.number().int().min(1),
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().trim().nullable().optional(),
});

/** 逐级签署：不可跳步、岗位要匹配、同一人不能签两步（职责分离） */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await ctx.params;
    const id = toId(rawId);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');

    const r = await signInstance(user, id, parsed.data.stepNo, parsed.data.decision, parsed.data.comment ?? null);
    return ok({ ok: true, ...r });
  });
}
