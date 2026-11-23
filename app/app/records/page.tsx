import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listBaselines, listEvents, listFittings, listUnits } from '@/lib/queries';
import { toCST } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Td, Th } from '@/components/ui';
import ExportPanel from '@/components/export-panel';

export const dynamic = 'force-dynamic';

export default async function RecordsPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  const [events, units, fittings, baselines] = await Promise.all([
    listEvents(user.tenantId, 200),
    listUnits(user.tenantId),
    listFittings(user.tenantId),
    listBaselines(user.tenantId),
  ]);

  const byUnit = new Map<number, typeof fittings>();
  for (const f of fittings) {
    byUnit.set(f.unit_id, [...(byUnit.get(f.unit_id) ?? []), f]);
  }

  return (
    <div>
      <PageHeader
        title="纪实台账"
        desc="事件日志只追加：页面没有任何编辑按钮，数据库触发器直接拒绝 UPDATE / DELETE"
      />

      <Card className="mb-5">
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-800">导出《构型状态一览表》</div>
          <div className="text-[11px] text-slate-400">
            件号 / 名称 / 版本 / 文件号 / 文件版 / 状态，按基线快照导出，可直接给审查方看
          </div>
        </div>
        <ExportPanel
          baselines={baselines.map((b) => ({
            id: b.id,
            code: b.code,
            name: b.name,
            model: b.model,
            items: b.item_count,
          }))}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card padded={false} className="lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="text-sm font-semibold text-slate-800">事件时间线</div>
            <Badge tone="gray">只读 · 最近 {events.length} 条</Badge>
          </div>
          <div className="max-h-[560px] overflow-auto">
            {events.length === 0 ? (
              <div className="p-5">
                <Empty>还没有事件</Empty>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr>
                    <Th className="w-32">时间（+08:00）</Th>
                    <Th className="w-20">操作人</Th>
                    <Th>动作 / 详情</Th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <Td className="tnum text-[11px] text-slate-500">{toCST(e.created_at)}</Td>
                      <Td className="text-xs text-slate-700">{e.actor}</Td>
                      <Td>
                        <div className="text-[11px] font-mono text-indigo-600">{e.action}</div>
                        <div className="text-xs leading-5 text-slate-600">{e.detail ?? '—'}</div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card padded={false} className="lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
            实物台账（序列号级）
          </div>
          <div className="space-y-4 p-4">
            {units.length === 0 ? (
              <Empty>还没有实物记录</Empty>
            ) : (
              units.map((u) => (
                <div key={u.id} className="rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                    <div className="font-mono text-xs text-slate-800">{u.sn}</div>
                    <div className="text-[11px] text-slate-400">下线 {toCST(u.produced_at).slice(0, 10)}</div>
                  </div>
                  <table className="w-full">
                    <tbody>
                      {(byUnit.get(u.id) ?? []).map((f) => (
                        <tr key={`${f.unit_id}-${f.ci_pn}`}>
                          <Td className="font-mono text-[11px] text-slate-500">{f.ci_pn}</Td>
                          <Td className="w-16 font-mono text-[11px]">{f.ci_rev}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        验证防篡改：在 Turso 控制台对该库执行 <code className="font-mono">UPDATE events SET action=&apos;x&apos; WHERE id=1;</code>{' '}
        → 直接被触发器拒绝（events are append-only）。
      </p>
    </div>
  );
}
