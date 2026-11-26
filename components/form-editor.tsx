'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Card, Th, Td, btnGhost, btnPrimary, inputCls, labelCls } from './ui';

interface FieldDef {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'date' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}
interface CheckRow {
  key: string;
  label: string;
  result: 'PENDING' | 'PASS' | 'FAIL' | 'NA';
  note?: string;
}
interface ItemRow {
  key: string;
  label: string;
  value: string;
}
interface StepRow {
  step_no: number;
  step_name: string;
  role_label: string;
  signer_name: string | null;
  decision: string | null;
  comment: string | null;
  signed_at: string | null;
}

const RESULT_LABEL: Record<string, string> = { PENDING: '待判定', PASS: '符合', FAIL: '不符合', NA: '不适用' };

export default function FormEditor(props: {
  id: number;
  code: string;
  status: string;
  fields: FieldDef[];
  checks: CheckRow[];
  items: ItemRow[];
  data: Record<string, string>;
  steps: StepRow[];
  nextStep: number | null;
  nextRole: string;
  currentRole: string;
  canSign: boolean;
  submittedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  templateChecks: { key: string; label: string }[];
}) {
  const router = useRouter();
  const editable = props.status === 'DRAFT';
  const signable = props.status === 'SUBMITTED';

  const [data, setData] = useState<Record<string, string>>(props.data);
  const [checks, setChecks] = useState<CheckRow[]>(props.checks);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg({ type: 'err', text: `${res.status} · ${d.error}` });
        return false;
      }
      setMsg({ type: 'ok', text: '已保存' });
      router.refresh();
      return true;
    } catch {
      setMsg({ type: 'err', text: '网络异常' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function save() {
    void post(`/api/forms/${props.id}/save`, { data, checks });
  }
  function submit() {
    void (async () => {
      const okSave = await post(`/api/forms/${props.id}/save`, { data, checks });
      if (!okSave) return;
      await post(`/api/forms/${props.id}/submit`, {});
    })();
  }
  function sign(decision: 'APPROVE' | 'REJECT') {
    void post(`/api/forms/${props.id}/sign`, {
      stepNo: props.nextStep,
      decision,
      comment: comment.trim() || null,
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">一、基本信息</div>
          <span className="text-[11px] text-slate-400">
            创建 {props.createdAt}　·　提交 {props.submittedAt ?? '—'}　·　批准 {props.closedAt ?? '—'}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {props.fields.map((f) => (
            <div key={f.key} className={f.kind === 'textarea' ? 'sm:col-span-2' : ''}>
              <label className={labelCls}>
                {f.label}
                {f.required ? <span className="ml-1 text-rose-500">*</span> : null}
              </label>
              {f.kind === 'textarea' ? (
                <textarea
                  className={inputCls}
                  rows={3}
                  disabled={!editable}
                  placeholder={f.placeholder}
                  value={data[f.key] ?? ''}
                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                />
              ) : f.kind === 'select' ? (
                <select
                  className={inputCls}
                  disabled={!editable}
                  value={data[f.key] ?? ''}
                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                >
                  <option value="">请选择</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputCls}
                  type={f.kind === 'date' ? 'date' : 'text'}
                  disabled={!editable}
                  placeholder={f.placeholder}
                  value={data[f.key] ?? ''}
                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        {editable ? (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-400">带 * 为必填；空白项不允许提交</span>
            <button className={btnGhost} onClick={save} disabled={busy}>
              {busy ? '处理中…' : '保存内容'}
            </button>
          </div>
        ) : null}
      </Card>

      {props.items.length ? (
        <Card padded={false}>
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
            二、清单（{props.items.length} 项，由系统按当前状态自动带出）
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr>
                  <Th className="w-40">编号 / 件号</Th>
                  <Th>名称</Th>
                  <Th className="w-64">版本 / 说明</Th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((it, idx) => (
                  <tr key={`${it.key}-${idx}`}>
                    <Td className="font-mono text-xs">{it.key}</Td>
                    <Td className="text-xs">{it.label}</Td>
                    <Td className="text-xs text-slate-500">{it.value}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {checks.length ? (
        <Card padded={false}>
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
            {props.items.length ? '三' : '二'}、检查单（逐项判定，不允许留空白；不适用请选「不适用」）
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <Th>检查项目</Th>
                  <Th className="w-36">判定</Th>
                  <Th className="w-72">说明</Th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, idx) => (
                  <tr key={c.key}>
                    <Td className="text-xs">{c.label}</Td>
                    <Td>
                      <select
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                        disabled={!editable}
                        value={c.result}
                        onChange={(e) => {
                          const next = checks.slice();
                          next[idx] = { ...c, result: e.target.value as CheckRow['result'] };
                          setChecks(next);
                        }}
                      >
                        {Object.entries(RESULT_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td>
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        disabled={!editable}
                        placeholder="可填说明"
                        value={c.note ?? ''}
                        onChange={(e) => {
                          const next = checks.slice();
                          next[idx] = { ...c, note: e.target.value };
                          setChecks(next);
                        }}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card padded={false}>
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
          签署（按顺序签，不可跳步；同一人不能签两步）
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <Th className="w-14">步</Th>
                <Th>环节</Th>
                <Th className="w-40">岗位</Th>
                <Th className="w-28">签署人</Th>
                <Th className="w-20">结论</Th>
                <Th>意见</Th>
                <Th className="w-40">时间</Th>
              </tr>
            </thead>
            <tbody>
              {props.steps.map((s) => (
                <tr key={s.step_no}>
                  <Td className="text-xs">{s.step_no}</Td>
                  <Td className="text-xs">{s.step_name}</Td>
                  <Td className="text-xs text-slate-500">{s.role_label}</Td>
                  <Td className="text-xs">{s.signer_name ?? '—'}</Td>
                  <Td className="text-xs">
                    {s.decision === 'APPROVE' ? (
                      <Badge tone="green">同意</Badge>
                    ) : s.decision === 'REJECT' ? (
                      <Badge tone="red">驳回</Badge>
                    ) : (
                      <Badge tone={props.nextStep === s.step_no && signable ? 'amber' : 'gray'}>
                        {props.nextStep === s.step_no && signable ? '待签' : '—'}
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{s.comment ?? '—'}</Td>
                  <Td className="text-xs text-slate-400">{s.signed_at ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        {msg ? (
          <div className={`mb-3 text-xs ${msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</div>
        ) : null}

        {editable ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs leading-5 text-slate-500">
              提交后不能修改。系统会检查：必填项是否齐全、检查单是否逐项判定、有没有「不符合」项。
            </div>
            <button className={btnPrimary} onClick={submit} disabled={busy}>
              {busy ? '处理中…' : '提交送签'}
            </button>
          </div>
        ) : signable ? (
          <div className="space-y-3">
            <div className="text-xs leading-5 text-slate-600">
              下一步是第 <b>{props.nextStep}</b> 步「{props.steps.find((s) => s.step_no === props.nextStep)?.step_name}」，
              需要岗位 <b>{props.nextRole}</b>。你当前的岗位是 <b>{props.currentRole}</b>。
              {props.canSign ? '　✅ 你可以签署。' : '　（当前账号不是该岗位，切换对应账号登录后再签）'}
            </div>
            <input
              className={inputCls}
              placeholder="签署意见（可留空）"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button className={btnPrimary} onClick={() => sign('APPROVE')} disabled={busy || !props.canSign}>
                {busy ? '处理中…' : '同意'}
              </button>
              <button
                className={btnGhost + ' !border-rose-300 !text-rose-700'}
                onClick={() => sign('REJECT')}
                disabled={busy || !props.canSign}
              >
                驳回
              </button>
              <span className="text-[11px] text-slate-400">驳回后本单终止，需重新新建一张</span>
            </div>
          </div>
        ) : (
          <div className="text-xs leading-5 text-slate-600">
            {props.status === 'APPROVED'
              ? '✅ 本单已全部签署批准，可以作为后续操作的依据（冻结 / 建立变更 / 偏离生效），并可单独打印归档。'
              : props.status === 'REJECTED'
                ? '本单已被驳回，不能再签署。请重新新建一张申请单。'
                : '本单当前状态不支持操作。'}
          </div>
        )}
      </Card>
    </div>
  );
}
