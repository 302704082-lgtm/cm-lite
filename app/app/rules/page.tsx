import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { q, q1 } from '@/lib/db';
import { Badge, Card, PageHeader } from '@/components/ui';
import RulesForm from '@/components/rules-form';
import type { ProfileStep } from '@/lib/rule-config';

export const dynamic = 'force-dynamic';

const LAYERS = [
  {
    no: '空白',
    title: '一个格子都没填',
    desc: '系统不知道件号怎么编、改分几类、谁签。现在点试跑，它会明确告诉你缺什么。',
    tag: '你现在在这',
    tone: 'gray' as const,
  },
  {
    no: '第一层 · 表单',
    title: '填「是什么」',
    desc: '件号分几段、改分几类、每类几步、谁能签、要交哪些材料。',
    tag: '本轮开放 · 你自己填',
    tone: 'green' as const,
  },
  {
    no: '第二层 · 条件规则',
    title: '填「如果…就…」',
    desc: '关键件自动升大改、外形变了强制换号、装机版本对不上就预警。',
    tag: '本轮只列清单',
    tone: 'blue' as const,
  },
  {
    no: '第三层 · 扩展点',
    title: '插在预留位置的特殊能力',
    desc: '接企微审批、导入旧台账、自定义件号校验算法。极少用，不动主程序。',
    tag: '以后再说',
    tone: 'gray' as const,
  },
];

export default async function RulesPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  const p = await q1<{ id: number; status: string; name: string }>(
    'SELECT id, status, name FROM rule_profiles WHERE tenant_id = ? ORDER BY id DESC LIMIT 1',
    [user.tenantId],
  );
  let values: Record<string, string> = {};
  let steps: ProfileStep[] = [];
  if (p) {
    const settings = await q<{ field_key: string; field_value: string }>(
      'SELECT field_key, field_value FROM profile_settings WHERE profile_id = ?',
      [p.id],
    );
    for (const s of settings) values[s.field_key] = s.field_value;
    steps = await q<ProfileStep>(
      'SELECT class_code, step_no, step_name, role_code FROM profile_steps WHERE profile_id = ? ORDER BY class_code, step_no',
      [p.id],
    );
  }
  const blank = !p || Object.values(values).every((v) => !v);

  return (
    <div>
      <PageHeader
        title="规则配置 · 第一层（空白）"
        desc="把制度填成一张表。这一轮只开放第一层，填完自己点「试跑」看能不能跑成能用的。"
        actions={<Badge tone={blank ? 'gray' : 'green'}>{blank ? '当前：空白' : '当前：草稿'}</Badge>}
      />

      <Card className="mb-5">
        <div className="mb-3 text-sm font-semibold text-slate-800">空白 + 三层，分别是什么</div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {LAYERS.map((l) => (
            <div key={l.no} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">{l.no}</span>
                <Badge tone={l.tone}>{l.tag}</Badge>
              </div>
              <div className="text-xs font-medium text-slate-700">{l.title}</div>
              <div className="mt-1 text-[11px] leading-5 text-slate-500">{l.desc}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-400">
          一句话区分：<span className="font-medium text-slate-600">第一层填「是什么」，第二层填「如果…就…」，第三层才动程序</span>。
          绝大多数调整停在第一层；这一轮先让你亲手把第一层从空白填成一套能跑的规矩。
        </p>
      </Card>

      <RulesForm initialValues={values} initialSteps={steps} initialBlank={blank} />
    </div>
  );
}
