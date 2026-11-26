import { z } from 'zod';
import { handle, ok, requireUser, toId, ApiError } from '@/lib/api';
import { getInstance, instanceChecks, saveInstance } from '@/lib/flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  data: z.record(z.string(), z.string()),
  checks: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      result: z.enum(['PENDING', 'PASS', 'FAIL', 'NA']),
      note: z.string().optional(),
    }),
  ),
});

/** 保存表单字段与检查单逐项判定（仅草稿可改） */
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

    const inst = await getInstance(user.tenantId, id);
    if (!inst) throw new ApiError(404, '表单不存在');
    // 检查项标签以模板为准，避免前端传错标签
    const defs = instanceChecks(inst);
    const labelOf = new Map(defs.map((d) => [d.key, d.label]));
    const checks = parsed.data.checks.map((c) => ({
      key: c.key,
      label: labelOf.get(c.key) ?? c.label,
      result: c.result,
      note: c.note ?? '',
    }));

    await saveInstance(user, id, parsed.data.data, checks);
    return ok({ id, checks: checks.length });
  });
}
