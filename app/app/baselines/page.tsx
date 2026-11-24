import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listBaselines, listModels } from '@/lib/queries';
import { getEffectiveRules, baselineSlotToLabel } from '@/lib/profile';
import { toCST } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Td, Th } from '@/components/ui';
import NewBaselineForm from '@/components/new-baseline-form';
import FreezeButton from '@/components/freeze-button';

export const dynamic = 'force-dynamic';

export default async function BaselinesPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  const models = await listModels(user.tenantId);
  const model = models[0] ?? 'EX-01';
  const [baselines, rules] = await Promise.all([
    listBaselines(user.tenantId, model),
    getEffectiveRules(user.tenantId),
  ]);

  return (
    <div>
      <PageHeader
        title="基线"
        desc={`机型 ${model} · 基线是「经过验证的照片」，冻结后只能走变更`}
      />

      <div className="mb-5">
        <NewBaselineForm model={model} baselineKinds={rules.baselines} />
      </div>

      <Card padded={false}>
        {baselines.length === 0 ? (
          <div className="p-5">
            <Empty>还没有基线</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <Th className="w-20">编号</Th>
                  <Th>名称</Th>
                  <Th className="w-28">类型</Th>
                  <Th className="w-20">条目</Th>
                  <Th className="w-24">状态</Th>
                  <Th className="w-40">冻结时间</Th>
                  <Th className="w-24">操作</Th>
                </tr>
              </thead>
              <tbody>
                {baselines.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-xs">
                      <Link href={`/app/baselines/${b.id}`} className="text-indigo-600 hover:text-indigo-800">
                        {b.code}
                      </Link>
                    </Td>
                    <Td className="text-slate-800">{b.name}</Td>
                    <Td className="text-xs text-slate-500">{baselineSlotToLabel(rules, b.kind)}</Td>
                    <Td className="tnum text-xs">{b.item_count ?? 0}</Td>
                    <Td>
                      <Badge tone={b.status === 'FROZEN' ? 'green' : 'amber'}>
                        {b.status === 'FROZEN' ? '已冻结' : '草稿'}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">{toCST(b.frozen_at)}</Td>
                    <Td>
                      <FreezeButton id={b.id} code={b.code} disabled={b.status === 'FROZEN'} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
