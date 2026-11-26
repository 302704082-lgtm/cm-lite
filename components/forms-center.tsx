'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Card, Empty, Th, Td, btnGhost, btnPrimary, inputCls, labelCls } from './ui';

interface Tpl {
  code: string;
  name: string;
  scene: string;
  status: string;
  note: string;
  requires_items: number;
}
interface Inst {
  id: number;
  code: string;
  title: string;
  scene: string;
  status: string;
  created_by: string;
  created_at: string;
  template_name: string;
}
interface BL {
  id: number;
  code: string;
  name: string;
  status: string;
}

const STATUS: Record<string, { text: string; tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' }> = {
  DRAFT: { text: '草稿', tone: 'gray' },
  SUBMITTED: { text: '待签署', tone: 'amber' },
  APPROVED: { text: '已批准', tone: 'green' },
  REJECTED: { text: '已驳回', tone: 'red' },
};

export default function FormsCenter({
  templates,
  instances,
  baselines,
}: {
  templates: Tpl[];
  instances: Inst[];
  baselines: BL[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState<Tpl | null>(null);
  const [baselineId, setBaselineId] = useState<number>(baselines[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!picking) return;
    if (picking.requires_items && !baselineId) {
      setErr('请先选择要冻结的基线');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateCode: picking.code,
          targetType: picking.requires_items ? 'baseline' : '',
          targetId: picking.requires_items ? baselineId : 0,
          title: title.trim() || undefined,
          autoItems: !!picking.requires_items,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(`${res.status} · ${d.error}`);
        return;
      }
      router.push(`/app/forms/${d.id}`);
    } catch {
      setErr('网络异常');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-800">可用的单据模板</div>
        {templates.length === 0 ? (
          <Empty>还没有启用任何表单模板，可到「流程配置」添加</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <div key={t.code} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">{t.name}</div>
                  <Badge tone="indigo">{t.code}</Badge>
                </div>
                <div className="mb-2.5 min-h-[36px] text-[11px] leading-5 text-slate-500">{t.note || '—'}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {t.requires_items ? '含清单自动带出' : '通用表单'}
                  </span>
                  <button
                    className={btnGhost + ' !px-2.5 !py-1 !text-xs'}
                    onClick={() => {
                      setPicking(t);
                      setTitle('');
                      setErr(null);
                    }}
                  >
                    + 新建一张
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {picking ? (
          <div className="mt-4 rounded-lg border border-indigo-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">新建「{picking.name}」</div>
              <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setPicking(null)}>
                收起
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {picking.requires_items ? (
                <div>
                  <label className={labelCls}>要冻结的基线 *（自动带出全部文件及版本）</label>
                  <select
                    className={inputCls}
                    value={baselineId}
                    onChange={(e) => setBaselineId(Number(e.target.value))}
                  >
                    <option value={0}>请选择</option>
                    {baselines.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} · {b.name}{b.status === 'FROZEN' ? '（已冻结）' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className={labelCls}>单据标题（留空用模板名）</label>
                <input
                  className={inputCls}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={picking.name}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-rose-600">{err}</div>
              <button className={btnPrimary} onClick={create} disabled={busy}>
                {busy ? '创建中…' : '创建草稿并去填写'}
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card padded={false}>
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
          全部单据（{instances.length} 张）
        </div>
        {instances.length === 0 ? (
          <div className="p-5">
            <Empty>还没有单据。先在上面选一张模板新建。</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <Th className="w-40">单号</Th>
                  <Th>单据名称</Th>
                  <Th className="w-32">场景</Th>
                  <Th className="w-24">状态</Th>
                  <Th className="w-28">申请人</Th>
                  <Th className="w-40">创建时间</Th>
                  <Th className="w-36">操作</Th>
                </tr>
              </thead>
              <tbody>
                {instances.map((i) => {
                  const st = STATUS[i.status] ?? { text: i.status, tone: 'gray' as const };
                  return (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <Td className="font-mono text-xs">{i.code}</Td>
                      <Td className="text-xs">{i.title || i.template_name}</Td>
                      <Td className="text-xs text-slate-500">{i.scene}</Td>
                      <Td className="text-xs">
                        <Badge tone={st.tone}>{st.text}</Badge>
                      </Td>
                      <Td className="text-xs text-slate-500">{i.created_by}</Td>
                      <Td className="text-xs text-slate-500">{i.created_at}</Td>
                      <Td className="text-xs">
                        <Link href={`/app/forms/${i.id}`} className="text-indigo-600 hover:text-indigo-800">
                          打开
                        </Link>
                        <a
                          href={`/api/forms/${i.id}?format=html`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-3 text-slate-500 hover:text-slate-700"
                        >
                          打印
                        </a>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
