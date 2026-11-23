import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listCis, listModels } from '@/lib/queries';
import { CI_STATUS_NAMES, CI_TYPE_NAMES, CRITICALITY_NAMES } from '@/lib/constants';
import { Badge, Card, PageHeader, Th, Td, Empty } from '@/components/ui';
import NewCiForm from '@/components/new-ci-form';
import type { Ci } from '@/lib/types';

export const dynamic = 'force-dynamic';

function buildRows(cis: Ci[]): { ci: Ci; depth: number }[] {
  const byParent = new Map<string | null, Ci[]>();
  for (const c of cis) {
    const key = c.parent_pn ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const rows: { ci: Ci; depth: number }[] = [];
  const visited = new Set<number>();

  const walk = (parent: string | null, depth: number) => {
    for (const c of byParent.get(parent) ?? []) {
      if (visited.has(c.id)) continue;
      visited.add(c.id);
      rows.push({ ci: c, depth });
      walk(c.pn, depth + 1);
    }
  };
  walk(null, 0);

  // 上级已作废的孤儿节点也要展示，不能丢数据
  for (const c of cis) {
    if (!visited.has(c.id)) {
      visited.add(c.id);
      rows.push({ ci: c, depth: 0 });
    }
  }
  return rows;
}

function statusTone(s: string): 'green' | 'amber' | 'gray' | 'red' {
  if (s === 'CONTROLLED') return 'green';
  if (s === 'DRAFT') return 'amber';
  if (s === 'VOID') return 'red';
  return 'gray';
}

export default async function StructurePage() {
  const user = await getSession();
  if (!user) redirect('/login');

  const models = await listModels(user.tenantId);
  const model = models[0] ?? 'EX-01';
  const cis = await listCis(user.tenantId, model);
  const rows = buildRows(cis);

  return (
    <div>
      <PageHeader
        title="构型项"
        desc={`机型 ${model} · 共 ${cis.length} 项（不含已作废）· 按结构树层级缩进展示`}
      />

      <div className="mb-5">
        <NewCiForm model={model} parents={cis.map((c) => ({ pn: c.pn, name: c.name }))} />
      </div>

      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>还没有构型项，先跑一次 npm run db:init</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <Th>件号 / 名称</Th>
                  <Th className="w-28">类型</Th>
                  <Th className="w-20">版本</Th>
                  <Th className="w-24">状态</Th>
                  <Th className="w-24">关键性</Th>
                  <Th className="w-24">责任人</Th>
                  <Th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ ci, depth }) => (
                  <tr key={ci.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="flex items-center" style={{ paddingLeft: depth * 20 }}>
                        {depth > 0 ? <span className="mr-1.5 text-slate-300">└</span> : null}
                        <span className="font-mono text-xs text-slate-500">{ci.pn}</span>
                        <span className="mx-2 text-slate-300">|</span>
                        <span className={depth === 0 ? 'font-medium text-slate-900' : 'text-slate-700'}>
                          {ci.name}
                        </span>
                        {ci.criticality !== 'NORMAL' ? (
                          <span className="ml-2">
                            <Badge tone={ci.criticality === 'KEY' ? 'red' : 'amber'}>
                              {CRITICALITY_NAMES[ci.criticality]}
                            </Badge>
                          </span>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {CI_TYPE_NAMES[ci.type as keyof typeof CI_TYPE_NAMES] ?? ci.type}
                    </Td>
                    <Td className="font-mono text-xs">{ci.rev}</Td>
                    <Td>
                      <Badge tone={statusTone(ci.status)}>{CI_STATUS_NAMES[ci.status] ?? ci.status}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">{CRITICALITY_NAMES[ci.criticality]}</Td>
                    <Td className="text-xs text-slate-500">{ci.owner}</Td>
                    <Td>
                      <Link
                        href={`/app/structure/${encodeURIComponent(ci.pn)}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        详情
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-slate-400">
        版本与状态为只读项：只能由变更流程落库写入，直接改会被 409 拦下。
      </p>
    </div>
  );
}
