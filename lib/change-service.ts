import { q, q1, insert, exec, db } from './db';
import { ApiError } from './api';
import { CLASS_CHAINS, ROLE_NAMES, type RoleCode } from './constants';
import { chainFor, normalizeImpact, validateWizard, type WizardInput } from './rules';
import { classToSlot, getEffectiveRules, slotToLabel } from './profile';
import { logEvent } from './events';
import { assertFlowGates } from './flow';
import type { SessionUser } from './session';
import type { Approval, Change, Ci } from './types';

const YEAR = new Date().getFullYear();

/** 记一条构型项版本履历（表不存在时静默跳过，不阻断主流程） */
async function recordRevision(
  tenantId: number,
  pn: string,
  rev: string,
  changeCode: string,
  classResult: string | null,
  note: string,
  actor: string,
): Promise<void> {
  try {
    await exec(
      `INSERT INTO ci_revisions (tenant_id, pn, rev, change_code, class_result, note, actor)
       VALUES (?,?,?,?,?,?,?)`,
      [tenantId, pn, rev, changeCode, classResult, note, actor],
    );
  } catch {
    // 履历表未初始化时不影响变更落库
  }
}

/** 租户内按类型自增：PR-2026-001 / CR-2026-001 / CN-2026-001 */
export async function nextCode(tenantId: number, kind: 'PR' | 'CR' | 'CN'): Promise<string> {
  const prefix = `${kind}-${YEAR}-`;
  const row = await q1<{ code: string }>(
    `SELECT code FROM changes WHERE tenant_id = ? AND code LIKE ? ORDER BY code DESC LIMIT 1`,
    [tenantId, `${prefix}%`],
  );
  const seq = row ? Number(row.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

export interface PrInput {
  model: string;
  ci_pn: string;
  title: string;
  reason?: string | null;
}

export async function createPr(user: SessionUser, input: PrInput): Promise<Change> {
  const ci = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [
    user.tenantId,
    input.ci_pn,
  ]);
  if (!ci) throw new ApiError(400, '变更对象不存在');
  if (ci.status === 'VOID') throw new ApiError(409, '该构型项已作废，不能再发起变更');

  const code = await nextCode(user.tenantId, 'PR');
  const id = await insert(
    `INSERT INTO changes (tenant_id, code, kind, parent_id, model, ci_pn, from_rev, title, reason, status, created_by)
     VALUES (?,?, 'PR', NULL, ?,?,?,?,?, 'OPEN', ?)`,
    [user.tenantId, code, input.model, input.ci_pn, ci.rev, input.title, input.reason ?? null, user.name],
  );

  await logEvent(user.tenantId, user.name, 'PR_CREATE', 'change', id, `${code} ${input.title}`);
  const created = await q1<Change>(`SELECT * FROM changes WHERE id = ?`, [id]);
  if (!created) throw new ApiError(500, '创建失败');
  return created;
}

export interface CrInput extends WizardInput {}

/** PR 转 CR：校验向导输入 → 定级 → 按类别生成审批链 → 第 1 步由创建人自动签署 */
export async function createCrFromPr(
  user: SessionUser,
  prId: number,
  input: CrInput,
): Promise<{ id: number; code: string; steps: number }> {
  const pr = await q1<Change>(`SELECT * FROM changes WHERE tenant_id = ? AND id = ? AND kind = 'PR'`, [
    user.tenantId,
    prId,
  ]);
  if (!pr) throw new ApiError(404, '变更申请单不存在');
  if (pr.status !== 'OPEN') throw new ApiError(409, `该申请单已是「${pr.status}」状态，不能重复转 CR`);

  const ci = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [
    user.tenantId,
    input.ci_pn ?? pr.ci_pn ?? '',
  ]);

  const rules = await getEffectiveRules(user.tenantId);
  validateWizard(input, ci, rules);

  // 拟制步由创建人自动签署，创建人必须具备第 1 步要求的角色
  const chain = chainFor(input.class_result, rules);
  const firstRole = (chain[0]?.role_code ?? 'DESIGN_ENG') as RoleCode;
  if (user.role !== firstRole) {
    throw new ApiError(
      403,
      `只有「${ROLE_NAMES[firstRole] ?? firstRole}」可以拟制变更单，第 1 步需由创建人自动签署`,
    );
  }

  // 大改换号：新件号不能与库里已有件号冲突（R1）
  if (input.new_pn) {
    const dup = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [
      user.tenantId,
      input.new_pn,
    ]);
    if (dup) throw new ApiError(409, `新件号 ${input.new_pn} 已存在（${dup.name}），请另取件号`);
  }

  const cls = classToSlot(rules, input.class_result); // 落库用内部槽位，兼容 CHECK 约束
  const clsLabel = slotToLabel(rules, cls);
  const code = await nextCode(user.tenantId, 'CR');

  const id = await insert(
    `INSERT INTO changes (tenant_id, code, kind, parent_id, model, ci_pn, from_rev, to_rev, new_pn, title, reason,
       f_fit, f_form, f_function, class_result, class_reason, impact_json, wip_action, status, created_by)
     VALUES (?,?, 'CR', ?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'OPEN', ?)`,
    [
      user.tenantId,
      code,
      pr.id,
      input.model,
      input.ci_pn ?? pr.ci_pn,
      input.from_rev ?? pr.from_rev,
      input.to_rev ?? null,
      input.new_pn ?? null,
      input.title,
      input.reason ?? pr.reason,
      input.f_fit ? 1 : 0,
      input.f_form ? 1 : 0,
      input.f_function ? 1 : 0,
      cls,
      input.class_reason ?? null,
      JSON.stringify(normalizeImpact(input.impact, rules)),
      input.wip_action ?? null,
      user.name,
    ],
  );

  const stmts = chain.map((s, idx) => ({
    sql: `INSERT INTO change_approvals (change_id, step_no, step_name, role_code, signer_user_id, decision, comment, signed_at)
          VALUES (?,?,?,?,?,?,?,?)`,
    args:
      idx === 0
        ? [
            id,
            s.step_no,
            s.step_name,
            s.role_code,
            user.userId,
            'APPROVE',
            '拟制并提交',
            new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          ]
        : [id, s.step_no, s.step_name, s.role_code, null, null, null, null],
  }));
  await db.batch(stmts, 'write');

  await exec(`UPDATE changes SET status = 'LINKED' WHERE id = ?`, [pr.id]);

  await logEvent(
    user.tenantId,
    user.name,
    'CR_CREATE',
    'change',
    id,
    `${code} 定级「${clsLabel}」，生成 ${chain.length} 步审批链（第 1 步已由创建人签署）`,
  );

  return { id, code, steps: chain.length };
}

/** 签署：先查 SoD，再查角色（顺序写死，§5.3） */
export async function signStep(
  user: SessionUser,
  changeId: number,
  stepNo: number,
  decision: 'APPROVE' | 'REJECT',
  comment: string | null,
): Promise<{ status: string }> {
  const change = await q1<Change>(`SELECT * FROM changes WHERE tenant_id = ? AND id = ?`, [
    user.tenantId,
    changeId,
  ]);
  if (!change) throw new ApiError(404, '单据不存在');
  if (change.kind !== 'CR') throw new ApiError(409, '只有变更单（CR）有审批链');
  if (change.status === 'APPROVED') throw new ApiError(409, '该单已全部签署完成，无需再签');
  if (change.status === 'REJECTED') throw new ApiError(409, '该单已驳回，不能继续签署');
  if (change.status === 'EXECUTED' || change.status === 'CLOSED') {
    throw new ApiError(409, '该单已执行完毕，不能继续签署');
  }

  const approvals = await q<Approval>(
    `SELECT * FROM change_approvals WHERE change_id = ? ORDER BY step_no`,
    [changeId],
  );
  const target = approvals.find((a) => a.step_no === stepNo);
  if (!target) throw new ApiError(400, '审批步骤不存在');

  const pending = approvals.find((a) => a.signed_at === null);
  if (!pending) throw new ApiError(409, '该单没有待签步骤');
  if (pending.step_no !== stepNo) {
    throw new ApiError(
      409,
      `不可跳步：请先完成第 ${pending.step_no} 步「${pending.step_name}」（${ROLE_NAMES[pending.role_code as keyof typeof ROLE_NAMES] ?? pending.role_code}）`,
    );
  }

  const rules = await getEffectiveRules(user.tenantId);

  // ① 职责分离（可由配置关闭）：同一自然人不得在本单签署两个步骤
  if (rules.switches.sod) {
    const signedElsewhere = approvals.find((a) => a.signer_user_id === user.userId);
    if (signedElsewhere) {
      throw new ApiError(
        409,
        `该步骤必须由另一位签署人完成（当前用户已签署第 ${signedElsewhere.step_no} 步「${signedElsewhere.step_name}」）。`,
      );
    }
  }

  // ② 角色校验
  if (target.role_code !== user.role) {
    const need = ROLE_NAMES[target.role_code as keyof typeof ROLE_NAMES] ?? target.role_code;
    const mine = ROLE_NAMES[user.role] ?? user.role;
    throw new ApiError(403, `权限不足：第 ${stepNo} 步需要「${need}」，当前用户角色为「${mine}」`);
  }

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  await exec(
    `UPDATE change_approvals SET signer_user_id = ?, decision = ?, comment = ?, signed_at = ?
     WHERE change_id = ? AND step_no = ?`,
    [user.userId, decision, comment ?? null, now, changeId, stepNo],
  );

  let nextStatus = change.status;
  if (decision === 'REJECT') {
    nextStatus = 'REJECTED';
    await exec(`UPDATE changes SET status = 'REJECTED' WHERE id = ?`, [changeId]);
  } else {
    const remaining = approvals.filter((a) => a.step_no !== stepNo && a.signed_at === null);
    if (remaining.length === 0) {
      nextStatus = 'APPROVED';
      await exec(`UPDATE changes SET status = 'APPROVED' WHERE id = ?`, [changeId]);
    }
  }

  await logEvent(
    user.tenantId,
    user.name,
    decision === 'APPROVE' ? 'SIGN' : 'REJECT',
    'change',
    changeId,
    `第 ${stepNo} 步 ${target.step_name} ${decision === 'APPROVE' ? '同意' : '驳回'}${comment ? `：${comment}` : ''}`,
  );

  return { status: nextStatus };
}

/** CN 执行确认：建 CN + 落库（换件号或升版）+ CR 转 EXECUTED */
export async function executeChange(
  user: SessionUser,
  changeId: number,
  note: string,
  verified: boolean,
): Promise<{ cnCode: string; cnId: number }> {
  const cr = await q1<Change>(`SELECT * FROM changes WHERE tenant_id = ? AND id = ? AND kind = 'CR'`, [
    user.tenantId,
    changeId,
  ]);
  if (!cr) throw new ApiError(404, '变更单不存在');
  if (cr.status !== 'APPROVED') {
    throw new ApiError(409, `只有已批准的变更单可以执行（当前状态：${cr.status}）`);
  }
  if (!note.trim()) throw new ApiError(400, '请填写执行说明');

  const oldCi = cr.ci_pn
    ? await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [user.tenantId, cr.ci_pn])
    : null;
  if (cr.ci_pn && !oldCi) throw new ApiError(409, `变更对象 ${cr.ci_pn} 不存在，无法落库`);

  const cnCode = await nextCode(user.tenantId, 'CN');
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const rules = await getEffectiveRules(user.tenantId);

  const cnId = await insert(
    `INSERT INTO changes (tenant_id, code, kind, parent_id, model, ci_pn, from_rev, to_rev, new_pn, title, reason,
       class_result, status, created_by, verified)
     VALUES (?,?, 'CN', ?, ?,?,?,?,?,?,?,?, 'EXECUTED', ?, ?)`,
    [
      user.tenantId,
      cnCode,
      cr.id,
      cr.model,
      cr.ci_pn,
      cr.from_rev,
      cr.to_rev,
      cr.new_pn,
      `执行：${cr.title}`,
      note,
      cr.class_result,
      user.name,
      verified ? 1 : 0,
    ],
  );

  // 落库：换了件号 → 新建 CI（原 CI 作废）；否则原地升版
  if (cr.new_pn && oldCi) {
    const dup = await q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [
      user.tenantId,
      cr.new_pn,
    ]);
    if (dup) throw new ApiError(409, `新件号 ${cr.new_pn} 已被占用，无法落库`);

    await db.batch(
      [
        {
          sql: `INSERT INTO cis (tenant_id, model, pn, name, type, parent_pn, qty, rev, sn_controlled, status, criticality, owner, basis, note)
                VALUES (?,?,?,?,?,?,?,?,?, 'CONTROLLED', ?, ?, ?, ?)`,
          args: [
            user.tenantId,
            oldCi.model,
            cr.new_pn,
            oldCi.name,
            oldCi.type,
            oldCi.parent_pn,
            oldCi.qty,
            rules.ident.rev_format,
            oldCi.sn_controlled,
            oldCi.criticality,
            oldCi.owner,
            oldCi.basis,
            `由 ${oldCi.pn} 大改换号而来（${cr.code}）`,
          ],
        },
        {
          sql: `UPDATE cis SET status = 'VOID' WHERE id = ?`,
          args: [oldCi.id],
        },
        {
          sql: `UPDATE changes SET status = 'EXECUTED' WHERE id = ?`,
          args: [cr.id],
        },
      ],
      'write',
    );

    await recordRevision(
      user.tenantId,
      cr.new_pn!,
      rules.ident.rev_format,
      cnCode,
      cr.class_result,
      `由 ${oldCi.pn} 大改换号新建（${cr.code}）`,
      user.name,
    );

    await logEvent(
      user.tenantId,
      user.name,
      'CN_EXECUTE',
      'change',
      cr.id,
      `${cnCode} 执行：新建 ${cr.new_pn}，原 ${oldCi.pn} 作废，${verified ? '验证通过' : '未验证'}`,
    );
  } else if (oldCi && cr.to_rev) {
    await db.batch(
      [
        {
          sql: `UPDATE cis SET rev = ? WHERE id = ?`,
          args: [cr.to_rev, oldCi.id],
        },
        {
          sql: `UPDATE changes SET status = 'EXECUTED' WHERE id = ?`,
          args: [cr.id],
        },
      ],
      'write',
    );

    await recordRevision(
      user.tenantId,
      oldCi.pn,
      cr.to_rev!,
      cnCode,
      cr.class_result,
      `由 ${cr.from_rev ?? '?'} 升版（${cr.code}）${verified ? '，验证通过' : ''}`,
      user.name,
    );

    await logEvent(
      user.tenantId,
      user.name,
      'CN_EXECUTE',
      'change',
      cr.id,
      `${cnCode} 执行：${oldCi.pn} 版本 ${cr.from_rev ?? '?'} → ${cr.to_rev}，${verified ? '验证通过' : '未验证'}`,
    );
  } else {
    throw new ApiError(400, '该变更既无新件号也无目标版本，无法落库');
  }

  void now;
  return { cnCode, cnId };
}

/** 关闭：CN 已执行且执行人勾选「验证通过」才允许（R3） */
export async function closeChange(user: SessionUser, changeId: number): Promise<void> {
  const cr = await q1<Change>(`SELECT * FROM changes WHERE tenant_id = ? AND id = ? AND kind = 'CR'`, [
    user.tenantId,
    changeId,
  ]);
  if (!cr) throw new ApiError(404, '变更单不存在');
  if (cr.status === 'CLOSED') throw new ApiError(409, '该单已关闭');
  if (cr.status !== 'EXECUTED') throw new ApiError(409, '只有已执行的变更单可以关闭');

  const cn = await q1<Change>(
    `SELECT * FROM changes WHERE parent_id = ? AND kind = 'CN' AND status = 'EXECUTED'`,
    [changeId],
  );
  if (!cn) throw new ApiError(409, '变更通知（CN）尚未执行，不能关闭');
  const rules = await getEffectiveRules(user.tenantId);
  if (rules.switches.verify && cn.verified !== 1) {
    throw new ApiError(409, '执行人未勾选「验证通过」，不能关闭');
  }

  // 流程配置里第 2 步以后勾了「闸门」的环节，必须对应表单已批准才允许关闭
  await assertFlowGates(user.tenantId, 'CHANGE_FLOW', 'change', changeId, '变更不能关闭');

  await exec(
    `UPDATE changes SET status = 'CLOSED', closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    [changeId],
  );
  await logEvent(user.tenantId, user.name, 'CR_CLOSE', 'change', changeId, `${cr.code} 关闭闭环`);
}

export const CHAIN_REF = CLASS_CHAINS;
