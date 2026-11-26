import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { q } from '@/lib/db';
import {
  templateChecks,
  templateFields,
  templateSignoffs,
  type FormTemplateRow,
} from '@/lib/flow';
import { PageHeader } from '@/components/ui';
import FlowsEditor from '@/components/flows-editor';

export const dynamic = 'force-dynamic';

export default async function FlowsPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  const [stepRows, templates] = await Promise.all([
    q<Record<string, unknown>>(
      `SELECT scene, step_no, step_name, form_code, role_label, gate, enabled, note
         FROM flow_definitions WHERE tenant_id = ? ORDER BY scene, step_no`,
      [user.tenantId],
    ),
    q<FormTemplateRow>(`SELECT * FROM form_templates WHERE tenant_id = ? ORDER BY id`, [user.tenantId]),
  ]);

  const steps = stepRows.map((s) => ({
    scene: String(s.scene),
    step_no: Number(s.step_no),
    step_name: String(s.step_name ?? ''),
    form_code: String(s.form_code ?? ''),
    role_label: String(s.role_label ?? ''),
    gate: Number(s.gate ?? 0),
    enabled: Number(s.enabled ?? 1),
    note: String(s.note ?? ''),
  }));
  const scenes = Array.from(new Set(steps.map((s) => s.scene)));

  return (
    <div>
      <PageHeader
        title="流程配置"
        desc="一共走几步、每步出哪张表、谁签字、哪些是闸门——都在这里改，改完立即生效，不用改代码、不用重新上线。"
      />
      <div className="mb-5 rounded-xl border border-amber-100 bg-amber-50/60 px-5 py-4 text-[13px] leading-6 text-slate-700">
        <div className="mb-1 font-semibold text-amber-800">这是什么（大白话）</div>
        「第一层规则配置」管的是<b>内容口径</b>（改分几类、件号怎么编、要交几份材料）。
        这一页管的是<b>办事步骤</b>：先走哪一步、每步填哪张单子、谁签字、哪一步没过就不许往下走。
        两张表配合起来，就是把纸面制度整套搬进系统。停用一张表单模板，它对应的闸门会自动失效，回到旧行为。
      </div>
      <FlowsEditor
        initialScenes={scenes}
        initialSteps={steps}
        initialTemplates={templates.map((t) => ({
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
        }))}
      />
    </div>
  );
}
