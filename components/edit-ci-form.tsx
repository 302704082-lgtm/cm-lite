'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inputCls, labelCls, btnPrimary } from './ui';

export default function EditCiForm({
  pn,
  name,
  owner,
  basis,
  note,
}: {
  pn: string;
  name: string;
  owner: string;
  basis: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cis/${encodeURIComponent(pn)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          owner: String(form.get('owner') ?? '').trim(),
          basis: String(form.get('basis') ?? '') || null,
          note: String(form.get('note') ?? '') || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'err', text: `${res.status} · ${data.error}` });
        return;
      }
      setMsg({ type: 'ok', text: '已保存' });
      router.refresh();
    } catch {
      setMsg({ type: 'err', text: '网络异常，请重试' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelCls}>名称</label>
        <input name="name" className={inputCls} defaultValue={name} />
      </div>
      <div>
        <label className={labelCls}>责任人</label>
        <input name="owner" className={inputCls} defaultValue={owner} />
      </div>
      <div>
        <label className={labelCls}>设计依据</label>
        <input name="basis" className={inputCls} defaultValue={basis ?? ''} />
      </div>
      <div>
        <label className={labelCls}>备注</label>
        <input name="note" className={inputCls} defaultValue={note ?? ''} />
      </div>
      <div className="sm:col-span-2 flex items-center justify-between">
        <div className="text-xs">
          {msg ? (
            <span className={msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}>{msg.text}</span>
          ) : (
            <span className="text-slate-400">版本与状态不在此处修改（只读）</span>
          )}
        </div>
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? '保存中…' : '保存属性'}
        </button>
      </div>
    </form>
  );
}
