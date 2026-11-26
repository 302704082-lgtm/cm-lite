'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, btnGhost, btnPrimary } from './ui';

interface Item {
  id: number;
  code: string;
  title: string;
  status: string;
}

const ST: Record<string, { text: string; tone: 'gray' | 'green' | 'amber' | 'red' }> = {
  DRAFT: { text: '草稿', tone: 'gray' },
  SUBMITTED: { text: '待签署', tone: 'amber' },
  APPROVED: { text: '已批准', tone: 'green' },
  REJECTED: { text: '已驳回', tone: 'red' },
};

/** 通用「申请闸门」面板：出现在冻结 / 新建变更 / 新建偏离之前 */
export default function GatePanel({
  scene,
  title,
  desc,
  instances,
  targetType = '',
  targetId = 0,
  autoItems = false,
  enabled = true,
}: {
  scene: string;
  title: string;
  desc: string;
  instances: Item[];
  targetType?: string;
  targetId?: number;
  autoItems?: boolean;
  enabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const approved = instances.filter((i) => i.status === 'APPROVED');
  const pending = instances.filter((i) => i.status === 'SUBMITTED' || i.status === 'DRAFT');

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateCode: scene, targetType, targetId, autoItems }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(`${res.status} · ${d.error}`);
        return;
      }
      router.push(`/app/forms/${d.id}`);
    } catch {
      setErr('网络异常');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`mb-5 rounded-xl border px-5 py-4 ${enabled ? 'border-indigo-100 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <div className="flex items-center gap-2">
          {enabled ? (
            <Badge tone={approved.length ? 'green' : 'amber'}>
              {approved.length ? `已有 ${approved.length} 张已批准` : '尚无已批准申请单'}
            </Badge>
          ) : (
            <Badge tone="gray">当前未启用闸门</Badge>
          )}
          <Link href="/app/forms" className="text-xs text-slate-500 hover:text-slate-700">
            表单中心 →
          </Link>
        </div>
      </div>
      <div className="mb-3 text-[12px] leading-5 text-slate-600">{desc}</div>

      {enabled && instances.length > 0 ? (
        <div className="mb-3 space-y-1">
          {instances.slice(0, 6).map((i) => {
            const st = ST[i.status] ?? { text: i.status, tone: 'gray' as const };
            return (
              <div key={i.id} className="flex items-center gap-2 rounded bg-white px-3 py-1.5 text-xs">
                <span className="font-mono text-slate-500">{i.code}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{i.title}</span>
                <Badge tone={st.tone}>{st.text}</Badge>
                <Link href={`/app/forms/${i.id}`} className="text-indigo-600 hover:text-indigo-800">
                  打开
                </Link>
                <a href={`/api/forms/${i.id}?format=html`} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-700">
                  打印
                </a>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] leading-5 text-slate-500">
          {enabled
            ? approved.length
              ? '✅ 下面操作时选择对应的已批准单号即可通过闸门。'
              : pending.length
                ? `有 ${pending.length} 张单子待签署，签完才能继续。`
                : '先新建一张，填完、检查单逐项判定、几个岗位按顺序签完，系统才放行。'
            : '到「流程配置」启用对应模板后，这道闸门才会生效。'}
        </div>
        {enabled ? (
          <button className={btnPrimary} onClick={create} disabled={busy}>
            {busy ? '创建中…' : '＋ 新建申请单'}
          </button>
        ) : (
          <Link href="/app/flows" className={btnGhost}>
            去流程配置
          </Link>
        )}
      </div>
      {err ? <div className="mt-2 text-xs text-rose-600">{err}</div> : null}
    </div>
  );
}
