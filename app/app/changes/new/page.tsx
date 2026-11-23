import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getChange, getCi } from '@/lib/queries';
import { Empty, PageHeader } from '@/components/ui';
import CrWizard from '@/components/cr-wizard';

export const dynamic = 'force-dynamic';

export default async function NewChangePage({
  searchParams,
}: {
  searchParams: Promise<{ pr?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const { pr } = await searchParams;
  if (!pr) {
    return (
      <div>
        <PageHeader title="变更定级向导" desc="向导必须从一张变更申请（PR）发起" />
        <Empty>
          请先在
          <Link href="/app/changes" className="mx-1 text-indigo-600">
            变更列表
          </Link>
          新建一张 PR，再点「转为 CR」进入定级向导。
        </Empty>
      </div>
    );
  }

  const prId = Number(pr);
  if (!Number.isInteger(prId)) notFound();

  const p = await getChange(user.tenantId, prId);
  if (!p || p.kind !== 'PR') notFound();

  if (p.status !== 'OPEN') {
    return (
      <div>
        <PageHeader title="变更定级向导" desc={`${p.code} 当前状态不允许再转 CR`} />
        <Empty>
          该申请单状态为「{p.status}」，已转出或已关闭。
          <Link href={`/app/changes/${p.id}`} className="ml-1 text-indigo-600">
            查看单据
          </Link>
        </Empty>
      </div>
    );
  }

  const ci = p.ci_pn ? await getCi(user.tenantId, p.ci_pn) : null;
  if (!ci) notFound();

  return (
    <div>
      <PageHeader
        title="变更定级向导"
        desc={`${p.code} · 三屏走完即生成审批链`}
        actions={
          <Link href={`/app/changes/${p.id}`} className="text-sm text-slate-500 hover:text-slate-700">
            ← 返回申请单
          </Link>
        }
      />
      <CrWizard
        prId={p.id}
        prCode={p.code}
        model={p.model}
        ci={{ pn: ci.pn, name: ci.name, rev: ci.rev, criticality: ci.criticality }}
        title={p.title}
        reason={p.reason}
      />
    </div>
  );
}
