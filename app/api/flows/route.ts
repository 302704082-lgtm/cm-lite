import { z } from 'zod';
import { q } from '@/lib/db';
import { handle, ok, requireUser, ApiError } from '@/lib/api';
import { logEvent } from '@/lib/events';
import {
  saveFlow,
  saveTemplate,
  setTemplateStatus,
  templateChecks,
  templateFields,
  templateSignoffs,
  type FlowStepInput,
  type FormTemplateRow,
} from '@/lib/flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 流程配置：全部场景（含停用步骤）、全部模板（含字段/检查项/签字位） */
export async function GET(): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const [steps, templates] = await Promise.all([
      q<Record<string, unknown>>(
        `SELECT scene, step_no, step_name, form_code, role_label, gate, enabled, note
           FROM flow_definitions WHERE tenant_id = ? ORDER BY scene, step_no`,
        [user.tenantId],
      ),
      q<FormTemplateRow>(
        `SELECT * FROM form_templates WHERE tenant_id = ? ORDER BY id`,
        [user.tenantId],
      ),
    ]);

    const scenes = Array.from(new Set(steps.map((s) => String(s.scene))));
    return ok({
      scenes,
      steps: steps.map((s) => ({
        scene: String(s.scene),
        step_no: Number(s.step_no),
        step_name: String(s.step_name ?? ''),
        form_code: String(s.form_code ?? ''),
        role_label: String(s.role_label ?? ''),
        gate: Number(s.gate ?? 0),
        enabled: Number(s.enabled ?? 1),
        note: String(s.note ?? ''),
      })),
      templates: templates.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        scene: t.scene,
        status: t.status,
        requires_items: t.requires_items,
        note: t.note ?? '',
        fields: templateFields(t),
        checks: templateChecks(t),
        signoffs: templateSignoffs(t),
      })),
    });
  });
}

const flowSchema = z.object({
  action: z.literal('save_flow'),
  scene: z.string().trim().min(1),
  steps: z.array(
    z.object({
      step_no: z.coerce.number().int(),
      step_name: z.string().trim().default(''),
      form_code: z.string().trim().default(''),
      role_label: z.string().trim().default(''),
      gate: z.coerce.number().int().default(0),
      enabled: z.coerce.number().int().default(1),
      note: z.string().trim().default(''),
    }),
  ),
});

const tplSchema = z.object({
  action: z.literal('save_template'),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  scene: z.string().trim().default(''),
  note: z.string().trim().default(''),
  requires_items: z.coerce.number().int().default(0),
  fields: z.array(
    z.object({
      key: z.string().trim().default(''),
      label: z.string().trim().default(''),
      kind: z.enum(['text', 'textarea', 'date', 'select']).default('text'),
      required: z.boolean().default(false),
      placeholder: z.string().trim().default(''),
      options: z.array(z.string()).optional(),
    }),
  ),
  checks: z.array(z.object({ key: z.string().trim().default(''), label: z.string().trim().default('') })),
  signoffs: z.array(
    z.object({
      step_no: z.coerce.number().int().default(0),
      step_name: z.string().trim().default(''),
      role_label: z.string().trim().default(''),
    }),
  ),
});

const toggleSchema = z.object({
  action: z.literal('toggle_template'),
  code: z.string().trim().min(1),
  status: z.enum(['ACTIVE', 'DRAFT']),
});

const sceneSchema = z.object({
  action: z.literal('add_scene'),
  scene: z.string().trim().min(1),
});

/** 编辑流程 / 模板 / 启用停用 —— 阶段二「自己能改规矩」的落点 */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const action = body?.action as string | undefined;

    if (action === 'save_flow') {
      const p = flowSchema.safeParse(body);
      if (!p.success) throw new ApiError(400, p.error.issues[0]?.message ?? '参数非法');
      await saveFlow(user.tenantId, p.data.scene, p.data.steps as FlowStepInput[]);
      await logEvent(user.tenantId, user.name, 'FLOW_SAVE', 'flow', p.data.scene, `保存流程「${p.data.scene}」共 ${p.data.steps.length} 步`);
      return ok({ ok: true, steps: p.data.steps.length });
    }

    if (action === 'save_template') {
      const p = tplSchema.safeParse(body);
      if (!p.success) throw new ApiError(400, p.error.issues[0]?.message ?? '参数非法');
      await saveTemplate(user.tenantId, p.data);
      await logEvent(user.tenantId, user.name, 'TEMPLATE_SAVE', 'template', p.data.code, `保存表单模板「${p.data.name}」`);
      return ok({ ok: true });
    }

    if (action === 'toggle_template') {
      const p = toggleSchema.safeParse(body);
      if (!p.success) throw new ApiError(400, p.error.issues[0]?.message ?? '参数非法');
      await setTemplateStatus(user.tenantId, p.data.code, p.data.status);
      await logEvent(user.tenantId, user.name, 'TEMPLATE_TOGGLE', 'template', p.data.code, `模板设为 ${p.data.status}`);
      return ok({ ok: true, status: p.data.status });
    }

    if (action === 'add_scene') {
      const p = sceneSchema.safeParse(body);
      if (!p.success) throw new ApiError(400, p.error.issues[0]?.message ?? '参数非法');
      await saveFlow(user.tenantId, p.data.scene, [
        { step_no: 1, step_name: '提交申请', form_code: '', role_label: '设计工程师', gate: 1, enabled: 1, note: '新建场景默认一步，可在下方继续加步骤' },
      ]);
      await logEvent(user.tenantId, user.name, 'FLOW_ADD_SCENE', 'flow', p.data.scene, `新增流程场景「${p.data.scene}」`);
      return ok({ ok: true });
    }

    throw new ApiError(400, '未知操作');
  });
}
