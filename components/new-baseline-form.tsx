'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inputCls, labelCls, btnPrimary } from './ui';

export default function NewBaselineForm({
  model,
  baselineKinds,
}: {
  model: string;
  baselineKinds?: { label: string; slot: string }[];
}) {
  const kinds = baselineKinds?.length
    ? baselineKinds
    : [
        { label: '需求基线', slot: 'REQUIREMENT' },
        { label: '设计基线', slot: 'DESIGN' },
        { label: '取证基线', slot: 'CERTIFICATION' },
        { label: '其他', slot: 'OTHER' },
      ];
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
      const res = await fetch('/api/baselines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          code: String(form.get('code') ?? '').trim(),
          name: String(form.get('name') ?? '').trim(),
          kind: String(form.get('kind') ?? kinds[0]?.label ?? 'DESIGN'),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'err', text: `${res.status} · ${data.error}` });
        return;
      }
      setMsg({ type: 'ok', text: `已创建基线，快照 ${data.itemCount} 项` });
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
        + 新建基线（快照）
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">新建基线 · 机型 {model}</div>
        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
          收起
        </button>
      </div>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>基线编号 *</label>
          <input name="code" className={inputCls} required placeholder="D2" />
        </div>
        <div>
          <label className={labelCls}>基线名称 *</label>
          <input name="name" className={inputCls} required placeholder="设计基线 V2" />
        </div>
        <div>
          <label className={labelCls}>类型</label>
          <select name="kind" className={inputCls} defaultValue={kinds[0]?.label ?? 'DESIGN'}>
            {kinds.map((k) => (
              <option key={k.label} value={k.label}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3 flex items-center justify-between">
          <div className="text-xs">
            {msg ? (
              <span className={msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}>{msg.text}</span>
            ) : (
              <span className="text-slate-400">创建即快照当前全部受控构型项的版本与文件版，之后可冻结</span>
            )}
          </div>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? '快照中…' : '创建并快照'}
          </button>
        </div>
      </form>
    </div>
  );
}
