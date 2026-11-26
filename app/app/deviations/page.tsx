import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listCis, listDeviations, listModels } from '@/lib/queries';
import { DEVIATION_KIND_NAMES } from '@/lib/constants';
import { isExpired, toCST } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Td, Th } from '@/components/ui';
import NewDeviationForm from '@/components/new-deviation-form';
import GatePanel from '@/components/gate-panel';
import { gateEnabled, listInstances } from '@/lib/flow';

export const dynamic = 'force-dynamic';

export default async function DeviationsPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  const models = await listModels(user.tenantId);
  const model = models[0] ?? 'EX-01';
  const [items, cis, requestForms, gateOn] = await Promise.all([
    listDeviations(user.tenantId),
    listCis(user.tenantId, model),
    listInstances(user.tenantId, { scene: 'DEVIATION' }),
    gateEnabled(user.tenantId, 'DEVIATION'),
  ]);
  const approved = requestForms
    .filter((f) => f.status === 'APPROVED')
    .map((f) => ({ id: f.id, code: f.code, title: f.title }));

  return (
    <div>
      <PageHeader
        title="偏离 / 让步"
        desc="偏离＝投产前不改文件、限批次；让步＝制造中带缺陷放行、仅本批。数量上限与有效期必填（R8）"
      />

      <GatePanel
        scene="DEVIATION"
        title="偏离 / 让步申请单（登记生效前必办）"
        desc="偏离与让步不是记一笔就完事：先提交申请单，写清类型、涉及构型项、适用范围与数量、有效期、补偿措施，检查「是否影响适航符合性」，再经提出申请 → 适航审查 → 批准三级签署。批准后才允许登记生效。"
        instances={requestForms.map((f) => ({ id: f.id, code: f.code, title: f.title, status: f.status }))}
        enabled={gateOn}
      />

      <div className="mb-5">
        <NewDeviationForm
          cis={cis.map((c) => ({ pn: c.pn, name: c.name }))}
          approvedForms={approved}
          gateRequired={gateOn}
        />
      </div>

      <Card padded={false}>
        {items.length === 0 ? (
          <div className="p-5">
            <Empty>还没有偏离或让步单据</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead>
                <tr>
                  <Th className="w-20">类型</Th>
                  <Th className="w-32">构型项</Th>
                  <Th className="w-28">整机</Th>
                  <Th>原因与处置</Th>
                  <Th className="w-20">数量上限</Th>
                  <Th className="w-32">有效期</Th>
                  <Th className="w-24">状态</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => {
                  const expired = isExpired(d.expire_at);
                  return (
                    <tr key={d.id} className={expired ? 'bg-rose-50/60' : 'hover:bg-slate-50'}>
                      <Td className="text-xs">
                        <Badge tone={d.kind === 'DEVIATION' ? 'blue' : 'amber'}>
                          {DEVIATION_KIND_NAMES[d.kind] ?? d.kind}
                        </Badge>
                      </Td>
                      <Td className="font-mono text-xs">{d.ci_pn}</Td>
                      <Td className="font-mono text-xs text-slate-500">{d.unit_sn ?? '—'}</Td>
                      <Td className="text-xs text-slate-700">{d.reason}</Td>
                      <Td className="tnum text-xs">{d.qty_limit}</Td>
                      <Td className={`tnum text-xs ${expired ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
                        {toCST(d.expire_at).slice(0, 10)}
                        {expired ? '（已过期）' : ''}
                      </Td>
                      <Td className="text-xs">
                        <Badge tone={expired ? 'red' : 'green'}>{expired ? '已过期' : '有效'}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
