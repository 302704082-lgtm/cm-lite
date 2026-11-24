'use client';

import { useState } from 'react';
import { btnGhost, btnPrimary } from './ui';

export default function ExportPanel({
  baselines,
  ruleName,
  evidenceTitle,
  evidenceCount,
}: {
  baselines: { id: number; code: string; name: string; model: string; items?: number }[];
  ruleName?: string;
  evidenceTitle?: string;
  evidenceCount?: number;
}) {
  const [id, setId] = useState<number | ''>(baselines[0]?.id ?? '');
  const link = (path: string) => (id ? `${path}?baselineId=${id}` : path === '/api/export' ? '#' : path);
  const disabled = !id;

  return (
    <div>
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
          href={link('/api/export')}
          className={btnGhost + (disabled ? ' pointer-events-none opacity-50' : '')}
          download
        >
          导出《构型状态一览表》CSV
        </a>
        <a
          href={link('/api/evidence')}
          className={btnPrimary}
          download
        >
          导出证据包（HTML · 可打印成 PDF）
        </a>
      </div>
      <p className="mt-2.5 text-[11px] leading-5 text-slate-500">
        证据包会按「{ruleName ?? '内置默认规则'}」里填的材料清单，自动汇编成一套
        <span className="font-medium text-slate-700">「{evidenceTitle ?? '构型状态与更改证据包'}」</span>
        （共 {evidenceCount ?? 0} 份材料），带封面、目录和每份材料的真实数据表；直接用浏览器或 WPS 打开即可打印。
        换一套规矩、重新启用，目录和份数会跟着变，不用改代码。
      </p>
    </div>
  );
}
