'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inputCls, labelCls, btnPrimary } from './ui';

const TYPES = [
  ['SYSTEM', '整机'],
  ['EQUIPMENT', '分系统'],
  ['HARDWARE', '硬件件'],
  ['SOFTWARE', '软件件'],
  ['DOC', '文件件'],
] as const;

export default function NewCiForm({
  model,
  parents,
}: {
  model: string;
  parents: { pn: string; name: string }[];
}) {
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
      const res = await fetch('/api/cis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          pn: String(form.get('pn') ?? '').trim(),
          name: String(form.get('name') ?? '').trim(),
          type: String(form.get('type')),
          parent_pn: String(form.get('parent_pn') ?? '') || null,
          qty: Number(form.get('qty') ?? 1),
          rev: String(form.get('rev') ?? 'A') || 'A',
          status: String(form.get('status')),
          criticality: String(form.get('criticality')),
          owner: String(form.get('owner') ?? '').trim(),
          basis: String(form.get('basis') ?? '') || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'err', text: `${res.status} · ${data.error}` });
        return;
      }
      setMsg({ type: 'ok', text: `已创建 ${data.pn}` });
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
        + 新建构型项
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">新建构型项（{model}）</div>
        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
          收起
        </button>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>件号 *</label>
          <input name="pn" className={inputCls} required placeholder="EX01-XXX-005" />
        </div>
        <div>
          <label className={labelCls}>名称 *</label>
          <input name="name" className={inputCls} required placeholder="新增设备" />
        </div>
        <div>
          <label className={labelCls}>类型</label>
          <select name="type" className={inputCls} defaultValue="HARDWARE">
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>上级构型项</label>
          <select name="parent_pn" className={inputCls} defaultValue="">
            <option value="">（顶层）</option>
            {parents.map((p) => (
              <option key={p.pn} value={p.pn}>
                {p.pn} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>初始版本</label>
          <input name="rev" className={inputCls} defaultValue="A" />
        </div>
        <div>
          <label className={labelCls}>数量</label>
          <input name="qty" type="number" min={1} className={inputCls} defaultValue={1} />
        </div>
        <div>
          <label className={labelCls}>初始状态</label>
          <select name="status" className={inputCls} defaultValue="CONTROLLED">
            <option value="DRAFT">草稿（不参与基线快照）</option>
            <option value="CONTROLLED">受控（参与基线快照）</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>关键性</label>
          <select name="criticality" className={inputCls} defaultValue="NORMAL">
            <option value="NORMAL">一般件</option>
            <option value="IMPORTANT">重要件</option>
            <option value="KEY">关键件</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>责任人 *</label>
          <input name="owner" className={inputCls} required defaultValue="张设计" />
        </div>
        <div>
          <label className={labelCls}>设计依据</label>
          <input name="basis" className={inputCls} placeholder="图纸号/技术条件" />
        </div>

        <div className="sm:col-span-2 flex items-center justify-between gap-3">
          <div className="text-xs">
            {msg ? (
              <span className={msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}>{msg.text}</span>
            ) : (
              <span className="text-slate-400">件号全库唯一，重复会被 409 拦下并指出冲突项</span>
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
