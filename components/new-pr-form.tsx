'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inputCls, labelCls, btnPrimary } from './ui';

export default function NewPrForm({
  model,
  cis,
  approvedForms = [],
  gateRequired = false,
}: {
  model: string;
  cis: { pn: string; name: string; rev: string }[];
  approvedForms?: { id: number; code: string; title: string }[];
  gateRequired?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          ci_pn: String(form.get('ci_pn') ?? ''),
          title: String(form.get('title') ?? '').trim(),
          reason: String(form.get('reason') ?? '').trim() || null,
          request_form_id: gateRequired ? Number(form.get('request_form_id') ?? 0) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`${res.status} · ${data.error}`);
        return;
      }
      router.push(`/app/changes/${data.id}`);
    } catch {
      setMsg('网络异常，请重试');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className={btnPrimary} onClick={() => setOpen(true)}>
        + 新建变更申请（PR）
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800">新建变更申请（PR）</div>
          <div className="text-[11px] text-slate-400">
            {gateRequired ? '须关联一张已批准的《变更申请与可行性评审单》' : '变更唯一入口：PR → CR → CN'}
          </div>
        </div>
        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
          收起
        </button>
      </div>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        {gateRequired ? (
          <div className="sm:col-span-2">
            <label className={labelCls}>关联的已批准申请单 *（没签完不许建变更）</label>
            <select name="request_form_id" className={inputCls} required defaultValue="">
              <option value="" disabled>
                请选择
              </option>
              {approvedForms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} · {f.title}
                </option>
              ))}
            </select>
            {approvedForms.length === 0 ? (
              <div className="mt-1 text-[11px] text-amber-600">
                目前没有已批准的申请单，请先用上面的按钮新建并完成三级签署。
              </div>
            ) : null}
          </div>
        ) : null}
        <div>
          <label className={labelCls}>变更对象（构型项）*</label>
          <select name="ci_pn" className={inputCls} required defaultValue="">
            <option value="" disabled>
              请选择
            </option>
            {cis.map((c) => (
              <option key={c.pn} value={c.pn}>
                {c.pn} · {c.name}（{c.rev}）
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>变更标题 *</label>
          <input name="title" className={inputCls} required placeholder="例如：更换电机型号，功率提升 15%" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>变更原因</label>
          <input name="reason" className={inputCls} placeholder="一句话说明为什么要改" />
        </div>
        <div className="sm:col-span-2 flex items-center justify-between">
          <div className="text-xs text-rose-600">{msg}</div>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? '提交中…' : '创建申请单'}
          </button>
        </div>
      </form>
    </div>
  );
}
