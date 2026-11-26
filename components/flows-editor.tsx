'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Card, Empty, btnGhost, btnPrimary, inputCls, labelCls } from './ui';

interface Step {
  scene: string;
  step_no: number;
  step_name: string;
  form_code: string;
  role_label: string;
  gate: number;
  enabled: number;
  note: string;
}
interface Field {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'date' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}
interface Tpl {
  id: number;
  code: string;
  name: string;
  scene: string;
  status: string;
  requires_items: number;
  note: string;
  fields: Field[];
  checks: { key: string; label: string }[];
  signoffs: { step_no: number; step_name: string; role_label: string }[];
}

const cell = 'w-full rounded border border-slate-300 px-2 py-1 text-xs';

export default function FlowsEditor({
  initialScenes,
  initialSteps,
  initialTemplates,
}: {
  initialScenes: string[];
  initialSteps: Step[];
  initialTemplates: Tpl[];
}) {
  const router = useRouter();
  const [scenes, setScenes] = useState(initialScenes);
  const [steps, setSteps] = useState(initialSteps);
  const [templates, setTemplates] = useState(initialTemplates);
  const [scene, setScene] = useState(initialScenes[0] ?? '');
  const [code, setCode] = useState(initialTemplates[0]?.code ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [newScene, setNewScene] = useState('');
  const [newTpl, setNewTpl] = useState({ code: '', name: '', scene: '' });

  const curSteps = steps.filter((s) => s.scene === scene);
  const tpl = templates.find((t) => t.code === code);

  async function post(body: unknown, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg({ type: 'err', text: `${res.status} · ${d.error}` });
        return false;
      }
      setMsg({ type: 'ok', text: okText });
      router.refresh();
      return true;
    } catch {
      setMsg({ type: 'err', text: '网络异常' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function setStep(i: number, patch: Partial<Step>) {
    const globalIdx = steps.findIndex((s) => s === curSteps[i]);
    const next = steps.slice();
    next[globalIdx] = { ...next[globalIdx], ...patch };
    setSteps(next);
  }
  function delStep(i: number) {
    const target = curSteps[i];
    setSteps(steps.filter((s) => s !== target));
  }
  function addStep() {
    setSteps([
      ...steps,
      {
        scene,
        step_no: curSteps.length + 1,
        step_name: '',
        form_code: '',
        role_label: '',
        gate: 0,
        enabled: 1,
        note: '',
      },
    ]);
  }
  function saveFlow() {
    void post(
      { action: 'save_flow', scene, steps: curSteps.map((s, i) => ({ ...s, step_no: i + 1 })) },
      `流程「${scene}」已保存（${curSteps.length} 步），立即生效`,
    );
  }

  function patchTpl(patch: Partial<Tpl>) {
    setTemplates(templates.map((t) => (t.code === code ? { ...t, ...patch } : t)));
  }
  function saveTpl() {
    if (!tpl) return;
    void post(
      {
        action: 'save_template',
        code: tpl.code,
        name: tpl.name,
        scene: tpl.scene,
        note: tpl.note,
        requires_items: tpl.requires_items,
        fields: tpl.fields,
        checks: tpl.checks,
        signoffs: tpl.signoffs,
      },
      `表单模板「${tpl.name}」已保存，立即生效`,
    );
  }
  async function toggleTpl() {
    if (!tpl) return;
    const status = tpl.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
    const ok = await post({ action: 'toggle_template', code: tpl.code, status }, `模板已设为 ${status}`);
    if (ok) patchTpl({ status });
  }
  function addTemplate() {
    if (!newTpl.code.trim() || !newTpl.name.trim()) {
      setMsg({ type: 'err', text: '请填代号与名称' });
      return;
    }
    const t: Tpl = {
      id: 0,
      code: newTpl.code.trim(),
      name: newTpl.name.trim(),
      scene: newTpl.scene.trim() || newTpl.code.trim(),
      status: 'ACTIVE',
      requires_items: 0,
      note: '',
      fields: [{ key: 'f1', label: '说明', kind: 'text', required: true, placeholder: '' }],
      checks: [{ key: 'c1', label: '检查项一' }],
      signoffs: [{ step_no: 1, step_name: '申请', role_label: '设计工程师' }],
    };
    void (async () => {
      const ok = await post(
        {
          action: 'save_template',
          ...t,
          fields: t.fields,
          checks: t.checks,
          signoffs: t.signoffs,
        },
        `已新增模板「${t.name}」`,
      );
      if (ok) {
        setTemplates([...templates, t]);
        setCode(t.code);
        setNewTpl({ code: '', name: '', scene: '' });
      }
    })();
  }

  return (
    <div className="space-y-5">
      {msg ? (
        <div className={`rounded-lg border px-4 py-2.5 text-xs ${msg.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {msg.text}
        </div>
      ) : null}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-800">一、流程步骤</div>
          <div className="flex items-center gap-2">
            <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" value={scene} onChange={(e) => setScene(e.target.value)}>
              {scenes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              style={{ width: 140 }}
              placeholder="新场景代号"
              value={newScene}
              onChange={(e) => setNewScene(e.target.value)}
            />
            <button
              className={btnGhost + ' !px-2.5 !py-1 !text-xs'}
              onClick={() =>
                void (async () => {
                  if (!newScene.trim()) return;
                  const ok = await post({ action: 'add_scene', scene: newScene.trim() }, `已新增流程场景「${newScene.trim()}」`);
                  if (ok) {
                    setScenes([...scenes, newScene.trim()]);
                    setScene(newScene.trim());
                    setSteps([
                      ...steps,
                      { scene: newScene.trim(), step_no: 1, step_name: '提交申请', form_code: '', role_label: '设计工程师', gate: 1, enabled: 1, note: '' },
                    ]);
                    setNewScene('');
                  }
                })()
              }
              disabled={busy}
            >
              + 新场景
            </button>
          </div>
        </div>

        {curSteps.length === 0 ? (
          <Empty>这个场景还没有步骤，点下面「＋ 加一步」</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] text-slate-500">
                  <th className="w-12 px-2 py-2">步</th>
                  <th className="px-2 py-2">环节名称</th>
                  <th className="w-52 px-2 py-2">该步出哪张表</th>
                  <th className="w-36 px-2 py-2">签署岗位</th>
                  <th className="w-20 px-2 py-2">闸门</th>
                  <th className="w-20 px-2 py-2">启用</th>
                  <th className="w-14 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {curSteps.map((s, i) => (
                  <tr key={`${s.scene}-${i}`} className="border-b border-slate-100">
                    <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <input className={cell} value={s.step_name} onChange={(e) => setStep(i, { step_name: e.target.value })} placeholder="例如：可行性评审" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select className={cell} value={s.form_code} onChange={(e) => setStep(i, { form_code: e.target.value })}>
                        <option value="">（不出单）</option>
                        {templates.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={cell} value={s.role_label} onChange={(e) => setStep(i, { role_label: e.target.value })} placeholder="岗位名" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={!!s.gate} onChange={(e) => setStep(i, { gate: e.target.checked ? 1 : 0 })} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={!!s.enabled} onChange={(e) => setStep(i, { enabled: e.target.checked ? 1 : 0 })} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button className="text-rose-500 hover:text-rose-700" onClick={() => delStep(i)}>
                        删
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className={btnGhost + ' !px-2.5 !py-1 !text-xs'} onClick={addStep}>
              ＋ 加一步
            </button>
            <span className="text-[11px] text-slate-400">勾「闸门」＝这步没批准，后面不许做</span>
          </div>
          <button className={btnPrimary} onClick={saveFlow} disabled={busy || !scene}>
            {busy ? '处理中…' : '保存这个流程'}
          </button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-800">二、表单模板（单子长什么样）</div>
          <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" value={code} onChange={(e) => setCode(e.target.value)}>
            {templates.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}（{t.code}）
              </option>
            ))}
          </select>
        </div>

        {!tpl ? (
          <Empty>还没有模板，用右下角新增一张</Empty>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>单据名称</label>
                <input className={inputCls} value={tpl.name} onChange={(e) => patchTpl({ name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>场景代号</label>
                <input className={inputCls} value={tpl.scene} onChange={(e) => patchTpl({ scene: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>说明</label>
                <input className={inputCls} value={tpl.note} onChange={(e) => patchTpl({ note: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>字段（填什么）</span>
                <button
                  className="text-indigo-600 hover:text-indigo-800"
                  onClick={() => patchTpl({ fields: [...tpl.fields, { key: `f${tpl.fields.length + 1}`, label: '新字段', kind: 'text', required: false, placeholder: '' }] })}
                >
                  ＋ 加字段
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <tbody>
                    {tpl.fields.map((f, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="w-32 px-1 py-1"><input className={cell} value={f.key} onChange={(e) => { const n = tpl.fields.slice(); n[i] = { ...f, key: e.target.value }; patchTpl({ fields: n }); }} /></td>
                        <td className="px-1 py-1"><input className={cell} value={f.label} onChange={(e) => { const n = tpl.fields.slice(); n[i] = { ...f, label: e.target.value }; patchTpl({ fields: n }); }} /></td>
                        <td className="w-28 px-1 py-1">
                          <select className={cell} value={f.kind} onChange={(e) => { const n = tpl.fields.slice(); n[i] = { ...f, kind: e.target.value as Field['kind'] }; patchTpl({ fields: n }); }}>
                            <option value="text">单行</option><option value="textarea">多行</option><option value="date">日期</option><option value="select">下拉</option>
                          </select>
                        </td>
                        <td className="w-16 px-1 py-1 text-center">
                          <label className="text-[11px] text-slate-500">必填 <input type="checkbox" checked={!!f.required} onChange={(e) => { const n = tpl.fields.slice(); n[i] = { ...f, required: e.target.checked }; patchTpl({ fields: n }); }} /></label>
                        </td>
                        <td className="w-12 px-1 py-1 text-center"><button className="text-rose-500" onClick={() => patchTpl({ fields: tpl.fields.filter((_, x) => x !== i) })}>删</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>检查单（逐项判定）</span>
                <button className="text-indigo-600 hover:text-indigo-800" onClick={() => patchTpl({ checks: [...tpl.checks, { key: `c${tpl.checks.length + 1}`, label: '新检查项' }] })}>＋ 加检查项</button>
              </div>
              {tpl.checks.map((c, i) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <input className={cell + ' !w-28'} value={c.key} onChange={(e) => { const n = tpl.checks.slice(); n[i] = { ...c, key: e.target.value }; patchTpl({ checks: n }); }} />
                  <input className={cell} value={c.label} onChange={(e) => { const n = tpl.checks.slice(); n[i] = { ...c, label: e.target.value }; patchTpl({ checks: n }); }} />
                  <button className="text-rose-500" onClick={() => patchTpl({ checks: tpl.checks.filter((_, x) => x !== i) })}>删</button>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>签字位（谁按什么顺序签）</span>
                <button className="text-indigo-600 hover:text-indigo-800" onClick={() => patchTpl({ signoffs: [...tpl.signoffs, { step_no: tpl.signoffs.length + 1, step_name: '新环节', role_label: '设计工程师' }] })}>＋ 加一步签署</button>
              </div>
              {tpl.signoffs.map((s, i) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="w-6 text-[11px] text-slate-400">{i + 1}</span>
                  <input className={cell + ' !w-40'} value={s.step_name} onChange={(e) => { const n = tpl.signoffs.slice(); n[i] = { ...s, step_name: e.target.value }; patchTpl({ signoffs: n }); }} />
                  <input className={cell + ' !w-52'} value={s.role_label} onChange={(e) => { const n = tpl.signoffs.slice(); n[i] = { ...s, role_label: e.target.value }; patchTpl({ signoffs: n }); }} />
                  <button className="text-rose-500" onClick={() => patchTpl({ signoffs: tpl.signoffs.filter((_, x) => x !== i) })}>删</button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2">
                <Badge tone={tpl.status === 'ACTIVE' ? 'green' : 'gray'}>{tpl.status === 'ACTIVE' ? '已启用' : '已停用'}</Badge>
                <button className={btnGhost + ' !px-2.5 !py-1 !text-xs'} onClick={() => void toggleTpl()} disabled={busy}>
                  {tpl.status === 'ACTIVE' ? '停用这张模板' : '启用这张模板'}
                </button>
              </div>
              <button className={btnPrimary} onClick={saveTpl} disabled={busy}>
                {busy ? '处理中…' : '保存这张表单模板'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-800">三、新增一张表单模板</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className={labelCls}>代号（英文，不重复）</label><input className={inputCls} value={newTpl.code} onChange={(e) => setNewTpl({ ...newTpl, code: e.target.value })} placeholder="例如：MY_FORM" /></div>
          <div><label className={labelCls}>名称</label><input className={inputCls} value={newTpl.name} onChange={(e) => setNewTpl({ ...newTpl, name: e.target.value })} placeholder="例如：设计评审单" /></div>
          <div><label className={labelCls}>场景代号（留空同代号）</label><input className={inputCls} value={newTpl.scene} onChange={(e) => setNewTpl({ ...newTpl, scene: e.target.value })} placeholder="可留空" /></div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">新建时会给 1 个字段、1 个检查项、1 个签字位，之后在上面改。</span>
          <button className={btnGhost} onClick={addTemplate} disabled={busy}>＋ 新增模板</button>
        </div>
      </Card>
    </div>
  );
}
