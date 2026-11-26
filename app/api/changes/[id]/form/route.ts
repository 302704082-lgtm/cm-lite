import { z } from 'zod';
import { q1 } from '@/lib/db';
import { handle, ok, requireUser, toId, ApiError } from '@/lib/api';
import { createInstance, getTemplate } from '@/lib/flow';
import { logEvent } from '@/lib/events';
import type { Change } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ formCode: z.string().trim().min(1) });

/** 给某张变更单挂一步的受控表单（流程配置里「每步出哪张表」的落点） */
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

    const change = await q1<Change>(`SELECT * FROM changes WHERE tenant_id = ? AND id = ?`, [
      user.tenantId,
      changeId,
    ]);
    if (!change) throw new ApiError(404, '变更单不存在');
    const t = await getTemplate(user.tenantId, parsed.data.formCode);
    if (!t) throw new ApiError(400, `表单模板「${parsed.data.formCode}」不存在或未启用`);

    const inst = await createInstance(user, {
      templateCode: parsed.data.formCode,
      targetType: 'change',
      targetId: changeId,
      title: `${t.name}（${change.code}）`,
      data: { change_code: change.code, model: change.model, ci_pn: change.ci_pn ?? '' },
    });

    await logEvent(
      user.tenantId,
      user.name,
      'CHANGE_FORM_CREATE',
      'change',
      changeId,
      `${change.code} 挂出流程表单「${t.name}」${inst.code}`,
    );
    return ok({ id: inst.id, code: inst.code }, 201);
  });
}
