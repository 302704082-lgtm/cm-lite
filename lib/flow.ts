import { q, q1, insert, exec } from './db';
import { ApiError } from './api';
import { resolveRoleCode } from './profile';
import { ROLE_NAMES, type RoleCode } from './constants';
import { logEvent } from './events';
import type { SessionUser } from './session';

// ============================================================
// 受控表单引擎（v3 底座）
// 一张单子 = 模板（长什么样）+ 实例（这次填了什么）+ 签字（谁批的）
// 模板字段 / 检查项 / 签字位 / 流程步骤全部来自配置表，不写死在代码里。
// 闸门（冻结、建立变更、偏离生效）都查「有没有一张已批准的实例」。
// ============================================================

export interface FormField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'date' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface FormCheck {
  key: string;
  label: string;
}

export interface FormSignoff {
  step_no: number;
  step_name: string;
  role_label: string;
}

export interface FormTemplateRow {
  id: number;
  code: string;
  name: string;
  scene: string;
  fields_json: string;
  checklist_json: string;
  signoff_json: string;
  requires_items: number;
  status: string;
  note?: string | null;
}

export interface FormInstanceRow {
  id: number;
  tenant_id: number;
  template_id: number;
  code: string;
  scene: string;
  title: string;
  target_type: string;
  target_id: number;
  data_json: string;
  checklist_json: string;
  items_json: string;
  status: string;
  created_by: string;
  created_at: string;
  submitted_at: string | null;
  closed_at: string | null;
  template_name?: string;
}

export interface FormSignoffRow {
  id: number;
  instance_id: number;
  step_no: number;
  step_name: string;
  role_label: string;
  signer_user_id: number | null;
  signer_name: string | null;
  decision: string;
  comment: string | null;
  signed_at: string;
}

export interface FlowStepRow {
  id: number;
  scene: string;
  step_no: number;
  step_name: string;
  form_code: string;
  role_label: string;
  gate: number;
  enabled: number;
  note?: string | null;
}

export interface CheckResult {
  key: string;
  label: string;
  result: 'PENDING' | 'PASS' | 'FAIL' | 'NA';
  note?: string;
}

export interface FormItem {
  key: string;
  label: string;
  value: string;
}

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function templateFields(t: FormTemplateRow): FormField[] {
  return parse<FormField[]>(t.fields_json, []);
}
export function templateChecks(t: FormTemplateRow): FormCheck[] {
  return parse<FormCheck[]>(t.checklist_json, []);
}
export function templateSignoffs(t: FormTemplateRow): FormSignoff[] {
  return parse<FormSignoff[]>(t.signoff_json, [])
    .slice()
    .sort((a, b) => Number(a.step_no) - Number(b.step_no));
}
export function instanceData(i: FormInstanceRow): Record<string, string> {
  return parse<Record<string, string>>(i.data_json, {});
}
export function instanceChecks(i: FormInstanceRow): CheckResult[] {
  return parse<CheckResult[]>(i.checklist_json, []);
}
export function instanceItems(i: FormInstanceRow): FormItem[] {
  return parse<FormItem[]>(i.items_json, []);
}

const CODE_PREFIX: Record<string, string> = {
  BASELINE_RELEASE: 'BR',
  CHANGE_REQUEST: 'CRQ',
  CHANGE_REVIEW: 'CRV',
  VERIFICATION: 'VRF',
  CHANGE_NOTICE: 'NOT',
  DEVIATION: 'DEV',
  CONCESSION: 'CON',
};

/** 虚构通用单号（不沿用任何客户/行业单号格式） */
async function nextFormCode(tenantId: number, scene: string): Promise<string> {
  const prefix = CODE_PREFIX[scene] ?? 'FRM';
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const row = await q1<{ code: string }>(
    `SELECT code FROM form_instances WHERE tenant_id = ? AND code LIKE ? ORDER BY code DESC LIMIT 1`,
    [tenantId, like],
  );
  const seq = row ? Number(row.code.slice(`${prefix}-${year}-`.length)) + 1 : 1;
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

export async function getTemplates(tenantId: number, scene?: string): Promise<FormTemplateRow[]> {
  return scene
    ? q<FormTemplateRow>(
        `SELECT * FROM form_templates WHERE tenant_id = ? AND scene = ? AND status = 'ACTIVE' ORDER BY id`,
        [tenantId, scene],
      )
    : q<FormTemplateRow>(
        `SELECT * FROM form_templates WHERE tenant_id = ? AND status = 'ACTIVE' ORDER BY id`,
        [tenantId],
      );
}

export async function getTemplate(tenantId: number, code: string): Promise<FormTemplateRow | null> {
  return q1<FormTemplateRow>(
    `SELECT * FROM form_templates WHERE tenant_id = ? AND code = ? AND status = 'ACTIVE'`,
    [tenantId, code],
  );
}

export async function getFlow(tenantId: number, scene: string): Promise<FlowStepRow[]> {
  return q<FlowStepRow>(
    `SELECT * FROM flow_definitions WHERE tenant_id = ? AND scene = ? AND enabled = 1 ORDER BY step_no`,
    [tenantId, scene],
  );
}

export async function listInstances(
  tenantId: number,
  filter: { scene?: string; targetType?: string; targetId?: number; status?: string } = {},
): Promise<FormInstanceRow[]> {
  const where = ['i.tenant_id = ?'];
  const args: (string | number)[] = [tenantId];
  if (filter.scene) {
    where.push('i.scene = ?');
    args.push(filter.scene);
  }
  if (filter.targetType) {
    where.push('i.target_type = ?');
    args.push(filter.targetType);
  }
  if (filter.targetId !== undefined) {
    where.push('i.target_id = ?');
    args.push(filter.targetId);
  }
  if (filter.status) {
    where.push('i.status = ?');
    args.push(filter.status);
  }
  return q<FormInstanceRow>(
    `SELECT i.*, t.name AS template_name
       FROM form_instances i LEFT JOIN form_templates t ON t.id = i.template_id
      WHERE ${where.join(' AND ')} ORDER BY i.id DESC`,
    args,
  );
}

export async function getInstance(tenantId: number, id: number): Promise<FormInstanceRow | null> {
  return q1<FormInstanceRow>(
    `SELECT i.*, t.name AS template_name
       FROM form_instances i LEFT JOIN form_templates t ON t.id = i.template_id
      WHERE i.tenant_id = ? AND i.id = ?`,
    [tenantId, id],
  );
}

export async function getSignoffs(instanceId: number): Promise<FormSignoffRow[]> {
  return q<FormSignoffRow>(
    `SELECT * FROM form_signoffs WHERE instance_id = ? ORDER BY step_no`,
    [instanceId],
  );
}

export interface CreateInstanceInput {
  templateCode: string;
  targetType: string;
  targetId: number;
  data?: Record<string, string>;
  items?: FormItem[];
  title?: string;
  submit?: boolean; // true = 直接提交（用于自动带出的单子）
}

/** 生成一张受控表单实例。检查项初始为「待判定」，签字位由模板决定。 */
export async function createInstance(
  user: SessionUser,
  input: CreateInstanceInput,
): Promise<FormInstanceRow> {
  const t = await getTemplate(user.tenantId, input.templateCode);
  if (!t) throw new ApiError(400, `表单模板「${input.templateCode}」不存在或未启用`);

  const checks: CheckResult[] = templateChecks(t).map((c) => ({
    key: c.key,
    label: c.label,
    result: input.submit ? 'PASS' : 'PENDING',
  }));
  const data = input.data ?? {};
  if (input.submit) {
    // 自动提交时补齐必填字段的默认值，避免闸门被空值卡死
    for (const f of templateFields(t)) {
      if (f.required && !data[f.key]) data[f.key] = '（由系统按当前状态自动带出）';
    }
  }

  const code = await nextFormCode(user.tenantId, t.scene);
  const title = input.title?.trim() || t.name;
  const id = await insert(
    `INSERT INTO form_instances
       (tenant_id, template_id, code, scene, title, target_type, target_id,
        data_json, checklist_json, items_json, status, created_by, submitted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      user.tenantId,
      t.id,
      code,
      t.scene,
      title,
      input.targetType,
      input.targetId,
      JSON.stringify(data),
      JSON.stringify(checks),
      JSON.stringify(input.items ?? []),
      input.submit ? 'SUBMITTED' : 'DRAFT',
      user.name,
      input.submit ? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
    ],
  );

  await logEvent(
    user.tenantId,
    user.name,
    'FORM_CREATE',
    'form',
    id,
    `${code} ${title}${input.submit ? '（已提交待签）' : '（草稿）'}`,
  );

  const created = await getInstance(user.tenantId, id);
  if (!created) throw new ApiError(500, '表单创建失败');
  return created;
}

/** 保存字段与检查项判定（仅草稿可改） */
export async function saveInstance(
  user: SessionUser,
  id: number,
  data: Record<string, string>,
  checks: CheckResult[],
): Promise<void> {
  const inst = await getInstance(user.tenantId, id);
  if (!inst) throw new ApiError(404, '表单不存在');
  if (inst.status !== 'DRAFT') throw new ApiError(409, '该表单已提交，不能再修改');
  await exec(
    `UPDATE form_instances SET data_json = ?, checklist_json = ? WHERE id = ?`,
    [JSON.stringify(data), JSON.stringify(checks), id],
  );
  await logEvent(user.tenantId, user.name, 'FORM_SAVE', 'form', id, `${inst.code} 保存内容`);
}

/** 提交：必填字段齐、检查项逐项判定完毕，才允许送签 */
export async function submitInstance(user: SessionUser, id: number): Promise<void> {
  const inst = await getInstance(user.tenantId, id);
  if (!inst) throw new ApiError(404, '表单不存在');
  if (inst.status !== 'DRAFT') throw new ApiError(409, '该表单已提交，不能重复提交');
  const t = await q1<FormTemplateRow>(`SELECT * FROM form_templates WHERE id = ?`, [inst.template_id]);
  if (!t) throw new ApiError(500, '表单模板丢失');

  const data = instanceData(inst);
  const missing = templateFields(t).filter((f) => f.required && !(data[f.key] ?? '').trim());
  if (missing.length) throw new ApiError(400, `还有必填项没填：${missing.map((f) => f.label).join('、')}`);

  const checks = instanceChecks(inst);
  const undecided = checks.filter((c) => !c.result || c.result === 'PENDING');
  if (undecided.length) throw new ApiError(400, `检查单还有 ${undecided.length} 项未判定，请逐项选择符合 / 不符合 / 不适用`);
  const failed = checks.filter((c) => c.result === 'FAIL');
  if (failed.length) throw new ApiError(400, `检查单有 ${failed.length} 项「不符合」，需处理后再提交`);

  await exec(
    `UPDATE form_instances SET status = 'SUBMITTED', submitted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    [id],
  );
  await logEvent(user.tenantId, user.name, 'FORM_SUBMIT', 'form', id, `${inst.code} 提交送签`);
}

/** 签署：不可跳步、角色要匹配、同一人不能签两步、驳回即终止 */
export async function signInstance(
  user: SessionUser,
  id: number,
  stepNo: number,
  decision: 'APPROVE' | 'REJECT',
  comment: string | null,
): Promise<{ status: string }> {
  const inst = await getInstance(user.tenantId, id);
  if (!inst) throw new ApiError(404, '表单不存在');
  if (inst.status !== 'SUBMITTED') {
    throw new ApiError(409, `该表单当前为「${inst.status}」，不能签署`);
  }
  const t = await q1<FormTemplateRow>(`SELECT * FROM form_templates WHERE id = ?`, [inst.template_id]);
  if (!t) throw new ApiError(500, '表单模板丢失');
  const steps = templateSignoffs(t);
  const target = steps.find((s) => Number(s.step_no) === stepNo);
  if (!target) throw new ApiError(400, '签署步骤不存在');

  const signed = await getSignoffs(id);
  const doneNos = new Set(signed.map((s) => s.step_no));
  const pending = steps.find((s) => !doneNos.has(Number(s.step_no)));
  if (!pending) throw new ApiError(409, '该表单已全部签署完成');
  if (Number(pending.step_no) !== stepNo) {
    throw new ApiError(409, `不可跳步：请先完成第 ${pending.step_no} 步「${pending.step_name}」`);
  }

  // 岗位名 → 系统账号角色码
  const needed = resolveRoleCode(target.role_label) as RoleCode;
  if (needed !== user.role) {
    const need = ROLE_NAMES[needed] ?? target.role_label;
    const mine = ROLE_NAMES[user.role] ?? user.role;
    throw new ApiError(403, `权限不足：第 ${stepNo} 步需要「${need}」，当前为「${mine}」`);
  }
  const already = signed.find((s) => s.signer_user_id === user.userId);
  if (already) {
    throw new ApiError(409, `职责分离：你已签署第 ${already.step_no} 步「${already.step_name}」，不能签另一步`);
  }

  await insert(
    `INSERT INTO form_signoffs (instance_id, step_no, step_name, role_label, signer_user_id, signer_name, decision, comment)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, stepNo, target.step_name, target.role_label, user.userId, user.name, decision, comment ?? null],
  );

  let status = 'SUBMITTED';
  if (decision === 'REJECT') {
    status = 'REJECTED';
    await exec(
      `UPDATE form_instances SET status = 'REJECTED', closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      [id],
    );
  } else if (signed.length + 1 >= steps.length) {
    status = 'APPROVED';
    await exec(
      `UPDATE form_instances SET status = 'APPROVED', closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      [id],
    );
  }

  await logEvent(
    user.tenantId,
    user.name,
    decision === 'APPROVE' ? 'FORM_SIGN' : 'FORM_REJECT',
    'form',
    id,
    `${inst.code} 第 ${stepNo} 步「${target.step_name}」${decision === 'APPROVE' ? '同意' : '驳回'}${comment ? `：${comment}` : ''}`,
  );
  return { status };
}

/** 闸门：某对象必须有一张「已批准」的表单，否则拦住后续动作 */
export async function assertApproved(
  tenantId: number,
  scene: string,
  targetType: string,
  targetId: number,
  hint: string,
): Promise<FormInstanceRow> {
  const inst = await q1<FormInstanceRow>(
    `SELECT * FROM form_instances
      WHERE tenant_id = ? AND scene = ? AND target_type = ? AND target_id = ? AND status = 'APPROVED'
      ORDER BY id DESC LIMIT 1`,
    [tenantId, scene, targetType, targetId],
  );
  if (!inst) {
    throw new ApiError(409, `${hint}：请先提交对应的申请单并完成全部签署（当前没有已批准的表单）`);
  }
  return inst;
}

/** 闸门（按具体单号）：新建变更/偏离时，前端带上已批准的申请单 id，服务端校验它确实已批准 */
export async function assertApprovedById(
  tenantId: number,
  formId: number,
  scene: string,
  hint: string,
): Promise<FormInstanceRow> {
  if (!formId || !Number.isInteger(formId)) {
    throw new ApiError(409, `${hint}：请先提交对应的申请单并完成全部签署`);
  }
  const inst = await q1<FormInstanceRow>(
    `SELECT * FROM form_instances WHERE tenant_id = ? AND id = ? AND scene = ?`,
    [tenantId, formId, scene],
  );
  if (!inst) throw new ApiError(409, `${hint}：关联的申请单不存在或场景不匹配`);
  if (inst.status !== 'APPROVED') {
    throw new ApiError(409, `${hint}：关联申请单「${inst.code}」当前为「${inst.status}」，须全部签署批准后才能继续`);
  }
  return inst;
}

/** 取某场景下「已批准」的申请单，给新建页面的下拉用 */
export async function approvedForms(tenantId: number, scene: string): Promise<FormInstanceRow[]> {
  return listInstances(tenantId, { scene, status: 'APPROVED' });
}

/** 流程闸门：流程定义里第 2 步以后勾了「闸门」且挂了表单的步骤，必须有一张已批准的表单才能放行。
 *  第 1 步不在这里查（它在建立对象时由 assertApprovedById 校验），避免与旧数据冲突。 */
export async function assertFlowGates(
  tenantId: number,
  flowScene: string,
  targetType: string,
  targetId: number,
  hint: string,
): Promise<void> {
  const steps = await getFlow(tenantId, flowScene);
  for (const s of steps) {
    if (Number(s.step_no) <= 1 || !s.gate || !s.form_code) continue;
    const approved = await q1<{ id: number }>(
      `SELECT id FROM form_instances
        WHERE tenant_id = ? AND scene = ? AND target_type = ? AND target_id = ? AND status = 'APPROVED'
        LIMIT 1`,
      [tenantId, s.form_code, targetType, targetId],
    );
    if (!approved) {
      throw new ApiError(
        409,
        `${hint}：流程第 ${s.step_no} 步「${s.step_name}」要求《${s.form_code}》已批准，请在「受控表单」里先出这张单并完成签署`,
      );
    }
  }
}

/** 有启用模板时闸门才生效；没有模板就回退到旧行为，保证已有数据不受影响 */
export async function gateEnabled(tenantId: number, scene: string): Promise<boolean> {
  const t = await q1<{ n: number }>(
    `SELECT count(*) AS n FROM form_templates WHERE tenant_id = ? AND scene = ? AND status = 'ACTIVE'`,
    [tenantId, scene],
  );
  return (t?.n ?? 0) > 0;
}

// ============================================================
// 阶段二：流程与表单模板可编辑（B 的核心 —— 以后加步骤不用改代码）
// ============================================================

export interface FlowStepInput {
  step_no: number;
  step_name: string;
  form_code: string;
  role_label: string;
  gate: number;
  enabled: number;
  note?: string;
}

/** 覆盖某场景的流程步骤（整场景替换，幂等） */
export async function saveFlow(tenantId: number, scene: string, steps: FlowStepInput[]): Promise<void> {
  const clean = steps
    .filter((s) => Number.isInteger(s.step_no) && s.step_no >= 1 && (s.step_name ?? '').trim())
    .map((s, i) => ({
      step_no: s.step_no || i + 1,
      step_name: String(s.step_name).trim().slice(0, 80),
      form_code: String(s.form_code ?? '').trim().slice(0, 60),
      role_label: String(s.role_label ?? '').trim().slice(0, 60),
      gate: s.gate ? 1 : 0,
      enabled: s.enabled === 0 ? 0 : 1,
      note: String(s.note ?? '').slice(0, 200),
    }));
  await exec(`DELETE FROM flow_definitions WHERE tenant_id = ? AND scene = ?`, [tenantId, scene]);
  for (const s of clean) {
    await insert(
      `INSERT INTO flow_definitions (tenant_id, scene, step_no, step_name, form_code, role_label, gate, enabled, note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [tenantId, scene, s.step_no, s.step_name, s.form_code, s.role_label, s.gate, s.enabled, s.note],
    );
  }
}

export interface TemplateInput {
  code: string;
  name: string;
  scene: string;
  fields: FormField[];
  checks: FormCheck[];
  signoffs: FormSignoff[];
  requires_items: number;
  note?: string;
}

/** 新增或覆盖一张表单模板；code 不变，字段/检查项/签字位整份替换 */
export async function saveTemplate(tenantId: number, t: TemplateInput): Promise<void> {
  const code = String(t.code ?? '').trim().slice(0, 60);
  if (!code) throw new ApiError(400, '模板代号不能为空');
  const scene = String(t.scene ?? '').trim().slice(0, 60) || code;
  const fields = (t.fields ?? []).filter((f) => f.key && f.label);
  const checks = (t.checks ?? []).filter((c) => c.key && c.label);
  const signoffs = (t.signoffs ?? [])
    .filter((s) => s.step_name && s.role_label)
    .map((s, i) => ({ step_no: Number(s.step_no) || i + 1, step_name: s.step_name, role_label: s.role_label }));

  const exists = await q1<{ id: number }>(
    `SELECT id FROM form_templates WHERE tenant_id = ? AND code = ?`,
    [tenantId, code],
  );
  if (exists) {
    await exec(
      `UPDATE form_templates SET name=?, scene=?, fields_json=?, checklist_json=?, signoff_json=?,
              requires_items=?, note=?, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      [
        String(t.name ?? code).trim(), scene, JSON.stringify(fields), JSON.stringify(checks),
        JSON.stringify(signoffs), t.requires_items ? 1 : 0, String(t.note ?? '').slice(0, 300), exists.id,
      ],
    );
  } else {
    await insert(
      `INSERT INTO form_templates (tenant_id, code, name, scene, fields_json, checklist_json, signoff_json, requires_items, status, note)
       VALUES (?,?,?,?,?,?,?,?,'ACTIVE',?)`,
      [
        tenantId, code, String(t.name ?? code).trim(), scene, JSON.stringify(fields), JSON.stringify(checks),
        JSON.stringify(signoffs), t.requires_items ? 1 : 0, String(t.note ?? '').slice(0, 300),
      ],
    );
  }
}

/** 停用/启用一张模板：停用后对应闸门自动失效（回退旧行为） */
export async function setTemplateStatus(tenantId: number, code: string, status: 'ACTIVE' | 'DRAFT'): Promise<void> {
  await exec(
    `UPDATE form_templates SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE tenant_id = ? AND code = ?`,
    [status, tenantId, code],
  );
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS_TEXT: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '待签署',
  APPROVED: '已批准',
  REJECTED: '已驳回',
};

const RESULT_TEXT: Record<string, string> = {
  PENDING: '待判定',
  PASS: '符合',
  FAIL: '不符合',
  NA: '不适用',
};

/** 渲染成一张可单独打印 / 归档的受控表单（HTML → WPS/浏览器打印成 PDF） */
export function renderFormHtml(
  inst: FormInstanceRow,
  t: FormTemplateRow,
  signoffs: FormSignoffRow[],
): string {
  const fields = templateFields(t);
  const data = instanceData(inst);
  const checks = instanceChecks(inst);
  const items = instanceItems(inst);
  const steps = templateSignoffs(t);
  const byStep = new Map(signoffs.map((s) => [s.step_no, s]));

  const fieldRows = fields
    .map(
      (f) => `<tr><th>${esc(f.label)}</th><td>${esc(data[f.key] ?? '') || '　'}</td></tr>`,
    )
    .join('');
  const itemRows = items
    .map(
      (it) =>
        `<tr><td>${esc(it.key)}</td><td>${esc(it.label)}</td><td>${esc(it.value)}</td></tr>`,
    )
    .join('');
  const checkRows = checks
    .map(
      (c) =>
        `<tr><td>${esc(c.label)}</td><td class="c">${esc(RESULT_TEXT[c.result] ?? c.result)}</td><td>${esc(c.note ?? '')}</td></tr>`,
    )
    .join('');
  const signRows = steps
    .map((s) => {
      const r = byStep.get(Number(s.step_no));
      return `<tr><td class="c">${esc(s.step_no)}</td><td>${esc(s.step_name)}</td><td>${esc(s.role_label)}</td>
        <td>${r ? esc(r.signer_name) : '　'}</td><td class="c">${r ? esc(r.decision === 'APPROVE' ? '同意' : '驳回') : '　'}</td>
        <td>${r ? esc(r.comment) : '　'}</td><td class="c">${r ? esc(r.signed_at) : '　'}</td></tr>`;
    })
    .join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${esc(inst.code)} ${esc(inst.title)}</title>
<style>
  body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#1e293b;margin:32px;font-size:13px;line-height:1.6}
  h1{font-size:20px;text-align:center;margin:0 0 4px}
  .sub{text-align:center;color:#64748b;font-size:12px;margin-bottom:18px}
  h2{font-size:14px;margin:20px 0 8px;padding-left:8px;border-left:3px solid #4f46e5}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}
  thead th{background:#f1f5f9;font-size:12px}
  tbody th{background:#f8fafc;width:150px;font-weight:600;font-size:12px}
  .c{text-align:center;white-space:nowrap}
  .meta{display:flex;justify-content:space-between;font-size:12px;color:#475569;margin-bottom:10px}
  .foot{margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
  @media print{body{margin:12mm}.noprint{display:none}@page{size:A4;margin:14mm}}
</style></head><body>
<div class="noprint" style="text-align:right;margin-bottom:12px"><button onclick="window.print()" style="padding:6px 14px;cursor:pointer">打印 / 另存为 PDF</button></div>
<h1>${esc(inst.title)}</h1>
<div class="sub">${esc(t.name)}　·　单据编号 ${esc(inst.code)} · 状态 ${esc(STATUS_TEXT[inst.status] ?? inst.status)}</div>
<div class="meta"><span>申请人：${esc(inst.created_by)}</span><span>申请日期：${esc(inst.created_at)}</span><span>提交：${esc(inst.submitted_at ?? '—')}</span><span>批准：${esc(inst.closed_at ?? '—')}</span></div>
<h2>一、基本信息</h2><table><tbody>${fieldRows || '<tr><td colspan="2">（无字段）</td></tr>'}</tbody></table>
${items.length ? `<h2>二、清单（${items.length} 项）</h2><table><thead><tr><th style="width:32%">编号 / 件号</th><th>名称</th><th style="width:24%">版本 / 说明</th></tr></thead><tbody>${itemRows}</tbody></table>` : ''}
${checks.length ? `<h2>${items.length ? '三' : '二'}、检查单</h2><table><thead><tr><th>检查项目</th><th style="width:90px">判定</th><th style="width:28%">说明</th></tr></thead><tbody>${checkRows}</tbody></table>` : ''}
<h2>${(items.length ? 1 : 0) + (checks.length ? 1 : 0) + 2 === 2 ? '二' : (items.length ? 1 : 0) + (checks.length ? 1 : 0) + 2 === 3 ? '三' : '四'}、签署</h2>
<table><thead><tr><th>步</th><th>环节</th><th>岗位</th><th>签署人</th><th>结论</th><th>意见</th><th>时间</th></tr></thead><tbody>${signRows}</tbody></table>
<div class="foot">本单据由系统按生效规则自动生成，记录只追加、不可修改；可单独打印归档，并作为证据包材料之一。全部内容为脱敏演示值。</div>
</body></html>`;
}

/** 中文序号，供证据包目录用 */
export function cnIndex(n: number): string {
  const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  return cn[n - 1] ?? String(n);
}
