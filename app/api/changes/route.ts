import { z } from 'zod';
import { handle, ok, requireUser } from '@/lib/api';
import { createPr } from '@/lib/change-service';
import { ApiError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  model: z.string().trim().min(1, '请选择机型'),
  ci_pn: z.string().trim().min(1, '请选择变更对象'),
  title: z.string().trim().min(1, '请填写变更标题'),
  reason: z.string().trim().nullable().optional(),
});

/** 新建变更申请（PR）：变更唯一入口的第一步 */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');

    const created = await createPr(user, parsed.data);
    return ok({ id: created.id, code: created.code }, 201);
  });
}
