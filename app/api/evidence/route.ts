import { q, q1 } from '@/lib/db';
import { handle, requireUser, ApiError } from '@/lib/api';
import { getEffectiveRules, slotToLabel, baselineSlotToLabel, type EffectiveRules } from '@/lib/profile';
import { logEvent } from '@/lib/events';
import { CHANGE_KIND_NAMES, CHANGE_STATUS_NAMES, CI_STATUS_NAMES } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Cell = string | number | null | undefined;
type Row = Record<string, unknown>;

/** HTML 转义：证据包里所有来自数据库的内容都必须过这一层 */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function table(headers: string[], rows: Cell[][]): string {
  if (rows.length === 0) {
    return '<p class="empty">（本项暂无记录）</p>';
  }
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function s(r: Row, key: string): string {
  return String(r[key] ?? '');
}

interface Extra {
  blHeaders: string[];
  blRows: Cell[][];
  itHeaders: string[];
  itRows: Cell[][];
}

interface Material {
  desc: string;
  headers: string[];
  rows: Cell[][];
  extra?: Extra;
  html?: string;
}

/**
 * 按材料名称，从真实业务表里取数。
 * 名称来自规则配置的「材料清单」，所以换一套规矩、不改代码也能导出。
 * 认不出来的名称给占位说明，不报错、不漏章节。
 */
async function material(
  name: string,
  tenantId: number,
  baselineId: number | null,
  rules: EffectiveRules,
): Promise<Material> {
  const n = name.replace(/\s/g, '');

  // 1) 更改清单
  if (/更改|变更|CR|CN/.test(n)) {
    const rows = await q<Row>(
      `SELECT code, kind, title, ci_pn, from_rev, to_rev, new_pn, class_result, status, created_by, created_at
       FROM changes WHERE tenant_id = ? ORDER BY id DESC`,
      [tenantId],
    );
    return {
      desc: '全部变更申请（PR）、变更单（CR）、变更通知（CN）及其定级与状态',
      headers: ['单号', '类型', '标题', '构型项', '原版本', '目标版本', '新件号', '类别', '状态', '提出人', '提出时间'],
      rows: rows.map((r) => [
        s(r, 'code'), CHANGE_KIND_NAMES[s(r, 'kind')] ?? s(r, 'kind'), s(r, 'title'),
        s(r, 'ci_pn'), s(r, 'from_rev'), s(r, 'to_rev'), s(r, 'new_pn'),
        slotToLabel(rules, s(r, 'class_result')), CHANGE_STATUS_NAMES[s(r, 'status')] ?? s(r, 'status'),
        s(r, 'created_by'), s(r, 'created_at'),
      ]),
    };
  }

  // 2) 审批记录
  if (/审批|签署|会签|签审/.test(n)) {
    const rows = await q<Row>(
      `SELECT c.code, a.step_no, a.step_name, a.role_code, u.name AS signer,
              a.decision, a.comment, a.signed_at
       FROM change_approvals a
       JOIN changes c ON c.id = a.change_id
       LEFT JOIN users u ON u.id = a.signer_user_id
       WHERE c.tenant_id = ? ORDER BY c.id DESC, a.step_no`,
      [tenantId],
    );
    return {
      desc: '每张变更单的逐步签署留痕（含签署人、决定、意见、时间；只追加不可改）',
      headers: ['变更单', '步骤', '步骤名称', '签署角色码', '签署人', '决定', '意见', '签署时间'],
      rows: rows.map((r) => [
        s(r, 'code'), s(r, 'step_no'), s(r, 'step_name'), s(r, 'role_code'), s(r, 'signer'),
        s(r, 'decision') === 'APPROVE' ? '同意' : s(r, 'decision') === 'REJECT' ? '驳回' : '待签',
        s(r, 'comment'), s(r, 'signed_at'),
      ]),
    };
  }

  // 3) 验证结果
  if (/验证|核查|检验/.test(n)) {
    const rows = await q<Row>(
      `SELECT code, ci_pn, to_rev, new_pn, verified, created_by, created_at
       FROM changes WHERE tenant_id = ? AND kind = 'CN' ORDER BY id DESC`,
      [tenantId],
    );
    return {
      desc: '变更执行（CN）时的符合性验证勾选结果；未勾选验证通过不允许关闭变更',
      headers: ['变更通知', '构型项', '目标版本', '新件号', '验证结果', '执行人', '执行时间'],
      rows: rows.map((r) => [
        s(r, 'code'), s(r, 'ci_pn'), s(r, 'to_rev'), s(r, 'new_pn'),
        Number(r.verified) === 1 ? '验证通过' : '未验证', s(r, 'created_by'), s(r, 'created_at'),
      ]),
    };
  }

  // 4) 偏离记录
  if (/偏离|让步|超差/.test(n)) {
    const rows = await q<Row>(
      `SELECT kind, ci_pn, unit_sn, reason, qty_limit, expire_at, status, created_by, created_at
       FROM deviations WHERE tenant_id = ? ORDER BY id DESC`,
      [tenantId],
    );
    return {
      desc: '偏离/让步许可及其时效；过期偏离会在总览页预警',
      headers: ['类型', '构型项', '序列号', '原因', '数量上限', '有效期至', '状态', '申请人', '申请时间'],
      rows: rows.map((r) => [
        s(r, 'kind') === 'DEVIATION' ? '偏离' : s(r, 'kind') === 'CONCESSION' ? '让步' : s(r, 'kind'),
        s(r, 'ci_pn'), s(r, 'unit_sn'), s(r, 'reason'), s(r, 'qty_limit'),
        s(r, 'expire_at'), s(r, 'status'), s(r, 'created_by'), s(r, 'created_at'),
      ]),
    };
  }

  // 5) 纪实时间线
  if (/纪实|时间线|事件|流水|日志/.test(n)) {
    const rows = await q<Row>(
      `SELECT created_at, actor, action, target_type, target_id, detail
       FROM events WHERE tenant_id = ? ORDER BY id DESC LIMIT 500`,
      [tenantId],
    );
    return {
      desc: '只追加的纪实台账（数据库触发器拒绝 UPDATE / DELETE）',
      headers: ['时间', '操作人', '动作', '对象类型', '对象', '详情'],
      rows: rows.map((r) => [
        s(r, 'created_at'), s(r, 'actor'), s(r, 'action'), s(r, 'target_type'),
        s(r, 'target_id'), s(r, 'detail'),
      ]),
    };
  }

  // 6) 符合性矩阵（需求—设计—验证追溯的简化落地）
  if (/符合性|矩阵|追溯/.test(n)) {
    const rows = await q<Row>(
      `SELECT c.pn, c.name, c.rev,
              (SELECT bi.ci_rev FROM baseline_items bi
                 JOIN baselines b ON b.id = bi.baseline_id
                WHERE b.tenant_id = c.tenant_id AND b.model = c.model
                  AND b.status = 'FROZEN' AND bi.ci_pn = c.pn
                ORDER BY b.frozen_at DESC, b.id DESC LIMIT 1) AS baseline_rev,
              (SELECT ch.code FROM changes ch
                WHERE ch.tenant_id = c.tenant_id AND (ch.ci_pn = c.pn OR ch.new_pn = c.pn)
                ORDER BY ch.id DESC LIMIT 1) AS last_change
       FROM cis c WHERE c.tenant_id = ? AND c.status <> 'VOID' ORDER BY c.pn`,
      [tenantId],
    );
    return {
      desc: '逐构型项核对「当前版本 ↔ 最新冻结基线版本」，并列出最近关联变更单',
      headers: ['件号', '名称', '当前版本', '基线版本', '是否一致', '最近关联变更单'],
      rows: rows.map((r) => [
        s(r, 'pn'), s(r, 'name'), s(r, 'rev'), s(r, 'baseline_rev'),
        !r.baseline_rev ? '未入基线' : s(r, 'rev') === s(r, 'baseline_rev') ? '一致' : '不一致',
        s(r, 'last_change'),
      ]),
    };
  }

  // 7) 基线快照
  if (/基线|快照|冻结/.test(n)) {
    const bls = await q<Row>(
      `SELECT code, name, kind, status, frozen_at, created_by FROM baselines
       WHERE tenant_id = ? ORDER BY id DESC`,
      [tenantId],
    );
    let targetId = baselineId;
    if (!targetId) {
      const latest = await q1<{ id: number }>(
        `SELECT id FROM baselines WHERE tenant_id = ? AND status = 'FROZEN'
         ORDER BY frozen_at DESC, id DESC LIMIT 1`,
        [tenantId],
      );
      targetId = latest?.id ?? null;
    }
    const items = targetId
      ? await q<Row>(
          `SELECT ci_pn, ci_rev, doc_no, doc_rev FROM baseline_items
           WHERE baseline_id = ? ORDER BY ci_pn`,
          [targetId],
        )
      : [];
    const headerRows: Cell[][] = bls.map((b) => [
      s(b, 'code'), s(b, 'name'), baselineSlotToLabel(rules, s(b, 'kind')),
      s(b, 'status') === 'FROZEN' ? '已冻结' : '草稿', s(b, 'frozen_at'), s(b, 'created_by'),
    ]);
    const itemRows: Cell[][] = items.map((i) => [
      s(i, 'ci_pn'), s(i, 'ci_rev'), s(i, 'doc_no'), s(i, 'doc_rev'),
    ]);
    return {
      desc: `基线目录（${bls.length} 条）${targetId ? ` + 所选基线快照条目（${items.length} 项）` : '；当前没有冻结基线'}`,
      headers: [],
      rows: [],
      // 基线材料含「目录 + 快照条目」两张表，用 extra 承载
      extra: {
        blHeaders: ['编号', '名称', '类型', '状态', '冻结时间', '创建人'],
        blRows: headerRows,
        itHeaders: ['件号', '版本', '文件号', '文件版'],
        itRows: itemRows,
      },
    };
  }

  // 8) 构型清单
  if (/构型清单|构型项|物料|BOM|清单|目录/.test(n)) {
    const rows = await q<Row>(
      `SELECT pn, name, type, rev, status, criticality, owner, basis
       FROM cis WHERE tenant_id = ? AND status <> 'VOID' ORDER BY pn`,
      [tenantId],
    );
    return {
      desc: '当前全部有效构型项（件号、版本、状态、关键性、责任人、设计依据）',
      headers: ['件号', '名称', '类型', '版本', '状态', '关键性', '责任人', '设计依据'],
      rows: rows.map((r) => [
        s(r, 'pn'), s(r, 'name'), s(r, 'type'), s(r, 'rev'),
        CI_STATUS_NAMES[s(r, 'status')] ?? s(r, 'status'), s(r, 'criticality'),
        s(r, 'owner'), s(r, 'basis'),
      ]),
    };
  }

  // 9) 配置里自定义的材料名：不报错，给占位说明（第二层/第三层扩展点）
  return {
    desc: '此项由规则配置的「材料清单」定义，当前版本暂无内置数据源。可在第二层条件规则或第三层扩展点接入。',
    headers: [],
    rows: [],
  };
}

/** 受控表单与签署记录：按制度该出的每一张单，逐张列出并可单独打印归档 */
async function formsMaterial(tenantId: number): Promise<Material> {
  type FormRow = Row & { id: number };
  let forms: FormRow[] = [];
  let signoffs: Row[] = [];
  try {
    forms = await q<FormRow>(
      `SELECT i.id, i.code, i.title, i.scene, i.status, i.target_type, i.target_id,
              i.created_by, i.created_at, i.submitted_at, i.closed_at, t.name AS template_name
         FROM form_instances i LEFT JOIN form_templates t ON t.id = i.template_id
        WHERE i.tenant_id = ? ORDER BY i.id DESC`,
      [tenantId],
    );
    signoffs = await q<Row>(
      `SELECT f.instance_id, f.step_no, f.step_name, f.role_label, f.signer_name, f.decision, f.signed_at
         FROM form_signoffs f JOIN form_instances i ON i.id = f.instance_id
        WHERE i.tenant_id = ? ORDER BY f.instance_id, f.step_no`,
      [tenantId],
    );
  } catch {
    return {
      desc: '表单中心尚未初始化；启用后，按制度出的每张申请单与签署记录会自动进入本材料。',
      headers: [],
      rows: [],
    };
  }

  const byInst = new Map<number, string[]>();
  for (const sg of signoffs) {
    const id = Number(sg.instance_id);
    if (!byInst.has(id)) byInst.set(id, []);
    byInst.get(id)!.push(
      `第 ${s(sg, 'step_no')} 步 ${s(sg, 'step_name')}（${s(sg, 'role_label')}）：${s(sg, 'signer_name') || '—'} · ${s(sg, 'decision') === 'APPROVE' ? '同意' : '驳回'} · ${s(sg, 'signed_at')}`,
    );
  }

  const statusText: Record<string, string> = {
    DRAFT: '草稿', SUBMITTED: '待签署', APPROVED: '已批准', REJECTED: '已驳回',
  };
  const html =
    `<p class="desc">共 ${forms.length} 张受控单据。每张单都有独立编号、检查单判定与逐级签署记录，可单独打印归档。</p>` +
    (forms.length === 0
      ? '<p class="empty">（当前还没有单据）</p>'
      : forms
          .map((f) => {
            const signs = byInst.get(Number(f.id)) ?? [];
            return `<div class="formcard">
              <div class="fh"><b>${esc(s(f, 'code'))} · ${esc(s(f, 'title') || s(f, 'template_name'))}</b>
                <span>${esc(statusText[s(f, 'status')] ?? s(f, 'status'))} · ${esc(s(f, 'created_by'))} · ${esc(s(f, 'created_at'))}</span>
                <a href="/api/forms/${Number(f.id)}?format=html" target="_blank">单独打印这张单 →</a></div>
              <div class="fb">模板：${esc(s(f, 'template_name'))}　·　场景：${esc(s(f, 'scene'))}　·　
                提交：${esc(s(f, 'submitted_at') || '—')}　·　批准：${esc(s(f, 'closed_at') || '—')}</div>
              ${signs.length ? `<ul class="fl">${signs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="fb">（尚无签署记录）</div>'}
            </div>`;
          })
          .join(''));

  return { desc: '按制度出的每一张申请单，含检查单判定与逐级签署记录', headers: [], rows: [], html };
}

function renderMaterial(no: number, name: string, m: Material): string {
  let body: string;
  if (m.html) {
    body = m.html;
  } else if (m.extra) {
    body =
      `<h4>基线目录</h4>${table(m.extra.blHeaders, m.extra.blRows)}` +
      `<h4>快照条目</h4>${table(m.extra.itHeaders, m.extra.itRows)}`;
  } else if (m.headers.length) {
    body = table(m.headers, m.rows);
  } else {
    body = '<p class="empty">（本项暂无对应数据源，章节已保留在目录中）</p>';
  }
  const count = m.html
    ? ''
    : `　·　记录数：${m.rows.length || (m.extra ? m.extra.itRows.length : 0)}`;
  return `<section class="mat">
    <h2><span class="no">${no}</span>${esc(name)}</h2>
    <p class="desc">${esc(m.desc)}${count}</p>
    ${body}
  </section>`;
}

/** 导出「证据包」：按生效配置的材料清单，生成一整套可打印材料（HTML） */
export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const rawBaseline = url.searchParams.get('baselineId');
    const baselineId = rawBaseline && Number.isInteger(Number(rawBaseline)) ? Number(rawBaseline) : null;
    const rules = await getEffectiveRules(user.tenantId);

    if (rules.evidence.length === 0) {
      throw new ApiError(400, '生效配置里的「材料清单」是空的，请先在规则配置页填好并重新启用');
    }

    const modelRow = await q1<{ model: string }>(
      `SELECT model FROM cis WHERE tenant_id = ? ORDER BY id LIMIT 1`,
      [user.tenantId],
    );
    const model = modelRow?.model ?? 'EX-01';
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const sections: string[] = [];
    for (let i = 0; i < rules.evidence.length; i++) {
      const name = rules.evidence[i];
      const m = await material(name, user.tenantId, baselineId, rules);
      sections.push(renderMaterial(i + 1, name, m));
    }
    // 固定追加：按制度出的受控表单与签署记录（不依赖材料清单配置，避免漏项）
    const formName = '受控表单与签署记录';
    const formMat = await formsMaterial(user.tenantId);
    sections.push(renderMaterial(rules.evidence.length + 1, formName, formMat));

    const toc = [...rules.evidence, formName]
      .map((name, i) => `<li><span>${i + 1}</span>${esc(name)}</li>`)
      .join('');

    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${esc(rules.evidenceTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
         color: #1e293b; margin: 0; padding: 32px; background: #fff; font-size: 13px; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .sub { color: #64748b; font-size: 12px; line-height: 1.9; }
  .cover { border: 2px solid #4f46e5; border-radius: 10px; padding: 24px 28px; margin-bottom: 28px;
           page-break-after: always; }
  .meta { margin-top: 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 24px; }
  .meta div { border-bottom: 1px solid #e2e8f0; padding: 5px 0; font-size: 12px; }
  .meta b { display: inline-block; width: 92px; color: #64748b; font-weight: 500; }
  .toc { margin: 18px 0 0; padding: 14px 18px; background: #f8fafc; border-radius: 8px; }
  .toc h3 { margin: 0 0 8px; font-size: 14px; }
  .toc ol { margin: 0; padding-left: 20px; columns: 2; }
  .toc li { padding: 3px 0; }
  .toc li span { display: inline-block; width: 22px; color: #818cf8; font-weight: 600; }
  section.mat { margin: 0 0 30px; page-break-inside: avoid; }
  section.mat h2 { font-size: 17px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin: 0 0 6px; }
  section.mat h4 { font-size: 13px; margin: 14px 0 6px; color: #475569; }
  .no { display: inline-block; background: #4f46e5; color: #fff; border-radius: 6px;
        width: 24px; height: 24px; line-height: 24px; text-align: center; font-size: 12px; margin-right: 10px; }
  .desc { color: #64748b; font-size: 11px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; white-space: nowrap; }
  tr:nth-child(even) td { background: #fafafa; }
  .empty { color: #94a3b8; font-size: 12px; padding: 10px 0; }
  .formcard { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin: 0 0 10px; page-break-inside: avoid; }
  .formcard .fh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; font-size: 12px; }
  .formcard .fh span { color: #64748b; font-size: 11px; }
  .formcard .fh a { margin-left: auto; color: #4f46e5; font-size: 11px; }
  .formcard .fb { color: #64748b; font-size: 11px; margin-top: 5px; }
  .formcard ul.fl { margin: 6px 0 0; padding-left: 18px; font-size: 11px; color: #475569; }
  .formcard ul.fl li { padding: 1px 0; }
  footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 10px;
           color: #94a3b8; font-size: 11px; line-height: 1.8; }
  @media print { body { padding: 0; } .cover { page-break-after: always; } }
</style></head><body>
<div class="cover">
  <h1>${esc(rules.evidenceTitle)}</h1>
  <div class="sub">本材料由系统按当前生效的规矩自动汇编，数据全部来自业务库，可直接打印或另存为 PDF 提交审查方。</div>
  <div class="meta">
    <div><b>机型</b>${esc(model)}</div>
    <div><b>生效规矩</b>${esc(rules.name)}${rules.enabled ? '（已启用）' : '（内置默认）'}</div>
    <div><b>材料份数</b>${rules.evidence.length + 1} 份（含受控表单）</div>
    <div><b>生成时间</b>${esc(now)} UTC</div>
    <div><b>类别口径</b>${esc(rules.classes.map((c) => c.label).join(' / '))}</div>
    <div><b>基线口径</b>${esc(rules.baselines.map((b) => b.label).join(' / '))}</div>
  </div>
  <div class="toc"><h3>目录</h3><ol>${toc}</ol></div>
</div>
${sections.join('\n')}
<footer>
  说明：① 目录顺序、类别口径、基线口径均来自「规则配置」第一层，换一套规矩无需改代码。<br>
  ② 事件台账由数据库触发器保证只追加；审批记录与表单签署一经落库不可修改。<br>
  ③ 最后一章「受控表单与签署记录」列出按制度出的每张申请单，点链接可单独打印归档。<br>
  ④ 本文件为系统自动生成的证据汇编，正式提交前请按本单位制度履行签署盖章手续。
</footer>
</body></html>`;

    await logEvent(
      user.tenantId,
      user.name,
      'EVIDENCE_EXPORT',
      'evidence_pack',
      String(baselineId ?? 0),
      `导出「${rules.evidenceTitle}」：${rules.evidence.length} 份材料，按「${rules.name}」的目录顺序`,
    );

    return new Response(`\uFEFF${html}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="evidence-${model}-${now.slice(0, 10).replace(/-/g, '')}.html"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
