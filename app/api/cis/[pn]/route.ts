import { z } from 'zod';
import { q1, exec } from '@/lib/db';
import { ApiError, handle, ok, requireUser } from '@/lib/api';
import { isInFrozenBaseline } from '@/lib/queries';
import { getEffectiveRules } from '@/lib/profile';
import { logEvent } from '@/lib/events';
import type { Ci } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z
  .object({
    name: z.string().trim().min(1).optional(),
    owner: z.string().trim().min(1).optional(),
    basis: z.string().trim().nullable().optional(),
    note: z.string().trim().nullable().optional(),
    qty: z.coerce.number().int().min(0).optional(),
    // 这两个字段默认由变更流程写入；是否允许直接改，由规则的 frozen_no_edit 开关决定
    rev: z.string().trim().min(1).optional(),
    status: z.enum(['DRAFT', 'CONTROLLED', 'FROZEN', 'VOID']).optional(),
  })
  .strict();

/** 编辑构型项属性。R2：rev / status 只允许变更落库流程写入，任何直接改写一律 409 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ pn: string }> },
): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { pn } = await ctx.params;
    const decoded = decodeURIComponent(pn);

    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // R2：版本与状态默认只能由变更流程写入。
    // 规则配置里的「冻结后禁止直接改版本」开关关掉后，允许直接改，但仍强制留痕。
    const rules = await getEffectiveRules(user.tenantId);
    const touchesControlled = 'rev' in raw || 'status' in raw;
    if (touchesControlled && rules.switches.frozenNoEdit) {
      const frozen = await isInFrozenBaseline(user.tenantId, decoded);
      throw new ApiError(
        409,
        frozen
          ? '该构型项受冻结基线控制，请先走变更流程（版本与状态只能由变更落库写入）'
          : '版本与状态只能由变更流程写入，不允许直接修改',
      );
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');

    const ci = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [
      user.tenantId,
      decoded,
    ]);
    if (!ci) throw new ApiError(404, '构型项不存在');

    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      sets.push(`${k} = ?`);
      args.push(v as string | number | null);
    }
    if (sets.length === 0) throw new ApiError(400, '没有可更新的字段');

    args.push(ci.id);
    await exec(`UPDATE cis SET ${sets.join(', ')} WHERE id = ?`, args);

    await logEvent(
      user.tenantId,
      user.name,
      touchesControlled ? 'CI_UPDATE_CONTROLLED' : 'CI_UPDATE',
      'ci',
      decoded,
      `编辑构型项属性：${sets.join(', ')}${
        touchesControlled ? '（规则配置关闭了「冻结后禁止直接改版本」，本次直接改写已留痕）' : ''
      }`,
    );
    return ok();
  });
}
