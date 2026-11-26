import { q1, exec } from '@/lib/db';
import { ApiError, handle, ok, requireUser, toId } from '@/lib/api';
import { logEvent } from '@/lib/events';
import { assertApproved, gateEnabled } from '@/lib/flow';
import type { Baseline } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 冻结基线：冻结后条目只读，基线内构型项的版本/状态只能走变更流程 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await ctx.params;
    const id = toId(rawId);

    const bl = await q1<Baseline>(`SELECT * FROM baselines WHERE tenant_id = ? AND id = ?`, [
      user.tenantId,
      id,
    ]);
    if (!bl) throw new ApiError(404, '基线不存在');
    if (bl.status === 'FROZEN') throw new ApiError(409, '该基线已冻结，不能重复冻结');

    // 闸门：有启用的「基线发布申请单」模板时，必须先有一张三签齐备、已批准的单子
    if (await gateEnabled(user.tenantId, 'BASELINE_RELEASE')) {
      await assertApproved(
        user.tenantId,
        'BASELINE_RELEASE',
        'baseline',
        id,
        '基线不能直接冻结，需先走《基线发布申请单》',
      );
    }

    await exec(
      `UPDATE baselines SET status = 'FROZEN', frozen_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      [id],
    );

    await logEvent(
      user.tenantId,
      user.name,
      'BASELINE_FREEZE',
      'baseline',
      id,
      `${bl.code} 冻结，此后该基线内构型项只能走变更流程`,
    );

    return ok();
  });
}
