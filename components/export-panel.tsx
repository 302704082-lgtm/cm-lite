'use client';

import { useState } from 'react';
import { btnPrimary } from './ui';

export default function ExportPanel({
  baselines,
}: {
  baselines: { id: number; code: string; name: string; model: string; items?: number }[];
}) {
  const [id, setId] = useState<number | ''>(baselines[0]?.id ?? '');
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-600">选择机型与基线</label>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          value={id}
          onChange={(e) => setId(e.target.value ? Number(e.target.value) : '')}
        >
          {baselines.map((b) => (
            <option key={b.id} value={b.id}>
              {b.model} · {b.code} {b.name}（{b.items ?? 0} 项）
            </option>
          ))}
        </select>
      </div>
      <a
        href={id ? `/api/export?baselineId=${id}` : '#'}
        className={btnPrimary + (id ? '' : ' pointer-events-none opacity-50')}
        download
      >
        导出《构型状态一览表》CSV
      </a>
    </div>
  );
}
