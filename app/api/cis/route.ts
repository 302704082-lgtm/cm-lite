import { z } from 'zod';
import { q1, insert } from '@/lib/db';
import { ApiError, handle, ok, requireUser } from '@/lib/api';
import { CI_TYPES } from '@/lib/constants';
import { logEvent } from '@/lib/events';
import type { Ci } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  model: z.string().trim().min(1, '请填写机型'),
  pn: z.string().trim().min(1, '请填写件号'),
  name: z.string().trim().min(1, '请填写名称'),
  type: z.enum(CI_TYPES),
  parent_pn: z.string().trim().nullable().optional(),
  qty: z.coerce.number().int().min(1).default(1),
  rev: z.string().trim().min(1).default('A'),
  status: z.enum(['DRAFT', 'CONTROLLED']).default('DRAFT'),
  criticality: z.enum(['NORMAL', 'KEY', 'IMPORTANT']).default('NORMAL'),
  owner: z.string().trim().min(1, '请填写责任人'),
  basis: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
});

/** 新建构型项。R1：(tenant_id, pn) 全库唯一，冲突返回 409 并指出冲突项 */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');
    const input = parsed.data;

    const dup = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [
      user.tenantId,
      input.pn,
    ]);
    if (dup) {
      throw new ApiError(409, `件号 ${input.pn} 已存在：${dup.name}（当前版本 ${dup.rev}，状态 ${dup.status}）`, {
        pn: dup.pn,
        name: dup.name,
        rev: dup.rev,
        status: dup.status,
      });
    }

    if (input.parent_pn) {
      const parent = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [
        user.tenantId,
        input.parent_pn,
      ]);
      if (!parent) throw new ApiError(400, `上级构型项 ${input.parent_pn} 不存在`);
    }

    const id = await insert(
      `INSERT INTO cis (tenant_id, model, pn, name, type, parent_pn, qty, rev, sn_controlled, status, criticality, owner, basis, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        user.tenantId,
        input.model,
        input.pn,
        input.name,
        input.type,
        input.parent_pn || null,
        input.qty,
        input.rev,
        input.type === 'HARDWARE' ? 1 : 0,
        input.status,
        input.criticality,
        input.owner,
        input.basis || null,
        input.note || null,
      ],
    );

    await logEvent(
      user.tenantId,
      user.name,
      'CI_CREATE',
      'ci',
      input.pn,
      `新建构型项 ${input.pn}（${input.name}），状态 ${input.status}`,
    );

    return ok({ id, pn: input.pn }, 201);
  });
}
