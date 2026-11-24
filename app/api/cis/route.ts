import { z } from 'zod';
import { q, q1, insert } from '@/lib/db';
import { ApiError, handle, ok, requireUser } from '@/lib/api';
import { CI_TYPES } from '@/lib/constants';
import { getEffectiveRules, buildPn } from '@/lib/profile';
import { logEvent } from '@/lib/events';
import type { Ci } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  model: z.string().trim().min(1, '请填写机型'),
  pn: z.string().trim().optional(), // 留空 = 按生效配置的件号规则自动生成
  name: z.string().trim().min(1, '请填写名称'),
  type: z.enum(CI_TYPES),
  parent_pn: z.string().trim().nullable().optional(),
  qty: z.coerce.number().int().min(1).default(1),
  rev: z.string().trim().optional(), // 留空 = 用配置里的初始版本格式
  status: z.enum(['DRAFT', 'CONTROLLED']).default('DRAFT'),
  criticality: z.enum(['NORMAL', 'KEY', 'IMPORTANT']).default('NORMAL'),
  owner: z.string().trim().min(1, '请填写责任人'),
  basis: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
});

/** 按生效配置算出下一个件号（跳过已占用的）。
 *  注意：Next.js 路由文件只允许导出 HTTP 方法，本函数刻意不导出。 */
async function suggestPn(tenantId: number, type: string, model: string): Promise<string> {
  const rules = await getEffectiveRules(tenantId);
  const existing = await q<{ pn: string }>(
    `SELECT pn FROM cis WHERE tenant_id = ?`,
    [tenantId],
  );
  const taken = new Set(existing.map((r) => String(r.pn)));
  for (let seq = 1; seq < 100000; seq++) {
    const candidate = buildPn(rules, type, seq);
    if (!taken.has(candidate)) return candidate;
  }
  void model;
  throw new ApiError(500, '件号流水已用尽');
}

/** GET：给表单预填一个建议件号 */
export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const type = url.searchParams.get('type') ?? 'HARDWARE';
    const pn = await suggestPn(user.tenantId, type, url.searchParams.get('model') ?? '');
    const rules = await getEffectiveRules(user.tenantId);
    return ok({ pn, rev: rules.ident.rev_format, rule: rules.name });
  });
}

/** 新建构型项。R1：(tenant_id, pn) 全库唯一，冲突返回 409 并指出冲突项 */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');
    const input = parsed.data;

    const rules = await getEffectiveRules(user.tenantId);
    const pn = input.pn?.trim() || (await suggestPn(user.tenantId, input.type, input.model));
    const rev = input.rev?.trim() || rules.ident.rev_format;

    const dup = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [
      user.tenantId,
      pn,
    ]);
    if (dup) {
      throw new ApiError(409, `件号 ${pn} 已存在：${dup.name}（当前版本 ${dup.rev}，状态 ${dup.status}）`, {
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
        pn,
        input.name,
        input.type,
        input.parent_pn || null,
        input.qty,
        rev,
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
      pn,
      `新建构型项 ${pn}（${input.name}），版本 ${rev}，状态 ${input.status}${input.pn?.trim() ? '' : '（件号按规则自动生成）'}`,
    );

    return ok({ id, pn, rev }, 201);
  });
}
