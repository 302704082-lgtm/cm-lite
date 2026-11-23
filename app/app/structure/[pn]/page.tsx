import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { changesForCi, getCi, isInFrozenBaseline, listDocs } from '@/lib/queries';
import {
  CHANGE_KIND_NAMES,
  CHANGE_STATUS_NAMES,
  CI_STATUS_NAMES,
  CI_TYPE_NAMES,
  CRITICALITY_NAMES,
} from '@/lib/constants';
import { toCST } from '@/lib/format';
import { Badge, Card, PageHeader, Th, Td, Empty } from '@/components/ui';
import EditCiForm from '@/components/edit-ci-form';

export const dynamic = 'force-dynamic';

export default async function CiDetailPage({ params }: { params: Promise<{ pn: string }> }) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { pn } = await params;
  const decoded = decodeURIComponent(pn);
  const ci = await getCi(user.tenantId, decoded);
  if (!ci) notFound();

  const [docs, changes, frozen] = await Promise.all([
    listDocs(user.tenantId, ci.pn),
    changesForCi(user.tenantId, ci.pn),
    isInFrozenBaseline(user.tenantId, ci.pn),
  ]);

  const attrs: [string, React.ReactNode][] = [
    ['件号', <span key="pn" className="font-mono text-xs">{ci.pn}</span>],
    ['名称', ci.name],
    ['机型', ci.model],
    ['类型', CI_TYPE_NAMES[ci.type as keyof typeof CI_TYPE_NAMES] ?? ci.type],
    ['上级', ci.parent_pn ? <span key="p" className="font-mono text-xs">{ci.parent_pn}</span> : '—'],
    ['数量', ci.qty],
    ['版本（只读）', <span key="rev" className="font-mono text-xs">{ci.rev}</span>],
    ['状态（只读）', <Badge key="st" tone={ci.status === 'CONTROLLED' ? 'green' : ci.status === 'VOID' ? 'red' : 'amber'}>{CI_STATUS_NAMES[ci.status] ?? ci.status}</Badge>],
    ['关键性', CRITICALITY_NAMES[ci.criticality]],
    ['序列号管控', ci.sn_controlled ? '是' : '否'],
    ['责任人', ci.owner],
    ['设计依据', ci.basis || '—'],
    ['创建时间', toCST(ci.created_at)],
  ];

  return (
    <div>
      <PageHeader
        title={`${ci.pn} · ${ci.name}`}
        desc={
          frozen
            ? '该构型项出现在已冻结基线中：版本与状态只能由变更流程写入（R2）'
            : '该构型项尚未进入冻结基线，但仍须通过变更流程改动版本'
        }
        actions={
          <Link href="/app/structure" className="text-sm text-slate-500 hover:text-slate-700">
            ← 返回结构树
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padded={false}>
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">属性</div>
          <table className="w-full">
            <tbody>
              {attrs.map(([k, v]) => (
                <tr key={k}>
                  <Td className="w-32 bg-slate-50 text-xs text-slate-500">{k}</Td>
                  <Td>{v}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-5">
          <Card padded={false}>
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">关联文件</div>
            <div className="p-3">
              {docs.length === 0 ? (
                <Empty>未挂文件号</Empty>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>文件号</Th>
                      <Th>名称</Th>
                      <Th className="w-16">版本</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <Td className="font-mono text-xs">{d.doc_no}</Td>
                        <Td className="text-xs">{d.title}</Td>
                        <Td className="font-mono text-xs">{d.rev}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          <Card padded={false}>
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">变更历史</div>
            <div className="p-3">
              {changes.length === 0 ? (
                <Empty>暂无变更记录</Empty>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>单据</Th>
                      <Th>标题</Th>
                      <Th className="w-24">状态</Th>
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
                        <Td className="text-xs">
                          <span className="mr-1.5 text-slate-400">{CHANGE_KIND_NAMES[c.kind]}</span>
                          {c.title}
                        </Td>
                        <Td className="text-xs text-slate-500">{CHANGE_STATUS_NAMES[c.status] ?? c.status}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <div className="mb-3 text-sm font-semibold text-slate-800">编辑属性</div>
        <EditCiForm pn={ci.pn} name={ci.name} owner={ci.owner} basis={ci.basis} note={ci.note} />
      </Card>
    </div>
  );
}
