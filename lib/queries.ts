import { q, q1 } from './db';
import type {
  Approval,
  Baseline,
  BaselineItem,
  Change,
  Ci,
  Deviation,
  Doc,
  EventRow,
  Fitting,
  UnitRow,
} from './types';
import type { SessionUser } from './session';

// ---------------- 构型项 ----------------

export async function listModels(tenantId: number): Promise<string[]> {
  const rows = await q<{ model: string }>(
    `SELECT DISTINCT model FROM cis WHERE tenant_id = ? ORDER BY model`,
    [tenantId],
  );
  return rows.map((r) => r.model);
}

export async function listCis(tenantId: number, model?: string): Promise<Ci[]> {
  const sql = model
    ? `SELECT * FROM cis WHERE tenant_id = ? AND model = ? AND status <> 'VOID' ORDER BY id`
    : `SELECT * FROM cis WHERE tenant_id = ? AND status <> 'VOID' ORDER BY model, id`;
  return q<Ci>(sql, model ? [tenantId, model] : [tenantId]);
}

export async function getCi(tenantId: number, pn: string): Promise<Ci | null> {
  return q1<Ci>(`SELECT * FROM cis WHERE tenant_id = ? AND pn = ?`, [tenantId, pn]);
}

export async function listDocs(tenantId: number, ciPn: string): Promise<Doc[]> {
  return q<Doc>(`SELECT * FROM docs WHERE tenant_id = ? AND ci_pn = ? ORDER BY doc_no`, [
    tenantId,
    ciPn,
  ]);
}

export async function isInFrozenBaseline(tenantId: number, pn: string): Promise<boolean> {
  const row = await q1<{ n: number }>(
    `SELECT COUNT(*) AS n FROM baseline_items bi
     JOIN baselines b ON b.id = bi.baseline_id
     WHERE b.tenant_id = ? AND b.status = 'FROZEN' AND bi.ci_pn = ?`,
    [tenantId, pn],
  );
  return (row?.n ?? 0) > 0;
}

/** 构型项相关的单据历史（作 PR/CR 的都算） */
export async function changesForCi(tenantId: number, pn: string): Promise<Change[]> {
  return q<Change>(
    `SELECT * FROM changes WHERE tenant_id = ? AND (ci_pn = ? OR new_pn = ?) ORDER BY id DESC`,
    [tenantId, pn, pn],
  );
}

// ---------------- 基线 ----------------

export async function listBaselines(tenantId: number, model?: string): Promise<Baseline[]> {
  const sql = `SELECT b.*, (SELECT COUNT(*) FROM baseline_items bi WHERE bi.baseline_id = b.id) AS item_count
    FROM baselines b WHERE b.tenant_id = ? ${model ? 'AND b.model = ?' : ''}
    ORDER BY b.id DESC`;
  return q<Baseline>(sql, model ? [tenantId, model] : [tenantId]);
}

export async function getBaseline(tenantId: number, id: number): Promise<Baseline | null> {
  return q1<Baseline>(`SELECT * FROM baselines WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
}

export async function listBaselineItems(id: number): Promise<BaselineItem[]> {
  return q<BaselineItem>(
    `SELECT bi.*, c.name AS ci_name, c.status AS ci_status
     FROM baseline_items bi
     LEFT JOIN cis c ON c.pn = bi.ci_pn
     WHERE bi.baseline_id = ?
     ORDER BY bi.ci_pn`,
    [id],
  );
}

export interface DiffResult {
  added: BaselineItem[];
  removed: BaselineItem[];
  changed: { ci_pn: string; from_rev: string; to_rev: string; ci_name?: string | null }[];
}

export async function diffBaselines(fromId: number, toId: number): Promise<DiffResult> {
  const from = await listBaselineItems(fromId);
  const to = await listBaselineItems(toId);
  const fromMap = new Map(from.map((i) => [i.ci_pn, i]));
  const toMap = new Map(to.map((i) => [i.ci_pn, i]));

  const added = to.filter((i) => !fromMap.has(i.ci_pn));
  const removed = from.filter((i) => !toMap.has(i.ci_pn));
  const changed: DiffResult['changed'] = [];
  for (const item of to) {
    const old = fromMap.get(item.ci_pn);
    if (old && old.ci_rev !== item.ci_rev) {
      changed.push({
        ci_pn: item.ci_pn,
        from_rev: old.ci_rev,
        to_rev: item.ci_rev,
        ci_name: item.ci_name,
      });
    }
  }
  return { added, removed, changed };
}

// ---------------- 变更 ----------------

export async function listChanges(
  tenantId: number,
  filter: { kind?: string; status?: string; className?: string } = {},
): Promise<Change[]> {
  const where: string[] = ['tenant_id = ?'];
  const args: (string | number)[] = [tenantId];
  if (filter.kind) {
    where.push('kind = ?');
    args.push(filter.kind);
  }
  if (filter.status) {
    where.push('status = ?');
    args.push(filter.status);
  }
  if (filter.className) {
    where.push('class_result = ?');
    args.push(filter.className);
  }
  return q<Change>(`SELECT * FROM changes WHERE ${where.join(' AND ')} ORDER BY id DESC`, args);
}

export async function getChange(tenantId: number, id: number): Promise<Change | null> {
  return q1<Change>(`SELECT * FROM changes WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
}

export async function listApprovals(changeId: number): Promise<Approval[]> {
  return q<Approval>(
    `SELECT a.*, u.name AS signer_name FROM change_approvals a
     LEFT JOIN users u ON u.id = a.signer_user_id
     WHERE a.change_id = ? ORDER BY a.step_no`,
    [changeId],
  );
}

export async function childChanges(changeId: number): Promise<Change[]> {
  return q<Change>(`SELECT * FROM changes WHERE parent_id = ? ORDER BY id`, [changeId]);
}

// ---------------- 偏离 / 让步 ----------------

export async function listDeviations(tenantId: number): Promise<Deviation[]> {
  return q<Deviation>(`SELECT * FROM deviations WHERE tenant_id = ? ORDER BY id DESC`, [tenantId]);
}

// ---------------- 纪实 / 实物 ----------------

export async function listEvents(tenantId: number, limit = 200): Promise<EventRow[]> {
  return q<EventRow>(
    `SELECT * FROM events WHERE tenant_id = ? ORDER BY id DESC LIMIT ?`,
    [tenantId, limit],
  );
}

export async function listUnits(tenantId: number): Promise<UnitRow[]> {
  return q<UnitRow>(`SELECT * FROM units WHERE tenant_id = ? ORDER BY sn`, [tenantId]);
}

export async function listFittings(tenantId: number): Promise<Fitting[]> {
  return q<Fitting>(
    `SELECT f.unit_id, u.sn, f.ci_pn, f.ci_rev, f.remark
     FROM unit_fittings f JOIN units u ON u.id = f.unit_id
     WHERE u.tenant_id = ? ORDER BY u.sn, f.ci_pn`,
    [tenantId],
  );
}

// ---------------- 总览 ----------------

export interface Overview {
  stats: { ciCount: number; baselineCount: number; runningChanges: number };
  todo: { code: string; id: number; title: string; step_no: number; step_name: string }[];
  expiredDeviations: Deviation[];
  mismatches: { sn: string; ci_pn: string; installed: string; baseline_rev: string; baseline: string }[];
}

export async function getOverview(user: SessionUser): Promise<Overview> {
  const tenantId = user.tenantId;

  const ciCount = await q1<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cis WHERE tenant_id = ? AND status <> 'VOID'`,
    [tenantId],
  );
  const baselineCount = await q1<{ n: number }>(
    `SELECT COUNT(*) AS n FROM baselines WHERE tenant_id = ?`,
    [tenantId],
  );
  const running = await q1<{ n: number }>(
    `SELECT COUNT(*) AS n FROM changes WHERE tenant_id = ? AND kind = 'CR' AND status IN ('OPEN','APPROVED')`,
    [tenantId],
  );

  // 待我签署：只取每张单的「当前待签步」，且角色匹配、我还没在本单任何步骤签过
  const open = await q<Approval & { code: string; title: string }>(
    `SELECT a.*, c.code, c.title FROM change_approvals a
     JOIN changes c ON c.id = a.change_id
     WHERE c.tenant_id = ? AND c.kind = 'CR' AND c.status IN ('OPEN','APPROVED')
       AND a.signed_at IS NULL
     ORDER BY c.id, a.step_no`,
    [tenantId],
  );
  const mine = await q<{ change_id: number; signer_user_id: number }>(
    `SELECT change_id, signer_user_id FROM change_approvals WHERE signer_user_id = ?`,
    [user.userId],
  );
  const signedByMe = new Set(mine.map((m) => m.change_id));
  const seen = new Set<number>();
  const todo: Overview['todo'] = [];
  for (const row of open) {
    if (seen.has(row.change_id)) continue; // 只取首条未签步
    seen.add(row.change_id);
    if (row.role_code !== user.role) continue;
    if (signedByMe.has(row.change_id)) continue;
    todo.push({
      code: row.code,
      id: row.change_id,
      title: row.title,
      step_no: row.step_no,
      step_name: row.step_name,
    });
  }

  const expiredDeviations = await q<Deviation>(
    `SELECT * FROM deviations WHERE tenant_id = ? AND status = 'ACTIVE'
       AND datetime(expire_at) < datetime('now') ORDER BY expire_at`,
    [tenantId],
  );

  // 文实不符：装机版本 ≠ 最新冻结基线版本
  const mismatches = await q<{
    sn: string;
    ci_pn: string;
    installed: string;
    baseline_rev: string;
    baseline: string;
  }>(
    `SELECT u.sn, f.ci_pn, f.ci_rev AS installed, bi.ci_rev AS baseline_rev, b.code AS baseline
     FROM unit_fittings f
     JOIN units u ON u.id = f.unit_id
     JOIN baselines b ON b.id = (
        SELECT b2.id FROM baselines b2
        WHERE b2.tenant_id = u.tenant_id AND b2.model = u.model AND b2.status = 'FROZEN'
        ORDER BY b2.frozen_at DESC, b2.id DESC LIMIT 1
     )
     JOIN baseline_items bi ON bi.baseline_id = b.id AND bi.ci_pn = f.ci_pn
     WHERE u.tenant_id = ? AND bi.ci_rev <> f.ci_rev
     ORDER BY u.sn, f.ci_pn`,
    [tenantId],
  );

  return {
    stats: {
      ciCount: ciCount?.n ?? 0,
      baselineCount: baselineCount?.n ?? 0,
      runningChanges: running?.n ?? 0,
    },
    todo,
    expiredDeviations,
    mismatches,
  };
}

/** 导出《构型状态一览表》用：基线条目 + 文件信息 */
export async function exportRows(baselineId: number): Promise<BaselineItem[]> {
  return q<BaselineItem>(
    `SELECT bi.*, c.name AS ci_name, c.status AS ci_status
     FROM baseline_items bi LEFT JOIN cis c ON c.pn = bi.ci_pn
     WHERE bi.baseline_id = ? ORDER BY bi.ci_pn`,
    [baselineId],
  );
}
