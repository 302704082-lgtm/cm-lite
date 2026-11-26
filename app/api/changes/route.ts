import { z } from 'zod';
import { handle, ok, requireUser } from '@/lib/api';
import { createPr } from '@/lib/change-service';
import { ApiError } from '@/lib/api';
import { assertApprovedById, gateEnabled } from '@/lib/flow';
import { exec } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  model: z.string().trim().min(1, '请选择机型'),
  ci_pn: z.string().trim().min(1, '请选择变更对象'),
  title: z.string().trim().min(1, '请填写变更标题'),
  reason: z.string().trim().nullable().optional(),
  request_form_id: z.coerce.number().int().nullable().optional(), // 已批准的《变更申请与可行性评审单》
});

/** 新建变更申请（PR）：只能从一张已批准的申请单发起 */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');

    // 闸门：不能「说建就建」。有启用模板时，必须先在表单中心提交并批准《变更申请与可行性评审单》
    if (await gateEnabled(user.tenantId, 'CHANGE_REQUEST')) {
      const approved = await assertApprovedById(
        user.tenantId,
        Number(parsed.data.request_form_id ?? 0),
        'CHANGE_REQUEST',
        '变更不能直接建立，需先走《变更申请与可行性评审单》并完成评审签署',
      );
      const created = await createPr(user, parsed.data);
      await exec(
        `UPDATE form_instances SET target_type = 'change', target_id = ? WHERE id = ?`,
        [created.id, approved.id],
      );
      return ok({ id: created.id, code: created.code, linkedForm: approved.code }, 201);
    }

    const created = await createPr(user, parsed.data);
    return ok({ id: created.id, code: created.code }, 201);
  });
}
