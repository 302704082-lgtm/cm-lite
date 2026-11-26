import { q1 } from '@/lib/db';
import { handle, requireUser, toId, ApiError } from '@/lib/api';
import {
  getInstance,
  getSignoffs,
  instanceChecks,
  instanceData,
  instanceItems,
  renderFormHtml,
  templateChecks,
  templateFields,
  templateSignoffs,
  type FormTemplateRow,
} from '@/lib/flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 表单详情。?format=html 时返回一张可单独打印 / 归档的受控表单 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const { id: rawId } = await ctx.params;
    const id = toId(rawId);

    const inst = await getInstance(user.tenantId, id);
    if (!inst) throw new ApiError(404, '表单不存在');
    const t = await q1<FormTemplateRow>(`SELECT * FROM form_templates WHERE id = ?`, [inst.template_id]);
    if (!t) throw new ApiError(500, '表单模板丢失');
    const signoffs = await getSignoffs(id);

    if (new URL(req.url).searchParams.get('format') === 'html') {
      const html = renderFormHtml(inst, t, signoffs);
      return new Response(`\uFEFF${html}`, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="${inst.code}.html"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return handleJson(inst, t, signoffs);
  });
}

function handleJson(
  inst: NonNullable<Awaited<ReturnType<typeof getInstance>>>,
  t: FormTemplateRow,
  signoffs: Awaited<ReturnType<typeof getSignoffs>>,
): Response {
  // 由 handle 包裹，这里只负责组装数据
  const fields = templateFields(t);
  const steps = templateSignoffs(t);
  const done = new Map(signoffs.map((s) => [s.step_no, s]));
  const nextStep = steps.find((s) => !done.has(Number(s.step_no))) ?? null;

  return Response.json({
    ok: true,
    instance: {
      id: inst.id,
      code: inst.code,
      title: inst.title,
      scene: inst.scene,
      status: inst.status,
      target_type: inst.target_type,
      target_id: inst.target_id,
      created_by: inst.created_by,
      created_at: inst.created_at,
      submitted_at: inst.submitted_at,
      closed_at: inst.closed_at,
      template_name: t.name,
      template_note: t.note ?? '',
    },
    fields,
    checks: instanceChecks(inst),
    checkDefs: templateChecks(t),
    items: instanceItems(inst),
    data: instanceData(inst),
    steps: steps.map((s) => ({
      ...s,
      signer_name: done.get(Number(s.step_no))?.signer_name ?? null,
      decision: done.get(Number(s.step_no))?.decision ?? null,
      comment: done.get(Number(s.step_no))?.comment ?? null,
      signed_at: done.get(Number(s.step_no))?.signed_at ?? null,
    })),
    nextStep: nextStep ? Number(nextStep.step_no) : null,
  });
}
