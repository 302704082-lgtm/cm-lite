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
  ruleName,
  revDefault,
}: {
  model: string;
  parents: { pn: string; name: string }[];
  ruleName?: string;
  revDefault?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pn, setPn] = useState('');
  const [type, setType] = useState('HARDWARE');

  async function autoPn(nextType: string) {
    try {
      const res = await fetch(`/api/cis?type=${encodeURIComponent(nextType)}&model=${encodeURIComponent(model)}`);
      const j = await res.json();
      if (j.pn) setPn(j.pn);
    } catch {
      /* 留空也能由服务端自动生成 */
    }
  }

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
          pn: String(form.get('pn') ?? '').trim(), // 留空由服务端按规则生成
          name: String(form.get('name') ?? '').trim(),
          type: String(form.get('type')),
          parent_pn: String(form.get('parent_pn') ?? '') || null,
          qty: Number(form.get('qty') ?? 1),
          rev: String(form.get('rev') ?? '').trim() || undefined,
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
      setMsg({ type: 'ok', text: `已创建 ${data.pn}（版本 ${data.rev}）` });
      (e.target as HTMLFormElement).reset();
      setPn('');
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
          <label className={labelCls}>件号（留空自动生成）</label>
          <div className="flex gap-2">
            <input
              name="pn"
              className={inputCls}
              value={pn}
              onChange={(e) => setPn(e.target.value)}
              placeholder="留空即按生效规则生成"
            />
            <button
              type="button"
              className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"
              onClick={() => autoPn(type)}
            >
              生成
            </button>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {ruleName ? `当前按「${ruleName}」的规则编号` : '当前按内置规则编号'}
          </div>
        </div>
        <div>
          <label className={labelCls}>名称 *</label>
          <input name="name" className={inputCls} required placeholder="新增设备" />
        </div>
        <div>
          <label className={labelCls}>类型</label>
          <select
            name="type"
            className={inputCls}
            defaultValue="HARDWARE"
            onChange={(e) => { setType(e.target.value); if (!pn) autoPn(e.target.value); }}
          >
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
          <label className={labelCls}>初始版本（留空用规则默认值）</label>
          <input name="rev" className={inputCls} defaultValue={revDefault ?? ''} placeholder="留空自动" />
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
              <span className="text-slate-400">件号留空按规则生成；手填重复会被拦下并指出冲突项</span>
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
