import { z } from 'zod';
import { q } from '@/lib/db';
import { handle, ok, requireUser, ApiError } from '@/lib/api';
import {
  createInstance,
  getTemplates,
  listInstances,
  templateChecks,
  templateFields,
  templateSignoffs,
  type FormItem,
} from '@/lib/flow';
import { logEvent } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  templateCode: z.string().trim().min(1),
  targetType: z.string().trim().default(''),
  targetId: z.coerce.number().int().default(0),
  title: z.string().trim().optional(),
  data: z.record(z.string(), z.string()).optional(),
  autoItems: z.boolean().optional(),
});

/** 表单中心：列出模板与已有单据 */
export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const scene = url.searchParams.get('scene') || undefined;
    const targetType = url.searchParams.get('targetType') || undefined;
    const rawTargetId = url.searchParams.get('targetId');
    const targetId = rawTargetId && Number.isInteger(Number(rawTargetId)) ? Number(rawTargetId) : undefined;

    const [templates, instances] = await Promise.all([
      getTemplates(user.tenantId),
      listInstances(user.tenantId, { scene, targetType, targetId }),
    ]);

    return ok({
      templates: templates.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        scene: t.scene,
        status: t.status,
        requires_items: t.requires_items,
        note: t.note ?? '',
        fieldCount: templateFields(t).length,
        checkCount: templateChecks(t).length,
        signoffCount: templateSignoffs(t).length,
      })),
      instances: instances.map((i) => ({
        id: i.id,
        code: i.code,
        title: i.title,
        scene: i.scene,
        status: i.status,
        target_type: i.target_type,
        target_id: i.target_id,
        created_by: i.created_by,
        created_at: i.created_at,
        template_name: i.template_name ?? '',
      })),
    });
  });
}

/** 从基线快照自动带出「要冻结的全部文件及版本」清单 */
async function baselineItems(tenantId: number, baselineId: number): Promise<FormItem[]> {
  const rows = await q<Record<string, unknown>>(
    `SELECT bi.ci_pn, bi.ci_rev, c.name AS ci_name, bi.doc_no, bi.doc_rev
       FROM baseline_items bi LEFT JOIN cis c ON c.pn = bi.ci_pn
      WHERE bi.baseline_id = ? ORDER BY bi.ci_pn`,
    [baselineId],
  );
  return rows.map((r) => ({
    key: String(r.ci_pn ?? ''),
    label: String(r.ci_name ?? r.ci_pn ?? ''),
    value: `版本 ${String(r.ci_rev ?? '')} / 文件 ${String(r.doc_no ?? '—')} ${String(r.doc_rev ?? '')}`.trim(),
  }));
}

/** 新建一张受控表单（不自动提交，需填完、提交、逐级签署才批准） */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');
    const input = parsed.data;

    let items: FormItem[] | undefined;
    if (input.autoItems && input.targetType === 'baseline' && input.targetId > 0) {
      items = await baselineItems(user.tenantId, input.targetId);
      if (items.length === 0) throw new ApiError(400, '该基线没有条目，无法生成冻结清单');
    }

    const inst = await createInstance(user, {
      templateCode: input.templateCode,
      targetType: input.targetType,
      targetId: input.targetId,
      title: input.title,
      data: input.data,
      items,
    });

    await logEvent(
      user.tenantId,
      user.name,
      'FORM_NEW',
      'form',
      inst.id,
      `在表单中心新建「${inst.title}」${inst.code}${items ? `，自动带出 ${items.length} 项冻结清单` : ''}`,
    );

    return ok({ id: inst.id, code: inst.code, status: inst.status }, 201);
  });
}
