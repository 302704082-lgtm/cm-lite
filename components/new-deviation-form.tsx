'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inputCls, labelCls, btnPrimary } from './ui';

export default function NewDeviationForm({ cis }: { cis: { pn: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/deviations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: String(form.get('kind')),
          ci_pn: String(form.get('ci_pn') ?? ''),
          unit_sn: String(form.get('unit_sn') ?? '') || null,
          reason: String(form.get('reason') ?? '').trim(),
          qty_limit: Number(form.get('qty_limit') ?? 1),
          expire_at: String(form.get('expire_at') ?? ''),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'err', text: `${res.status} · ${data.error}` });
        return;
      }
      setMsg({ type: 'ok', text: '已创建' });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setMsg({ type: 'err', text: '网络异常，请重试' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className={btnPrimary} onClick={() => setOpen(true)}>
        + 新建偏离 / 让步
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">新建偏离 / 让步</div>
        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
          收起
        </button>
      </div>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>类型</label>
          <select name="kind" className={inputCls} defaultValue="DEVIATION">
            <option value="DEVIATION">偏离（投产前，不改文件，限批次）</option>
            <option value="CONCESSION">让步（制造中，带缺陷放行，仅本批）</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>构型项 *</label>
          <select name="ci_pn" className={inputCls} required defaultValue="">
            <option value="" disabled>
              请选择
            </option>
            {cis.map((c) => (
              <option key={c.pn} value={c.pn}>
                {c.pn} · {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>涉及整机序列号</label>
          <input name="unit_sn" className={inputCls} placeholder="EX-01-A01（可空）" />
        </div>
        <div>
          <label className={labelCls}>数量上限 *（R8）</label>
          <input name="qty_limit" type="number" min={1} className={inputCls} defaultValue={1} required />
        </div>
        <div>
          <label className={labelCls}>有效期至 *（R8）</label>
          <input name="expire_at" type="date" className={inputCls} required />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>原因与处置 *</label>
          <input name="reason" className={inputCls} required placeholder="超差项、影响评估、处置方式" />
        </div>
        <div className="sm:col-span-2 flex items-center justify-between">
          <div className="text-xs">
            {msg ? (
              <span className={msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}>{msg.text}</span>
            ) : (
              <span className="text-slate-400">数量上限与有效期缺一不可；过期单据在列表标红并计入总览预警</span>
            )}
          </div>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? '提交中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
