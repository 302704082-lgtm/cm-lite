import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listChanges, listCis, listModels } from '@/lib/queries';
import { getEffectiveRules, slotToLabel } from '@/lib/profile';
import { CHANGE_KIND_NAMES, CHANGE_STATUS_NAMES } from '@/lib/constants';
import { toCST } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Td, Th } from '@/components/ui';
import NewPrForm from '@/components/new-pr-form';

export const dynamic = 'force-dynamic';

function statusTone(s: string): 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'indigo' {
  if (s === 'CLOSED') return 'green';
  if (s === 'REJECTED') return 'red';
  if (s === 'OPEN') return 'amber';
  if (s === 'APPROVED') return 'indigo';
  if (s === 'EXECUTED') return 'blue';
  return 'gray';
}

const FILTERS = [
  ['', '全部'],
  ['PR', '申请 PR'],
  ['CR', '变更 CR'],
  ['CN', '通知 CN'],
];

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { kind, status } = await searchParams;
  const models = await listModels(user.tenantId);
  const model = models[0] ?? 'EX-01';
  const [changes, cis, rules] = await Promise.all([
    listChanges(user.tenantId, { kind: kind || undefined, status: status || undefined }),
    listCis(user.tenantId, model),
    getEffectiveRules(user.tenantId),
  ]);

  return (
    <div>
      <PageHeader title="变更" desc="变更唯一入口 PR → CR → CN；CR 的审批链挂在 CR 上" />

      <div className="mb-5">
        <NewPrForm model={model} cis={cis.map((c) => ({ pn: c.pn, name: c.name, rev: c.rev }))} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        {FILTERS.map(([v, label]) => {
          const active = (kind ?? '') === v;
          const href = v ? `/app/changes?kind=${v}` : '/app/changes';
          return (
            <Link
              key={v || 'all'}
              href={href}
              className={`rounded-md px-2.5 py-1.5 transition ${
                active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </Link>
          );
        })}
        {status ? (
          <span className="ml-2 text-slate-400">
            状态筛选：{CHANGE_STATUS_NAMES[status] ?? status}
            <Link href="/app/changes" className="ml-1 text-indigo-600">
              清除
            </Link>
          </span>
        ) : null}
      </div>

      <Card padded={false}>
        {changes.length === 0 ? (
          <div className="p-5">
            <Empty>没有符合条件的单据</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead>
                <tr>
                  <Th className="w-32">单号</Th>
                  <Th className="w-24">类型</Th>
                  <Th>标题</Th>
                  <Th className="w-20">类别</Th>
                  <Th className="w-28">状态</Th>
                  <Th className="w-24">提出人</Th>
                  <Th className="w-36">时间</Th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      <Link
                        href={`/app/changes/${c.id}`}
                        className="font-mono text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        {c.code}
                      </Link>
                    </Td>
                    <Td className="text-xs text-slate-500">{CHANGE_KIND_NAMES[c.kind] ?? c.kind}</Td>
                    <Td className="text-xs text-slate-800">{c.title}</Td>
                    <Td className="text-xs">
                      {c.class_result ? (
                        <Badge tone={c.class_result === 'I' ? 'red' : c.class_result === 'II' ? 'amber' : 'gray'}>
                          {slotToLabel(rules, c.class_result)}
                        </Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={statusTone(c.status)}>{CHANGE_STATUS_NAMES[c.status] ?? c.status}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">{c.created_by}</Td>
                    <Td className="text-xs text-slate-500 tnum">{toCST(c.created_at)}</Td>
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
