'use client';

import { useMemo, useState } from 'react';
import { Badge, Card, btnGhost, btnPrimary, inputCls } from '@/components/ui';
import {
  SECTIONS,
  type PreviewResult,
  type ProfileStep,
} from '@/lib/rule-config';

function splitList(v: string | undefined): string[] {
  return (v ?? '')
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function RulesForm({
  initialValues,
  initialSteps,
  initialBlank,
}: {
  initialValues: Record<string, string>;
  initialSteps: ProfileStep[];
  initialBlank: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [steps, setSteps] = useState<ProfileStep[]>(initialSteps);
  const [busy, setBusy] = useState<'save' | 'preview' | null>(null);
  const [msg, setMsg] = useState<string>(initialBlank ? '当前是空白：一个格子都没填，等你来填。' : '已载入上次保存的草稿。');
  const [result, setResult] = useState<PreviewResult | null>(null);

  const classes = useMemo(() => splitList(values.class_codes), [values.class_codes]);
  const labels = useMemo(() => splitList(values.class_labels), [values.class_labels]);
  const roles = useMemo(() => splitList(values.roles), [values.roles]);

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function stepsOf(cls: string) {
    return steps.filter((s) => s.class_code === cls).sort((a, b) => a.step_no - b.step_no);
  }

  function addStep(cls: string) {
    const next = Math.max(0, ...stepsOf(cls).map((s) => s.step_no)) + 1;
    setSteps((prev) => [
      ...prev,
      { class_code: cls, step_no: next, step_name: '', role_code: roles[0] ?? '' },
    ]);
  }

  function updateStep(cls: string, no: number, patch: Partial<ProfileStep>) {
    setSteps((prev) =>
      prev.map((s) => (s.class_code === cls && s.step_no === no ? { ...s, ...patch } : s)),
    );
  }

  function removeStep(cls: string, no: number) {
    const kept = steps
      .filter((s) => !(s.class_code === cls && s.step_no === no))
      .sort((a, b) => a.step_no - b.step_no);
    let n = 1;
    for (const s of kept) {
      if (s.class_code === cls) s.step_no = n++;
    }
    setSteps(kept);
  }

  async function save() {
    setBusy('save');
    setMsg('正在保存…');
    try {
      const r = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, steps }),
      });
      const j = await r.json();
      setMsg(j.error ? `保存失败：${j.error}` : `草稿已保存（${j.filled} 个格子有值，${steps.length} 条步骤）。还没启用，不影响现有演示数据。`);
    } catch (e) {
      setMsg(`保存失败：${e instanceof Error ? e.message : '网络错误'}`);
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    setBusy('preview');
    setResult(null);
    setMsg('正在按你填的规矩推演…');
    try {
      const r = await fetch('/api/rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, steps }),
      });
      const j = (await r.json()) as PreviewResult;
      setResult(j);
      setMsg(j.ok ? '试跑完成：能跑通，下面看结果。' : '试跑完成：还差格子，下面看缺什么。');
    } catch (e) {
      setMsg(`试跑失败：${e instanceof Error ? e.message : '网络错误'}`);
    } finally {
      setBusy(null);
    }
  }

  function clearAll() {
    setValues({});
    setSteps([]);
    setResult(null);
    setMsg('已回到空白（只清了页面，库里的草稿要再点一次「保存草稿」才会被覆盖）。');
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-700">{msg}</div>
          <div className="flex items-center gap-2">
            <button className={btnGhost} onClick={clearAll} disabled={busy !== null}>
              回到空白
            </button>
            <button className={btnGhost} onClick={save} disabled={busy !== null}>
              {busy === 'save' ? '保存中…' : '保存草稿'}
            </button>
            <button className={btnPrimary} onClick={runPreview} disabled={busy !== null}>
              {busy === 'preview' ? '推演中…' : '试跑：看能不能跑通'}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          灰色小字是「你们公司可能是这样」的建议值，仅供参考，<span className="font-medium text-slate-600">不会自动填进去</span>。
          试跑是沙盒推演，不写构型项、不写变更单、不动现有演示数据。
        </p>
      </Card>

      {SECTIONS.map((sec) => (
        <Card key={sec.key}>
          <div className="mb-4 border-b border-slate-100 pb-3">
            <div className="text-sm font-semibold text-slate-800">{sec.title}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{sec.desc}</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {sec.fields.map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-slate-700" htmlFor={`f_${f.key}`}>
                  {f.label}
                  {f.required ? <span className="ml-1 text-rose-500">*</span> : null}
                </label>
                <div className="mt-0.5 text-[11px] text-slate-400">{f.hint}</div>
                <div className="mt-0.5 text-[11px] text-indigo-500">
                  你们公司可能是这样：{f.suggestion}
                </div>
                <div className="mt-1.5">
                  {f.kind === 'switch' ? (
                    <select
                      id={`f_${f.key}`}
                      className={inputCls}
                      value={values[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                    >
                      <option value="">（未填）</option>
                      <option value="是">是</option>
                      <option value="否">否</option>
                    </select>
                  ) : (
                    <input
                      id={`f_${f.key}`}
                      className={inputCls}
                      type={f.kind === 'number' ? 'number' : 'text'}
                      placeholder={f.placeholder}
                      value={values[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <div className="mb-4 border-b border-slate-100 pb-3">
          <div className="text-sm font-semibold text-slate-800">六 · 每个类别要走哪几步（第一层的重复行）</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            先在「二」里填好类别代号，这里才会出现分组。每行填「这一步叫什么」和「谁来签」。
          </div>
        </div>
        {classes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            还没填类别代号，先去上面「二 · 更改分几类、谁签」填一个，比如 I,II,III
          </div>
        ) : (
          <div className="space-y-5">
            {classes.map((cls, i) => (
              <div key={cls} className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <Badge tone="blue">{cls}</Badge>
                    <span>{labels[i] ?? '（没填中文名）'}</span>
                    <span className="text-xs font-normal text-slate-400">
                      {stepsOf(cls).length} 步
                    </span>
                  </div>
                  <button
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    onClick={() => addStep(cls)}
                  >
                    ＋ 加一步
                  </button>
                </div>
                {stepsOf(cls).length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400">这个类别还没配步骤，点右上「加一步」。</div>
                ) : (
                  <div className="space-y-2 p-3">
                    {stepsOf(cls).map((s) => (
                      <div key={s.step_no} className="grid grid-cols-12 items-center gap-2">
                        <div className="col-span-1 text-xs text-slate-400">{s.step_no}</div>
                        <input
                          className={`${inputCls} col-span-6`}
                          placeholder="这一步叫什么，例如 拟制 / 构型审核"
                          value={s.step_name}
                          onChange={(e) => updateStep(cls, s.step_no, { step_name: e.target.value })}
                        />
                        <select
                          className={`${inputCls} col-span-4`}
                          value={s.role_code}
                          onChange={(e) => updateStep(cls, s.step_no, { role_code: e.target.value })}
                        >
                          <option value="">（选角色）</option>
                          {(roles.length ? roles : ['设计', '构型', '质量', '适航']).map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                          {roles.length > 0 && s.role_code && !roles.includes(s.role_code) ? (
                            <option value={s.role_code}>{s.role_code}（不在清单）</option>
                          ) : null}
                        </select>
                        <button
                          className="col-span-1 rounded-md border border-rose-200 px-2 py-2 text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => removeStep(cls, s.step_no)}
                          title="删掉这一步"
                        >
                          删
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {result ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="text-sm font-semibold text-slate-800">试跑结果</div>
            <Badge tone={result.ok ? 'green' : 'red'}>{result.ok ? '能跑通' : '还跑不起来'}</Badge>
          </div>
          <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
            {result.summary}
          </div>

          {result.missing.length > 0 ? (
            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold text-rose-700">还差这些格子</div>
              <ul className="list-inside list-disc space-y-1 text-xs text-rose-700">
                {result.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.warnings.length > 0 ? (
            <div className="mb-4">
              <div className="mb-1.5 text-xs font-semibold text-amber-700">提醒（不挡路，但会影响好不好用）</div>
              <ul className="list-inside list-disc space-y-1 text-xs text-amber-700">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-700">按你填的规矩，件号长这样</div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-indigo-700">
                {result.sample_pn ?? '（缺件号规则，生成不出来）'}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-700">证据包目录（{result.evidence.length} 份）</div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-6 text-slate-600">
                {result.evidence.length ? result.evidence.join(' / ') : '（空的）'}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold text-slate-700">一条变更会走过哪些人</div>
            <div className="space-y-2">
              {result.chains.map((c) => (
                <div key={c.cls} className="rounded-lg border border-slate-200 px-3 py-2">
                  <div className="mb-1 text-xs font-medium text-slate-800">
                    {c.cls} · {c.label}
                  </div>
                  {c.steps.length ? (
                    <div className="text-xs leading-6 text-slate-600">{c.steps.join('　→　')}</div>
                  ) : (
                    <div className="text-xs text-rose-600">没配步骤</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-xs font-semibold text-slate-700">提变更时要逐项确认的事（{result.impact.length} 项）</div>
            <div className="text-xs leading-6 text-slate-600">
              {result.impact.length ? result.impact.join('、') : '（空的）'}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
