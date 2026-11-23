import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { childChanges, getChange, listApprovals } from '@/lib/queries';
import {
  CHANGE_KIND_NAMES,
  CHANGE_STATUS_NAMES,
  IMPACT_ITEMS,
  ROLE_NAMES,
  type ImpactKey,
  type RoleCode,
} from '@/lib/constants';
import { toCST } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Td, Th } from '@/components/ui';
import { CloseButton, ExecutePanel, SignPanel, ToCrButton } from '@/components/change-actions';

export const dynamic = 'force-dynamic';

const IMPACT_LABEL: Record<string, string> = { YES: '有', NO: '无', TBD: '待定' };

function statusTone(s: string): 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'indigo' {
  if (s === 'CLOSED') return 'green';
  if (s === 'REJECTED') return 'red';
  if (s === 'OPEN') return 'amber';
  if (s === 'APPROVED') return 'indigo';
  if (s === 'EXECUTED') return 'blue';
  return 'gray';
}

export default async function ChangeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const change = await getChange(user.tenantId, id);
  if (!change) notFound();

  const approvals = change.kind === 'CR' ? await listApprovals(change.id) : [];
  const children = await childChanges(change.id);
  const parent = change.parent_id ? await getChange(user.tenantId, change.parent_id) : null;
  const pending = approvals.find((a) => a.signed_at === null) ?? null;

  let impact: Partial<Record<ImpactKey, string>> = {};
  if (change.impact_json) {
    try {
      impact = JSON.parse(change.impact_json) as Partial<Record<ImpactKey, string>>;
    } catch {
      impact = {};
    }
  }

  const facts: [string, React.ReactNode][] = [
    ['单号', <span key="c" className="font-mono text-xs">{change.code}</span>],
    ['类型', CHANGE_KIND_NAMES[change.kind] ?? change.kind],
    ['状态', <Badge key="s" tone={statusTone(change.status)}>{CHANGE_STATUS_NAMES[change.status] ?? change.status}</Badge>],
    ['机型', change.model],
    ['变更对象', change.ci_pn ? <span key="ci" className="font-mono text-xs">{change.ci_pn}</span> : '—'],
    ['版本', `${change.from_rev ?? '—'} → ${change.to_rev ?? '（换号）'}`],
    ['新件号', change.new_pn ? <span key="np" className="font-mono text-xs">{change.new_pn}</span> : '—'],
    ['类别', change.class_result ? `${change.class_result} 类` : '—（PR 未定级）'],
    ['改级理由', change.class_reason || '—'],
    ['提出人', change.created_by],
    ['提出时间', toCST(change.created_at)],
    ['关闭时间', toCST(change.closed_at)],
  ];

  return (
    <div>
      <PageHeader
        title={`${change.code} · ${change.title}`}
        desc={`${CHANGE_KIND_NAMES[change.kind]} · ${CHANGE_STATUS_NAMES[change.status] ?? change.status}`}
        actions={
          <Link href="/app/changes" className="text-sm text-slate-500 hover:text-slate-700">
            ← 返回列表
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card padded={false}>
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">单据信息</div>
            <table className="w-full">
              <tbody>
                {facts.map(([k, v]) => (
                  <tr key={k}>
                    <Td className="w-28 bg-slate-50 text-xs text-slate-500">{k}</Td>
                    <Td className="text-xs">{v}</Td>
                  </tr>
                ))}
                <tr>
                  <Td className="w-28 bg-slate-50 align-top text-xs text-slate-500">变更原因</Td>
                  <Td className="whitespace-pre-wrap text-xs">{change.reason || '—'}</Td>
                </tr>
              </tbody>
            </table>
          </Card>

          {change.kind === 'CR' ? (
            <Card padded={false}>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <div className="text-sm font-semibold text-slate-800">3F 与影响分析</div>
                <span className="text-[11px] text-slate-400">影响分析 9 项逐项必选（R6）</span>
              </div>
              <div className="p-5">
                <div className="mb-4 flex flex-wrap gap-2 text-xs">
                  {[
                    ['Fit 配合', change.f_fit],
                    ['Form 外形', change.f_form],
                    ['Function 功能', change.f_function],
                  ].map(([label, hit]) => (
                    <span
                      key={String(label)}
                      className={`rounded-md px-2 py-1 ring-1 ring-inset ${
                        hit
                          ? 'bg-amber-50 text-amber-800 ring-amber-200'
                          : 'bg-slate-50 text-slate-400 ring-slate-200'
                      }`}
                    >
                      {String(label)}：{hit ? '命中' : '未命中'}
                    </span>
                  ))}
                </div>

                <div className="grid gap-1.5 sm:grid-cols-3">
                  {IMPACT_ITEMS.map((it) => {
                    const v = impact[it.key];
                    return (
                      <div
                        key={it.key}
                        className="flex items-center justify-between rounded-md border border-slate-200 px-2.5 py-1.5 text-xs"
                      >
                        <span className="text-slate-600">{it.label}</span>
                        <span
                          className={
                            v === 'YES'
                              ? 'font-medium text-rose-600'
                              : v === 'TBD'
                                ? 'font-medium text-amber-600'
                                : 'text-slate-500'
                          }
                        >
                          {v ? IMPACT_LABEL[v] : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {change.wip_action ? (
                  <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    在制品处理意见：{change.wip_action}
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {parent ? (
            <Card>
              <div className="text-xs text-slate-500">
                父单：
                <Link href={`/app/changes/${parent.id}`} className="ml-1 font-mono text-indigo-600">
                  {parent.code}
                </Link>
                <span className="ml-2">{parent.title}</span>
              </div>
            </Card>
          ) : null}

          {children.length > 0 ? (
            <Card>
              <div className="mb-2 text-xs font-medium text-slate-500">关联单据</div>
              <ul className="space-y-1">
                {children.map((c) => (
                  <li key={c.id} className="text-xs">
                    <Link href={`/app/changes/${c.id}`} className="font-mono text-indigo-600">
                      {c.code}
                    </Link>
                    <span className="ml-2 text-slate-500">
                      {CHANGE_KIND_NAMES[c.kind]} · {CHANGE_STATUS_NAMES[c.status] ?? c.status}
                      {c.kind === 'CN' ? ` · ${c.verified ? '验证通过' : '未验证'}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5 lg:col-span-2">
          {change.kind === 'CR' ? (
            <Card padded={false}>
              <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">审批链</div>
              <div className="p-4">
                {approvals.length === 0 ? (
                  <Empty>无审批链</Empty>
                ) : (
                  <ol className="space-y-2">
                    {approvals.map((a) => {
                      const signed = a.signed_at !== null;
                      const isPending = pending?.step_no === a.step_no;
                      return (
                        <li
                          key={a.id}
                          className={`rounded-lg border px-3 py-2 ${
                            signed
                              ? a.decision === 'REJECT'
                                ? 'border-rose-200 bg-rose-50/60'
                                : 'border-emerald-200 bg-emerald-50/50'
                              : isPending
                                ? 'border-indigo-300 bg-indigo-50/60'
                                : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="font-medium text-slate-800">
                              {a.step_no}. {a.step_name}
                            </div>
                            <span className="text-[11px] text-slate-500">
                              {signed ? (a.decision === 'APPROVE' ? '已同意' : '已驳回') : isPending ? '待签' : '未轮到'}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                            <span>{ROLE_NAMES[a.role_code as RoleCode] ?? a.role_code}</span>
                            <span className="tnum">
                              {signed ? `${a.signer_name ?? ''} · ${toCST(a.signed_at)}` : '—'}
                            </span>
                          </div>
                          {a.comment ? (
                            <div className="mt-1 text-[11px] text-slate-500">意见：{a.comment}</div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </Card>
          ) : null}

          {change.kind === 'PR' && change.status === 'OPEN' ? (
            <Card>
              <div className="mb-2 text-sm font-semibold text-slate-800">下一步</div>
              <p className="mb-3 text-xs leading-5 text-slate-500">
                PR 只是「想改」，必须转成 CR 才会定级并生成审批链。拟制步由创建人自动签署，需具备设计工程师角色。
              </p>
              <ToCrButton prId={change.id} />
            </Card>
          ) : null}

          {change.kind === 'CR' && change.status === 'OPEN' && pending ? (
            <SignPanel
              changeId={change.id}
              stepNo={pending.step_no}
              stepName={pending.step_name}
              roleLabel={ROLE_NAMES[pending.role_code as RoleCode] ?? pending.role_code}
              myRoleLabel={ROLE_NAMES[user.role] ?? user.role}
            />
          ) : null}

          {change.kind === 'CR' && change.status === 'APPROVED' ? (
            <ExecutePanel changeId={change.id} />
          ) : null}

          {change.kind === 'CR' && change.status === 'EXECUTED' ? (
            <Card>
              <div className="mb-1 text-sm font-semibold text-slate-800">待关闭</div>
              <p className="mb-3 text-xs leading-5 text-slate-500">
                CN 已执行{change.verified ? '且验证通过' : '，但执行人未勾选验证通过'}。满足条件后关闭单据即闭环（R3）。
              </p>
              <CloseButton changeId={change.id} />
            </Card>
          ) : null}

          {change.status === 'REJECTED' ? (
            <Card className="border-rose-200 bg-rose-50/50">
              <div className="text-sm font-semibold text-rose-800">该单已驳回</div>
              <p className="mt-1 text-xs leading-5 text-rose-700">
                任一步驳回即整单终止。需要继续推进时，另起一张 CR 引用原 PR。
              </p>
            </Card>
          ) : null}

          {change.status === 'CLOSED' ? (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <div className="text-sm font-semibold text-emerald-800">已闭环</div>
              <p className="mt-1 text-xs leading-5 text-emerald-700">
                关闭时间 {toCST(change.closed_at)}。全过程已写入纪实台账，不可修改。
              </p>
            </Card>
          ) : null}

          <Card padded={false}>
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">时间线</div>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>节点</Th>
                  <Th className="w-32">时间</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td className="text-xs">提出</Td>
                  <Td className="tnum text-xs text-slate-500">{toCST(change.created_at)}</Td>
                </tr>
                {change.kind === 'CR'
                  ? approvals
                      .filter((a) => a.signed_at)
                      .map((a) => (
                        <tr key={`t-${a.id}`}>
                          <Td className="text-xs">
                            第 {a.step_no} 步 {a.step_name}（{a.signer_name}）
                          </Td>
                          <Td className="tnum text-xs text-slate-500">{toCST(a.signed_at)}</Td>
                        </tr>
                      ))
                  : null}
                {change.closed_at ? (
                  <tr>
                    <Td className="text-xs">关闭</Td>
                    <Td className="tnum text-xs text-slate-500">{toCST(change.closed_at)}</Td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
