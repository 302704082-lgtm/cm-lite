'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IMPACT_VALUES, CRITICALITY_NAMES } from '@/lib/constants';
import type { PublicRules } from '@/lib/profile';
import { btnGhost, btnPrimary, inputCls, labelCls } from './ui';

type ImpactValue = 'YES' | 'NO' | 'TBD';

const CHECK3F = [
  { key: 'f_fit', label: 'Fit · 配合', hint: '安装接口、配合尺寸是否变化' },
  { key: 'f_form', label: 'Form · 外形', hint: '外形、重量、包络是否变化' },
  { key: 'f_function', label: 'Function · 功能', hint: '功能、性能、软件逻辑是否变化' },
] as const;

const CRITERIA = [
  { key: 'abca', label: 'A', text: '触及功能/性能，或超出分配基线限值' },
  { key: 'abcb', label: 'B', text: '设计冻结之后更改，且影响质量一致性' },
  { key: 'abcc', label: 'C', text: '对互换性、手册、成本进度、适航有重大影响' },
] as const;

export default function CrWizard({
  prId,
  prCode,
  model,
  ci,
  title,
  reason,
  rules,
}: {
  prId: number;
  prCode: string;
  model: string;
  ci: { pn: string; name: string; rev: string; criticality: string };
  title: string;
  reason: string | null;
  rules: PublicRules;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<1 | 2 | 3>(1);
  const [f3, setF3] = useState({ f_fit: false, f_form: false, f_function: false });
  const [abc, setAbc] = useState({ abca: false, abcb: false, abcc: false });
  const [cls, setCls] = useState<string>('');
  const [classReason, setClassReason] = useState('');
  const [impact, setImpact] = useState<Record<string, ImpactValue | ''>>(
    Object.fromEntries(rules.impacts.map((i) => [i.key, ''])),
  );
  const [wipAction, setWipAction] = useState('');
  const [toRev, setToRev] = useState('');
  const [newPn, setNewPn] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const anyF3 = f3.f_fit || f3.f_form || f3.f_function;
  const anyAbc = abc.abca || abc.abcb || abc.abcc;
  const strictCode = rules.classes[0]?.code ?? '';
  const looseCode = rules.classes[rules.classes.length - 1]?.code ?? '';
  const normalCode = rules.classes[1]?.code ?? strictCode;
  const strictLabel = rules.classes[0]?.label ?? strictCode;
  const recommended = anyAbc ? strictCode : normalCode;
  const critical = ci.criticality === 'KEY' || ci.criticality === 'IMPORTANT';
  const looseBlocked = anyAbc || critical;
  const impactDone = rules.impacts.every((i) => impact[i.key] !== '');
  const wipKey = rules.impacts.find((i) => /在制品|WIP/i.test(i.label))?.key;
  const wipYes = !!wipKey && impact[wipKey] === 'YES';

  const missingImpact = useMemo(
    () => rules.impacts.filter((i) => impact[i.key] === '').map((i) => i.label),
    [impact, rules.impacts],
  );

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/changes/${prId}/to-cr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          ci_pn: ci.pn,
          from_rev: ci.rev,
          to_rev: toRev || null,
          new_pn: newPn || null,
          title,
          reason,
          ...f3,
          ...abc,
          class_result: cls || recommended,
          class_reason: classReason || null,
          impact,
          wip_action: wipAction || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(`${res.status} · ${data.error}`);
        return;
      }
      router.push(`/app/changes/${data.id}`);
    } catch {
      setErr('网络异常，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-xs">
        {(
          [
            [1, '3F 预判'],
            [2, '严格判据'],
            [3, '定级与影响分析'],
          ] as const
        ).map(([n, label]) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                screen === n
                  ? 'bg-indigo-600 text-white'
                  : screen > n
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {screen > n ? '✓' : n}
            </div>
            <span className={screen === n ? 'font-medium text-slate-800' : 'text-slate-400'}>{label}</span>
            {n < 3 ? <span className="mx-1 text-slate-300">→</span> : null}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-5 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
          单号 {prCode} · 对象 <span className="font-mono">{ci.pn}</span> {ci.name}（当前版本{' '}
          <span className="font-mono">{ci.rev}</span>）
          {critical ? (
            <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 ring-1 ring-inset ring-rose-200">
              {CRITICALITY_NAMES[ci.criticality]} · 强制「{strictLabel}」
            </span>
          ) : null}
          {rules.enabled ? (
            <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 ring-1 ring-inset ring-emerald-200">
              按「{rules.name}」执行
            </span>
          ) : null}
        </div>

        {screen === 1 ? (
          <div>
            <div className="mb-1 text-sm font-semibold text-slate-800">屏 1 · 3F 快速预判</div>
            <p className="mb-4 text-xs text-slate-500">
              3F 只是预判，用来快速识别「像不像大改」；终判依据屏 2 的严格判据。
            </p>
            <div className="space-y-2">
              {CHECK3F.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={f3[c.key]}
                    onChange={(e) => setF3({ ...f3, [c.key]: e.target.checked })}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{c.label}</span>
                    <span className="block text-xs text-slate-500">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {anyF3 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                3F 任一命中 —— 很可能「{strictLabel}」；
                {rules.switches.threeFNewPn
                  ? '且按大改处理：不允许原地升版，必须给新件号。'
                  : '当前配置未开启「3F 强制换号」，可只升版本。'}
              </div>
            ) : (
              <div className="mt-4 text-xs text-slate-400">3F 全未命中，仍需在屏 2 逐条核对严格判据。</div>
            )}

            <div className="mt-6 flex justify-end">
              <button className={btnPrimary} onClick={() => setScreen(2)}>
                下一步：严格判据
              </button>
            </div>
          </div>
        ) : null}

        {screen === 2 ? (
          <div>
            <div className="mb-1 text-sm font-semibold text-slate-800">屏 2 · 严格判据</div>
            <p className="mb-4 text-xs text-slate-500">
              任一命中即建议「{strictLabel}」；全部未命中建议「{rules.classes.find((c) => c.code === normalCode)?.label ?? normalCode}」。
            </p>
            <div className="space-y-2">
              {CRITERIA.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={abc[c.key]}
                    onChange={(e) => setAbc({ ...abc, [c.key]: e.target.checked })}
                  />
                  <span>
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[11px] font-semibold text-slate-600">
                      {c.label}
                    </span>
                    <span className="text-sm text-slate-800">{c.text}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600">
              系统建议：
              <span className="ml-1 font-semibold text-slate-900">
                「{rules.classes.find((c) => c.code === recommended)?.label ?? recommended}」
              </span>
              {anyAbc ? '（严格判据已命中）' : '（严格判据均未命中）'}
            </div>

            <div className="mt-6 flex justify-between">
              <button className={btnGhost} onClick={() => setScreen(1)}>
                上一步
              </button>
              <button className={btnPrimary} onClick={() => setScreen(3)}>
                下一步：定级与影响分析
              </button>
            </div>
          </div>
        ) : null}

        {screen === 3 ? (
          <div>
            <div className="mb-1 text-sm font-semibold text-slate-800">屏 3 · 确认类别</div>
            <p className="mb-4 text-xs text-slate-500">
              允许人工改级，但必须留下改级理由：3F 只是预判，终判依据屏 2。
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {rules.classes.map((c) => {
                const disabled = c.code === looseCode && looseBlocked;
                const activeCls = (cls || recommended) === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    disabled={disabled}
                    onClick={() => setCls(c.code)}
                    className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
                      activeCls
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <div className="font-semibold">
                      {c.label}
                      {c.code === recommended ? (
                        <span className="ml-1.5 rounded bg-white px-1 text-[10px] text-indigo-600">判据建议</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {rules.chainLengths[c.code] ?? 0} 步审批
                      {rules.chainRoles[c.code]?.length
                        ? `：${rules.chainRoles[c.code].join(' → ')}`
                        : ''}
                    </div>
                  </button>
                );
              })}
            </div>

            {looseBlocked ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
                {critical
                  ? `关键件/重要件强制「${strictLabel}」，不可改级。`
                  : '严格判据已命中，不允许定为最宽松类别。'}
              </div>
            ) : null}

            {rules.switches.classReason && (cls || recommended) !== recommended ? (
              <div className="mt-3">
                <label className={labelCls}>改级理由（改级必填）</label>
                <input
                  className={inputCls}
                  value={classReason}
                  onChange={(e) => setClassReason(e.target.value)}
                  placeholder="说明为什么与判据建议不一致"
                />
              </div>
            ) : null}

            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">
                  影响分析（{rules.impacts.length} 项，逐项必选）
                </div>
                <div className={`text-xs ${impactDone ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {impactDone ? '已填完' : `还差 ${missingImpact.length} 项`}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {rules.impacts.map((item) => (
                  <div key={item.key} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="mb-1.5 text-xs font-medium text-slate-700">{item.label}</div>
                    <div className="flex gap-1">
                      {IMPACT_VALUES.map((v) => (
                        <button
                          key={v.value}
                          type="button"
                          onClick={() => setImpact({ ...impact, [item.key]: v.value })}
                          className={`flex-1 rounded px-1.5 py-1 text-[11px] transition ${
                            impact[item.key] === v.value
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {wipYes && rules.switches.wipAction ? (
                <div className="mt-3">
                  <label className={labelCls}>在制品处理意见（在制品=有，必填）</label>
                  <input
                    className={inputCls}
                    value={wipAction}
                    onChange={(e) => setWipAction(e.target.value)}
                    placeholder="例如：在制品 3 台，拆解回用旧件"
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="mb-3 text-sm font-semibold text-slate-800">落库方式</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>目标版本 {anyF3 ? '（大改时可不填）' : '*'}</label>
                  <input
                    className={inputCls}
                    value={toRev}
                    onChange={(e) => setToRev(e.target.value)}
                    placeholder={ci.rev.startsWith('V') ? 'V1.2' : 'B'}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    新件号 {anyF3 && rules.switches.threeFNewPn ? '*' : '（不改号可空）'}
                  </label>
                  <input
                    className={inputCls}
                    value={newPn}
                    onChange={(e) => setNewPn(e.target.value)}
                    placeholder={`${rules.ident.pn_prefix || rules.ident.model_code}${rules.ident.pn_sep}XXX${rules.ident.pn_sep}001A`}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                {anyF3 && rules.switches.threeFNewPn
                  ? '3F 命中判为大改：执行时按新件号新建构型项，原件号作废。'
                  : '不换号：执行时直接把该构型项版本从当前版本升到目标版本。'}
              </p>
            </div>

            {err ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
                {err}
              </div>
            ) : null}

            <div className="mt-6 flex justify-between">
              <button className={btnGhost} onClick={() => setScreen(2)}>
                上一步
              </button>
              <button className={btnPrimary} onClick={submit} disabled={busy}>
                {busy ? '提交中…' : '提交并生成审批链'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
