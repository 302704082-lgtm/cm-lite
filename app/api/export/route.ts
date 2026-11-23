import { q1 } from '@/lib/db';
import { handle, requireUser, toId, ApiError } from '@/lib/api';
import { exportRows } from '@/lib/queries';
import { logEvent } from '@/lib/events';
import { CI_STATUS_NAMES } from '@/lib/constants';
import type { Baseline } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvCell(v: string | null | undefined): string {
  const s = (v ?? '').toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 导出《构型状态一览表》CSV（带 BOM，Excel 直接打开不乱码） */
export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const baselineId = toId(url.searchParams.get('baselineId') ?? undefined);

    const bl = await q1<Baseline>(`SELECT * FROM baselines WHERE tenant_id = ? AND id = ?`, [
      user.tenantId,
      baselineId,
    ]);
    if (!bl) throw new ApiError(404, '基线不存在');

    const rows = await exportRows(baselineId);

    const header = ['件号', '名称', '版本', '文件号', '文件版', '状态'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.ci_pn),
          csvCell(r.ci_name ?? ''),
          csvCell(r.ci_rev),
          csvCell(r.doc_no ?? ''),
          csvCell(r.doc_rev ?? ''),
          csvCell(CI_STATUS_NAMES[r.ci_status ?? ''] ?? r.ci_status ?? ''),
        ].join(','),
      );
    }

    await logEvent(
      user.tenantId,
      user.name,
      'EXPORT',
      'baseline',
      baselineId,
      `导出《构型状态一览表》：${bl.model} / ${bl.code}（${rows.length} 项）`,
    );

    const body = `\uFEFF${lines.join('\r\n')}`;
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cm-status-${bl.model}-${bl.code}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
