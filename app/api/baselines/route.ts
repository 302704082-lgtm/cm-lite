import { z } from 'zod';
import { q, q1, insert, db } from '@/lib/db';
import { ApiError, handle, ok, requireUser } from '@/lib/api';
import { logEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  model: z.string().trim().min(1, '请选择机型'),
  code: z.string().trim().min(1, '请填写基线编号').max(20),
  name: z.string().trim().min(1, '请填写基线名称'),
  kind: z.enum(['REQUIREMENT', 'DESIGN', 'CERTIFICATION', 'OTHER']).default('DESIGN'),
});

/** 新建基线：一键快照当前所有 CONTROLLED 构型项（pn + rev + 文件版） */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');
    const { model, code, name, kind } = parsed.data;

    const dup = await q1(`SELECT id FROM baselines WHERE tenant_id = ? AND code = ?`, [
      user.tenantId,
      code,
    ]);
    if (dup) throw new ApiError(409, `基线编号 ${code} 已存在`);

    const cis = await q<{ pn: string; rev: string; doc_no: string | null; doc_rev: string | null }>(
      `SELECT c.pn, c.rev,
              (SELECT d.doc_no FROM docs d WHERE d.tenant_id = c.tenant_id AND d.ci_pn = c.pn ORDER BY d.doc_no LIMIT 1) AS doc_no,
              (SELECT d.rev FROM docs d WHERE d.tenant_id = c.tenant_id AND d.ci_pn = c.pn ORDER BY d.doc_no LIMIT 1) AS doc_rev
       FROM cis c
       WHERE c.tenant_id = ? AND c.model = ? AND c.status = 'CONTROLLED'
       ORDER BY c.pn`,
      [user.tenantId, model],
    );
    if (cis.length === 0) throw new ApiError(400, '当前机型没有受控构型项，无法快照');

    const id = await insert(
      `INSERT INTO baselines (tenant_id, model, code, name, kind, status, created_by)
       VALUES (?,?,?,?,?, 'DRAFT', ?)`,
      [user.tenantId, model, code, name, kind, user.name],
    );

    // 快照条目一次性写入：记的是「写入当时」的版本，允许与 cis.rev 不同
    const stmts = cis.map((c) => ({
      sql: `INSERT INTO baseline_items (baseline_id, ci_pn, ci_rev, doc_no, doc_rev) VALUES (?,?,?,?,?)`,
      args: [id, c.pn, c.rev, c.doc_no, c.doc_rev],
    }));
    await db.batch(stmts, 'write');

    await logEvent(
      user.tenantId,
      user.name,
      'BASELINE_CREATE',
      'baseline',
      id,
      `${code} ${name}：快照 ${cis.length} 项受控构型项`,
    );

    return ok({ id, itemCount: cis.length }, 201);
  });
}
