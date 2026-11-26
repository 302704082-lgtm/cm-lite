import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getTemplates, listInstances } from '@/lib/flow';
import { listBaselines } from '@/lib/queries';
import { PageHeader } from '@/components/ui';
import FormsCenter from '@/components/forms-center';

export const dynamic = 'force-dynamic';

export default async function FormsPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  const [templates, instances, baselines] = await Promise.all([
    getTemplates(user.tenantId),
    listInstances(user.tenantId),
    listBaselines(user.tenantId),
  ]);

  return (
    <div>
      <PageHeader
        title="受控表单中心"
        desc="按制度办事：每一步一张单子，填完逐项检查、逐级签字，批准后才能进入下一步。每张单可单独打印归档。"
      />

      <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 text-[13px] leading-6 text-slate-700">
        <div className="mb-1 font-semibold text-indigo-800">一句话说明白</div>
        以前是「点一下就冻结 / 点一下就建变更 / 点一下就登记偏离」。现在这三件事前面各加了一道闸门：
        <b>先填一张申请单</b>（把要冻结的文件清单、变更原因与评审结论、偏离范围与补偿措施写清楚），
        <b>检查单逐项判定</b>，<b>几个岗位按顺序签完</b>，系统才允许继续。签过的单子会进证据包，也能单独打印。
      </div>

      <FormsCenter
        templates={templates.map((t) => ({
          code: t.code,
          name: t.name,
          scene: t.scene,
          status: t.status,
          note: t.note ?? '',
          requires_items: t.requires_items,
        }))}
        instances={instances.map((i) => ({
          id: i.id,
          code: i.code,
          title: i.title,
          scene: i.scene,
          status: i.status,
          created_by: i.created_by,
          created_at: i.created_at,
          template_name: i.template_name ?? '',
        }))}
        baselines={baselines.map((b) => ({ id: b.id, code: b.code, name: b.name, status: b.status }))}
      />
    </div>
  );
}
