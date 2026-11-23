'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { btnPrimary } from './ui';

export default function FreezeButton({
  id,
  code,
  disabled,
}: {
  id: number;
  code: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function freeze() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/baselines/${id}/freeze`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErr(`${res.status} · ${data.error}`);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setErr('网络异常');
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return <span className="text-xs text-slate-400">已冻结</span>;
  }

  if (!confirming) {
    return (
      <button className="text-xs text-indigo-600 hover:text-indigo-800" onClick={() => setConfirming(true)}>
        冻结
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">冻结 {code} 后条目只读，确定？</span>
      <button className={btnPrimary + ' !px-2 !py-1 !text-xs'} onClick={freeze} disabled={busy}>
        {busy ? '处理中…' : '确定冻结'}
      </button>
      <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setConfirming(false)}>
        取消
      </button>
      {err ? <span className="text-xs text-rose-600">{err}</span> : null}
    </div>
  );
}
