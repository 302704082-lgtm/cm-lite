import { z } from 'zod';
import { handle, ok, requireUser, toId, ApiError } from '@/lib/api';
import { createCrFromPr } from '@/lib/change-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const impactValue = z.enum(['YES', 'NO', 'TBD']);

const schema = z.object({
  model: z.string().trim().min(1),
  ci_pn: z.string().trim().min(1),
  from_rev: z.string().trim().nullable().optional(),
  to_rev: z.string().trim().nullable().optional(),
  new_pn: z.string().trim().nullable().optional(),
  title: z.string().trim().min(1, '请填写变更标题'),
  reason: z.string().trim().nullable().optional(),
  f_fit: z.boolean().default(false),
  f_form: z.boolean().default(false),
  f_function: z.boolean().default(false),
  abca: z.boolean().default(false),
  abcb: z.boolean().default(false),
  abcc: z.boolean().default(false),
  class_result: z.string().trim().min(1), // 类别代号由生效配置决定，不再写死
  class_reason: z.string().trim().nullable().optional(),
  impact: z.record(z.string(), impactValue),
  wip_action: z.string().trim().nullable().optional(),
});

/** PR → CR：定级 + 生成审批链（第 1 步自动签署） */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await ctx.params;
    const prId = toId(rawId);

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');

    const d = parsed.data;
    const result = await createCrFromPr(user, prId, {
      model: d.model,
      ci_pn: d.ci_pn,
      from_rev: d.from_rev ?? null,
      to_rev: d.to_rev ?? null,
      new_pn: d.new_pn ?? null,
      title: d.title,
      reason: d.reason ?? null,
      f_fit: d.f_fit,
      f_form: d.f_form,
      f_function: d.f_function,
      abca: d.abca,
      abcb: d.abcb,
      abcc: d.abcc,
      class_result: d.class_result,
      class_reason: d.class_reason ?? null,
      impact: d.impact,
      wip_action: d.wip_action ?? null,
    });

    return ok(result, 201);
  });
}
