import { NextRequest } from 'next/server';
import { handle, ok, requireUser, ApiError } from '@/lib/api';
import { exec, q, q1 } from '@/lib/db';
import { getEffectiveRules } from '@/lib/profile';
import { preview, type ProfileStep } from '@/lib/rule-config';
import { logEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

/**
 * 启用 / 停用配置档案。
 * 启用前用试跑逻辑校验：缺必填格子的配置不允许启用。
 * 同一租户只保留一套 ACTIVE。
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { activate?: boolean };
    const activate = body.activate !== false;

    if (!activate) {
      const n = await exec(
        `UPDATE rule_profiles SET status = 'DRAFT' WHERE tenant_id = ? AND status = 'ACTIVE'`,
        [user.tenantId],
      );
      await logEvent(
        user.tenantId, user.name, 'RULE_CONFIG_DEACTIVATE', 'rule_profile', '0',
        '停用配置，主流程回退到内置规则',
      );
      return ok({ active: false, changed: n });
    }

    const p = await q1<{ id: number; name: string }>(
      `SELECT id, name FROM rule_profiles WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`,
      [user.tenantId],
    );
    if (!p) throw new ApiError(400, '还没有保存过配置草稿，先填表并保存');

    const rows = await q<{ field_key: string; field_value: string }>(
      `SELECT field_key, field_value FROM profile_settings WHERE profile_id = ?`,
      [p.id],
    );
    const steps = await q<ProfileStep>(
      `SELECT class_code, step_no, step_name, role_code FROM profile_steps WHERE profile_id = ?`,
      [p.id],
    );
    const values: Record<string, string> = {};
    for (const r of rows) values[r.field_key] = String(r.field_value ?? '');

    const result = preview({ values, steps });
    if (!result.ok) {
      throw new ApiError(
        400,
        `这套规矩还跑不起来，差 ${result.missing.length} 项：${result.missing.join('、')}。补齐后再启用。`,
      );
    }

    await exec(
      `UPDATE rule_profiles SET status = 'DRAFT' WHERE tenant_id = ? AND status = 'ACTIVE'`,
      [user.tenantId],
    );
    await exec(
      `UPDATE rule_profiles SET status = 'ACTIVE', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      [p.id],
    );

    await logEvent(
      user.tenantId, user.name, 'RULE_CONFIG_ACTIVATE', 'rule_profile', String(p.id),
      `启用配置「${String(p.name ?? '我的规矩')}」：${result.summary}`,
    );

    const rules = await getEffectiveRules(user.tenantId);
    return ok({
      active: true,
      profileId: p.id,
      name: rules.name,
      classes: rules.classes.map((c) => c.label),
      chainLengths: Object.fromEntries(
        rules.classes.map((c) => [c.label, (rules.chains[c.code] ?? []).length]),
      ),
    });
  });
}
