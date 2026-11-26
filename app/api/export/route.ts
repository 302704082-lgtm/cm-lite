import { q, q1 } from '@/lib/db';
import { handle, requireUser, toId, ApiError } from '@/lib/api';
import { exportRows } from '@/lib/queries';
import { logEvent } from '@/lib/events';
import { CI_STATUS_NAMES, CHANGE_STATUS_NAMES } from '@/lib/constants';
import { slotToLabel, getEffectiveRules } from '@/lib/profile';
import type { Baseline } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
const s = (r: unknown, k: string): string =>
  String((r as Record<string, unknown> | null)?.[k] ?? '');

function csvCell(v: string | null | undefined): string {
  const str = (v ?? '').toString();
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 汇总每个构型项的：最新变更单、版本履历、记录完整性 */
async function collect(tenantId: number) {
  const changes = await q<Row>(
    `SELECT code, kind, title, ci_pn, new_pn, from_rev, to_rev, class_result, status, created_at
       FROM changes WHERE tenant_id = ? ORDER BY id DESC`,
    [tenantId],
  );
  let revisions: Row[] = [];
  try {
    revisions = await q<Row>(
      `SELECT pn, rev, change_code, class_result, note, actor, created_at
         FROM ci_revisions WHERE tenant_id = ? ORDER BY pn, id`,
      [tenantId],
    );
  } catch {
    revisions = [];
  }
  const lastChange = new Map<string, Row>();
  for (const c of changes) {
    for (const pn of [s(c, 'ci_pn'), s(c, 'new_pn')]) {
      if (pn && !lastChange.has(pn)) lastChange.set(pn, c);
    }
  }
  const revByPn = new Map<string, Row[]>();
  for (const r of revisions) {
    const pn = s(r, 'pn');
    if (!revByPn.has(pn)) revByPn.set(pn, []);
    revByPn.get(pn)!.push(r);
  }
  return { lastChange, revByPn };
}

/** 导出《构型状态一览表》：默认 CSV（带 BOM）；mode=history 输出含版本履历链的可打印 HTML */
export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const baselineId = toId(url.searchParams.get('baselineId') ?? undefined);
    const mode = url.searchParams.get('mode') ?? 'csv';

    const bl = await q1<Baseline>(`SELECT * FROM baselines WHERE tenant_id = ? AND id = ?`, [
      user.tenantId,
      baselineId,
    ]);
    if (!bl) throw new ApiError(404, '基线不存在');

    const rows = await exportRows(baselineId);
    const rules = await getEffectiveRules(user.tenantId);
    const { lastChange, revByPn } = await collect(user.tenantId);

    const head = [
      '编号 / 件号', '名称', '当前版本', '关联文件号', '文件版本',
      '受控状态', '最新变更单号', '变更内容', '类别', '变更状态',
      '版本数', '记录完整性', '责任部门 / 人',
    ];
    const lines = [head.join(',')];
    const bodyRows: string[][] = [];

    for (const r of rows) {
      const pn = s(r, 'ci_pn');
      const ch = lastChange.get(pn);
      const revs = revByPn.get(pn) ?? [];
      const complete = revs.length > 0 ? '完整（含版本履历）' : '待补履历';
      const cells = [
        pn,
        s(r, 'ci_name') || pn,
        s(r, 'ci_rev'),
        s(r, 'doc_no') || '—',
        s(r, 'doc_rev') || '—',
        (CI_STATUS_NAMES[s(r, 'ci_status')] ?? s(r, 'ci_status')) || '—',
        ch ? s(ch, 'code') : '—',
        ch ? s(ch, 'title') : '—',
        ch && s(ch, 'class_result') ? slotToLabel(rules, s(ch, 'class_result')) : '—',
        ch ? (CHANGE_STATUS_NAMES[s(ch, 'status')] ?? s(ch, 'status')) : '—',
        String(revs.length || 1),
        complete,
        '—',
      ];
      lines.push(cells.map(csvCell).join(','));
      bodyRows.push(cells);
    }

    await logEvent(
      user.tenantId,
      user.name,
      'EXPORT',
      'baseline',
      baselineId,
      `导出《构型状态一览表》：${bl.model} / ${bl.code}（${rows.length} 项，${mode === 'history' ? '含版本履历链' : 'CSV'}）`,
    );

    if (mode !== 'history') {
      return new Response(`\uFEFF${lines.join('\r\n')}`, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="cm-status-${bl.model}-${bl.code}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // ---- HTML 版：主表 + 每个构型项一条完整版本履历链 ----
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const mainTable = `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${bodyRows
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;

    const histories = rows
      .map((r) => {
        const pn = s(r, 'ci_pn');
        const revs = revByPn.get(pn) ?? [];
        const chain = revs.length
          ? revs
              .map(
                (v) =>
                  `<tr><td>${esc(s(v, 'rev'))}</td><td>${esc(s(v, 'change_code') || '初始设计版本')}</td>
                   <td>${esc(s(v, 'note'))}</td><td>${esc(s(v, 'actor'))}</td><td>${esc(s(v, 'created_at'))}</td></tr>`,
              )
              .join('')
          : `<tr><td>${esc(s(r, 'ci_rev'))}</td><td>初始设计版本</td><td>基线快照（尚未记录后续变更）</td><td>—</td><td>—</td></tr>`;
        return `<section>
          <h3>${esc(pn)} · ${esc(s(r, 'ci_name') || pn)} <span>当前 ${esc(s(r, 'ci_rev'))} · 共 ${revs.length || 1} 版</span></h3>
          <table><thead><tr><th>版本</th><th>来源变更单</th><th>说明</th><th>操作人</th><th>时间</th></tr></thead>
          <tbody>${chain}</tbody></table>
        </section>`;
      })
      .join('');

    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>构型状态一览表（含版本履历链）· ${esc(bl.model)} / ${esc(bl.code)}</title>
<style>
  body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#1e293b;margin:28px;font-size:12px;line-height:1.6}
  h1{font-size:21px;margin:0 0 4px}.sub{color:#64748b;font-size:11px;margin-bottom:18px}
  h2{font-size:14px;margin:22px 0 8px;padding-left:8px;border-left:3px solid #4f46e5}
  h3{font-size:12px;margin:16px 0 6px;color:#334155}h3 span{font-weight:400;color:#94a3b8;margin-left:8px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:11px}
  th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top}
  thead th{background:#f1f5f9;white-space:nowrap}
  section{page-break-inside:avoid}
  .foot{margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
  @media print{body{margin:12mm}@page{size:A4 landscape;margin:12mm}}
</style></head><body>
<h1>构型状态一览表（含版本履历链）</h1>
<div class="sub">机型 ${esc(bl.model)} · 基线 ${esc(bl.code)} ${esc(bl.name)} · ${rows.length} 项 · 生成 ${esc(now)} UTC · 生效规矩 ${esc(rules.name)}</div>
<h2>一、构型状态总表（${head.length} 列）</h2>${mainTable}
<h2>二、逐项版本履历链（从首版到当前，每一版对应哪张变更单）</h2>${histories}
<div class="foot">版本履历由变更执行时自动写入，只追加不可修改；可用浏览器或 WPS 打开后打印成 PDF 归档。全部内容为脱敏演示值。</div>
</body></html>`;

    return new Response(`\uFEFF${html}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="cm-status-history-${bl.model}-${bl.code}.html"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
