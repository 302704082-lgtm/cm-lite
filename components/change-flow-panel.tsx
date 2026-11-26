'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, btnGhost } from './ui';

interface Step {
  step_no: number;
  step_name: string;
  form_code: string;
  role_label: string;
  gate: number;
}
interface Form {
  id: number;
  code: string;
  scene: string;
  status: string;
  title: string;
}

const ST: Record<string, { text: string; tone: 'gray' | 'green' | 'amber' | 'red' }> = {
  DRAFT: { text: '草稿', tone: 'gray' },
  SUBMITTED: { text: '待签署', tone: 'amber' },
  APPROVED: { text: '已批准', tone: 'green' },
  REJECTED: { text: '已驳回', tone: 'red' },
};

/** 变更单上的「流程步骤」：把流程配置里定义的每一步和该步该出的表显示出来 */
export default function ChangeFlowPanel({
  changeId,
  steps,
  forms,
}: {
  changeId: number;
  steps: Step[];
  forms: Form[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function createForm(formCode: string, stepNo: number) {
    setBusy(stepNo);
    setErr(null);
    try {
      const res = await fetch(`/api/changes/${changeId}/form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formCode }),
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
      setBusy(null);
    }
  }

  if (steps.length === 0) {
    return (
      <div className="p-4 text-xs text-slate-400">
        还没有配置流程步骤，去 <Link href="/app/flows" className="text-indigo-600">流程配置</Link> 添加。
      </div>
    );
  }

  return (
    <div className="p-4">
      <ol className="space-y-2">
        {steps.map((s) => {
          const related = forms.filter((f) => f.scene === s.form_code);
          const approved = related.find((f) => f.status === 'APPROVED');
          return (
            <li key={s.step_no} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-slate-800">
                  {s.step_no}. {s.step_name}
                </div>
                <div className="flex items-center gap-1.5">
                  {s.gate ? <Badge tone="amber">闸门</Badge> : null}
                  {approved ? <Badge tone="green">已批准</Badge> : related.length ? <Badge tone="amber">待签</Badge> : <Badge tone="gray">未出单</Badge>}
                </div>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {s.form_code ? `该步出表：${s.form_code}` : '该步不出表'}　·　岗位：{s.role_label || '—'}
              </div>
              {related.length ? (
                <div className="mt-1.5 space-y-1">
                  {related.map((f) => {
                    const st = ST[f.status] ?? { text: f.status, tone: 'gray' as const };
                    return (
                      <div key={f.id} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-slate-500">{f.code}</span>
                        <Badge tone={st.tone}>{st.text}</Badge>
                        <Link href={`/app/forms/${f.id}`} className="text-indigo-600 hover:text-indigo-800">打开</Link>
                        <a href={`/api/forms/${f.id}?format=html`} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-700">打印</a>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {s.form_code && !approved ? (
                <button
                  className={btnGhost + ' mt-2 !px-2 !py-0.5 !text-[11px]'}
                  onClick={() => void createForm(s.form_code, s.step_no)}
                  disabled={busy !== null}
                >
                  {busy === s.step_no ? '创建中…' : '＋ 出这张表'}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {err ? <div className="mt-2 text-xs text-rose-600">{err}</div> : null}
      <p className="mt-3 text-[11px] leading-5 text-slate-400">
        步骤、挂哪张表、岗位、闸门都在「流程配置」里改；勾了闸门且挂表的步骤，没批准就不能关闭变更。
      </p>
    </div>
  );
}
