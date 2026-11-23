import Link from 'next/link';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getOverview } from '@/lib/queries';
import { ROLE_NAMES } from '@/lib/constants';
import { toCST } from '@/lib/format';
import { Card, Empty, PageHeader, Stat, Badge, Th, Td } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  const data = await getOverview(user);
  const redCount = data.expiredDeviations.length + data.mismatches.length;

  return (
    <div>
      <PageHeader
        title="总览"
        desc={`${user.tenantName} · ${user.name}（${ROLE_NAMES[user.role] ?? user.role}）`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="构型项" value={data.stats.ciCount} hint="不含已作废" />
        <Stat label="基线" value={data.stats.baselineCount} hint="含草稿与已冻结" />
        <Stat label="进行中变更" value={data.stats.runningChanges} hint="未执行完毕的 CR" />
        <Stat
          label="红线预警"
          value={<span className={redCount > 0 ? 'text-rose-600' : ''}>{redCount}</span>}
          hint="过期偏离 + 文实不符"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">待我签署</div>
              <div className="text-[11px] text-slate-400">按当前角色匹配，且你未在本单签过任何步骤</div>
            </div>
            <Badge tone={data.todo.length > 0 ? 'amber' : 'gray'}>{data.todo.length} 单</Badge>
          </div>
          <div className="p-2">
            {data.todo.length === 0 ? (
              <Empty>当前角色没有待签单据</Empty>
            ) : (
              <table className="w-full">
                <tbody>
                  {data.todo.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <Td className="w-28 font-mono text-xs">{t.code}</Td>
                      <Td>
                        <Link href={`/app/changes/${t.id}`} className="text-slate-800 hover:text-indigo-600">
                          {t.title}
                        </Link>
                      </Td>
                      <Td className="w-40 text-xs text-slate-500">
                        第 {t.step_no} 步 · {t.step_name}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">红线预警</div>
              <div className="text-[11px] text-slate-400">① 偏离过期　② 装机版本 ≠ 最新冻结基线</div>
            </div>
            <Badge tone={redCount > 0 ? 'red' : 'green'}>{redCount > 0 ? '需处理' : '正常'}</Badge>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">
                ① 偏离/让步已过期（{data.expiredDeviations.length}）
              </div>
              {data.expiredDeviations.length === 0 ? (
                <div className="text-xs text-slate-400">无</div>
              ) : (
                <ul className="space-y-1">
                  {data.expiredDeviations.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700"
                    >
                      <span>
                        {d.kind === 'DEVIATION' ? '偏离' : '让步'} · {d.ci_pn}
                        {d.unit_sn ? ` · ${d.unit_sn}` : ''}
                      </span>
                      <span className="tnum">有效期至 {toCST(d.expire_at).slice(0, 10)}（已过期）</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">
                ② 文实不符（{data.mismatches.length}）
              </div>
              {data.mismatches.length === 0 ? (
                <div className="text-xs text-slate-400">实物台账与基线一致</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th className="w-24">整机</Th>
                      <Th>件号</Th>
                      <Th className="w-20">装机</Th>
                      <Th className="w-20">基线</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mismatches.map((m, i) => (
                      <tr key={`${m.sn}-${m.ci_pn}-${i}`}>
                        <Td className="font-mono text-xs">{m.sn}</Td>
                        <Td className="font-mono text-xs">{m.ci_pn}</Td>
                        <Td className="font-mono text-xs">{m.installed}</Td>
                        <Td className="font-mono text-xs text-rose-600">{m.baseline_rev}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="text-sm font-semibold text-slate-800">演示主线</div>
        <ol className="mt-2 grid gap-1.5 text-xs leading-5 text-slate-600 sm:grid-cols-2">
          <li>1. 结构树里新建一个 CI（置受控），顺手演示重复件号被拦</li>
          <li>2. 基线页建 D2 快照并冻结</li>
          <li>3. 变更页提一张 III 类变更，两步签完即可执行闭环</li>
          <li>4. 打开 I 类的 CR-2026-002：登录张设计点第 5 步 → 被职责分离拦下</li>
          <li>5. 陈适航签完剩余步骤 → 执行确认 → 关闭</li>
          <li>6. 基线详情做 D1 vs D2 diff，再到纪实台账导出《构型状态一览表》</li>
        </ol>
      </Card>
    </div>
  );
}
