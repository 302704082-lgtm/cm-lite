'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { btnDanger, btnGhost, btnPrimary, inputCls, labelCls } from './ui';

function usePost() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(`${res.status} · ${data.error ?? '请求失败'}`);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErr('网络异常，请重试');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, err, post, setErr };
}

/** 签署面板：对所有登录用户可见可点，判定全在服务端（先 SoD 后角色） */
export function SignPanel({
  changeId,
  stepNo,
  stepName,
  roleLabel,
  myRoleLabel,
}: {
  changeId: number;
  stepNo: number;
  stepName: string;
  roleLabel: string;
  myRoleLabel: string;
}) {
  const { busy, err, post } = usePost();
  const [comment, setComment] = useState('');

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5">
      <div className="mb-1 text-sm font-semibold text-slate-800">
        签署面板 · 第 {stepNo} 步「{stepName}」
      </div>
      <p className="mb-3 text-xs leading-5 text-slate-500">
        该步需要「{roleLabel}」；当前用户角色「{myRoleLabel}」。面板对所有人可见，判定在服务端：先查职责分离，再查角色。
      </p>
      <label className={labelCls}>签署意见（可选）</label>
      <input
        className={inputCls}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="例如：接口影响已确认"
      />
      {err ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs leading-5 text-rose-700">
          {err}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          className={btnPrimary}
          disabled={busy}
          onClick={() => post(`/api/changes/${changeId}/sign`, { stepNo, decision: 'APPROVE', comment })}
        >
          {busy ? '提交中…' : '同意并签署'}
        </button>
        <button
          className={btnDanger}
          disabled={busy}
          onClick={() => post(`/api/changes/${changeId}/sign`, { stepNo, decision: 'REJECT', comment })}
        >
          驳回
        </button>
      </div>
    </div>
  );
}

/** CN 执行确认：执行说明 + 验证通过勾选 */
export function ExecutePanel({ changeId }: { changeId: number }) {
  const { busy, err, post } = usePost();
  const [note, setNote] = useState('');
  const [verified, setVerified] = useState(true);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
      <div className="mb-1 text-sm font-semibold text-slate-800">CN 执行确认</div>
      <p className="mb-3 text-xs leading-5 text-slate-500">
        提交后系统自动：① 建 CN 单据（已执行）② 落库（换件号则新建构型项、原件作废；否则原地升版）③ CR 转「已执行」④ 写入纪实。
      </p>
      <label className={labelCls}>执行说明 *</label>
      <input
        className={inputCls}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="例如：已按新图纸换装并完成验证"
      />
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
        />
        验证通过（未勾选则不能关闭单据，R3）
      </label>
      {err ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs leading-5 text-rose-700">
          {err}
        </div>
      ) : null}
      <div className="mt-3">
        <button
          className={btnPrimary}
          disabled={busy || !note.trim()}
          onClick={() => post(`/api/changes/${changeId}/execute`, { note, verified })}
        >
          {busy ? '执行中…' : '执行变更并落库'}
        </button>
      </div>
    </div>
  );
}

export function CloseButton({ changeId }: { changeId: number }) {
  const { busy, err, post } = usePost();
  return (
    <div>
      <button className={btnPrimary} disabled={busy} onClick={() => post(`/api/changes/${changeId}/close`)}>
        {busy ? '处理中…' : '关闭单据（闭环）'}
      </button>
      {err ? <div className="mt-2 text-xs text-rose-700">{err}</div> : null}
    </div>
  );
}

export function ToCrButton({ prId }: { prId: number }) {
  return (
    <a href={`/app/changes/new?pr=${prId}`} className={btnGhost}>
      转为 CR（进入定级向导）→
    </a>
  );
}
