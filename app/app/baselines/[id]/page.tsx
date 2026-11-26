import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { diffBaselines, getBaseline, listBaselineItems, listBaselines } from '@/lib/queries';
import { getEffectiveRules, baselineSlotToLabel } from '@/lib/profile';
import { CI_STATUS_NAMES } from '@/lib/constants';
import { toCST } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Td, Th, btnPrimary } from '@/components/ui';
import FreezeButton from '@/components/freeze-button';
import GatePanel from '@/components/gate-panel';
import { gateEnabled, listInstances } from '@/lib/flow';

export const dynamic = 'force-dynamic';

export default async function BaselineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ to?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const bl = await getBaseline(user.tenantId, id);
  if (!bl) notFound();

  const items = await listBaselineItems(id);
  const others = (await listBaselines(user.tenantId, bl.model)).filter((b) => b.id !== bl.id);
  const rules = await getEffectiveRules(user.tenantId);
  const [releaseForms, gateOn] = await Promise.all([
    listInstances(user.tenantId, { scene: 'BASELINE_RELEASE', targetType: 'baseline', targetId: id }),
    gateEnabled(user.tenantId, 'BASELINE_RELEASE'),
  ]);

  const { to } = await searchParams;
  const toId = to ? Number(to) : null;
  const target = toId ? others.find((b) => b.id === toId) ?? null : null;
  const diff = target ? await diffBaselines(bl.id, target.id) : null;

  return (
    <div>
      <PageHeader
        title={`${bl.code} · ${bl.name}`}
        desc={`${bl.model} · ${baselineSlotToLabel(rules, bl.kind)} · ${items.length} 项 · 创建人 ${bl.created_by}`}
        actions={
          <Link href="/app/baselines" className="text-sm text-slate-500 hover:text-slate-700">
            ← 返回基线列表
          </Link>
        }
      />

      <GatePanel
        scene="BASELINE_RELEASE"
        title="基线发布申请单（冻结前必办）"
        desc="冻结不是点一下就完成：先出一张申请单，把这份基线里要冻结的全部构型项及版本逐条列出来，检查单逐项判定（含问题报告 / 偏离许可状态），再由申请人、审核人、批准人按顺序签完。三签齐备后，「冻结」按钮才会放行。"
        instances={releaseForms.map((f) => ({
          id: f.id,
          code: f.code,
          title: f.title,
          status: f.status,
        }))}
        targetType="baseline"
        targetId={bl.id}
        autoItems
        enabled={gateOn}
      />

      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm">
        <Badge tone={bl.status === 'FROZEN' ? 'green' : 'amber'}>
          {bl.status === 'FROZEN' ? '已冻结' : '草稿'}
        </Badge>
        <span className="text-xs text-slate-500">创建 {toCST(bl.created_at)}</span>
        <span className="text-xs text-slate-500">冻结 {toCST(bl.frozen_at)}</span>
        <span className="flex-1" />
        <FreezeButton id={bl.id} code={bl.code} disabled={bl.status === 'FROZEN'} gateRequired={gateOn} />
      </div>

      <Card padded={false} className="mb-5">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">基线条目</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <Th>件号</Th>
                <Th>名称</Th>
                <Th className="w-20">基线版本</Th>
                <Th className="w-32">文件号</Th>
                <Th className="w-16">文件版</Th>
                <Th className="w-20">当前状态</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">
                    <Link
                      href={`/app/structure/${encodeURIComponent(it.ci_pn)}`}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      {it.ci_pn}
                    </Link>
                  </Td>
                  <Td className="text-xs">{it.ci_name ?? '—'}</Td>
                  <Td className="font-mono text-xs">{it.ci_rev}</Td>
                  <Td className="font-mono text-xs text-slate-500">{it.doc_no ?? '—'}</Td>
                  <Td className="font-mono text-xs text-slate-500">{it.doc_rev ?? '—'}</Td>
                  <Td className="text-xs text-slate-500">
                    {CI_STATUS_NAMES[it.ci_status ?? ''] ?? it.ci_status ?? '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">基线对比</div>
            <div className="text-[11px] text-slate-400">以 {bl.code} 为基准，选择另一个基线做 diff</div>
          </div>
          <form action={`/app/baselines/${bl.id}`} method="get" className="flex items-center gap-2">
            <select
              name="to"
              defaultValue={to ?? ''}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">选择对比基线</option>
              {others.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
            <button type="submit" className={btnPrimary}>
              对比
            </button>
          </form>
        </div>

        {!diff ? (
          <Empty>选择另一个基线后显示新增 / 删除 / 升版三区</Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span>新增区</span>
                <span className="tnum">{diff.added.length}</span>
              </div>
              {diff.added.length === 0 ? (
                <div className="text-xs text-slate-400">无</div>
              ) : (
                <ul className="space-y-1">
                  {diff.added.map((i) => (
                    <li key={i.id} className="rounded bg-white px-2 py-1 text-xs">
                      <span className="font-mono text-slate-500">{i.ci_pn}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-slate-700">{i.ci_name ?? '—'}</span>
                      <span className="ml-1.5 font-mono text-emerald-700">{i.ci_rev}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-sky-800">
                <span>升版区</span>
                <span className="tnum">{diff.changed.length}</span>
              </div>
              {diff.changed.length === 0 ? (
                <div className="text-xs text-slate-400">无</div>
              ) : (
                <ul className="space-y-1">
                  {diff.changed.map((c) => (
                    <li key={c.ci_pn} className="rounded bg-white px-2 py-1 text-xs">
                      <span className="font-mono text-slate-500">{c.ci_pn}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-slate-700">{c.ci_name ?? '—'}</span>
                      <span className="ml-1.5 font-mono">
                        {c.from_rev} <span className="text-slate-400">→</span>{' '}
                        <span className="text-sky-700">{c.to_rev}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-rose-800">
                <span>删除区</span>
                <span className="tnum">{diff.removed.length}</span>
              </div>
              {diff.removed.length === 0 ? (
                <div className="text-xs text-slate-400">无</div>
              ) : (
                <ul className="space-y-1">
                  {diff.removed.map((i) => (
                    <li key={i.id} className="rounded bg-white px-2 py-1 text-xs">
                      <span className="font-mono text-slate-500">{i.ci_pn}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-slate-700">{i.ci_name ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
