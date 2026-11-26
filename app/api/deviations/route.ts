import { z } from 'zod';
import { q1, insert } from '@/lib/db';
import { handle, ok, requireUser, ApiError } from '@/lib/api';
import { logEvent } from '@/lib/events';
import { assertApprovedById, gateEnabled } from '@/lib/flow';
import type { Ci } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  kind: z.enum(['DEVIATION', 'CONCESSION']),
  ci_pn: z.string().trim().min(1, '请选择构型项'),
  unit_sn: z.string().trim().nullable().optional(),
  reason: z.string().trim().min(1, '请填写原因与处置'),
  qty_limit: z.coerce.number().int().min(1, '数量上限必须 ≥ 1'),
  expire_at: z.string().trim().min(1, '请填写有效期'),
  request_form_id: z.coerce.number().int().nullable().optional(), // 已批准的《偏离 / 让步申请单》
});

/** 新建偏离 / 让步（R8：数量上限与有效期必填；批准前不得生效） */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');
    const d = parsed.data;

    const ci = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [user.tenantId, d.ci_pn]);
    if (!ci) throw new ApiError(400, '构型项不存在');

    // 闸门：偏离 / 让步必须先走自己的申请流程，批准后才允许登记生效
    if (await gateEnabled(user.tenantId, 'DEVIATION')) {
      await assertApprovedById(
        user.tenantId,
        Number(d.request_form_id ?? 0),
        'DEVIATION',
        '偏离 / 让步不能直接登记，需先走《偏离 / 让步申请单》并完成全部签署',
      );
    }

    const iso = d.expire_at.length === 10 ? `${d.expire_at}T00:00:00Z` : d.expire_at;
    const id = await insert(
      `INSERT INTO deviations (tenant_id, kind, ci_pn, unit_sn, reason, qty_limit, expire_at, status, created_by)
       VALUES (?,?,?,?,?,?,?, 'ACTIVE', ?)`,
      [user.tenantId, d.kind, d.ci_pn, d.unit_sn || null, d.reason, d.qty_limit, iso, user.name],
    );

    await logEvent(
      user.tenantId,
      user.name,
      'DEVIATION_CREATE',
      'deviation',
      id,
      `${d.kind === 'DEVIATION' ? '偏离' : '让步'}单：${d.ci_pn} 限 ${d.qty_limit} 件，有效期至 ${iso.slice(0, 10)}`,
    );

    return ok({ id }, 201);
  });
}
