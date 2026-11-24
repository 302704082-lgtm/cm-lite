import { NextRequest } from 'next/server';
import { handle, ok, requireUser } from '@/lib/api';
import { exec, insert, q, q1 } from '@/lib/db';
import { SECTIONS, type ProfileStep } from '@/lib/rule-config';

export const dynamic = 'force-dynamic';

/** 读取当前配置档案；没有就是「空白」 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const p = await q1<{ id: number; status: string; name: string }>(
      'SELECT id, status, name FROM rule_profiles WHERE tenant_id = ? ORDER BY id DESC LIMIT 1',
      [user.tenantId],
    );
    if (!p) return ok({ blank: true, status: 'BLANK', active: false, values: {}, steps: [] });

    const settings = await q<{ field_key: string; field_value: string }>(
      'SELECT field_key, field_value FROM profile_settings WHERE profile_id = ?',
      [p.id],
    );
    const steps = await q<ProfileStep>(
      'SELECT class_code, step_no, step_name, role_code FROM profile_steps WHERE profile_id = ? ORDER BY class_code, step_no',
      [p.id],
    );
    const values: Record<string, string> = {};
    for (const s of settings) values[s.field_key] = s.field_value;
    return ok({ blank: false, status: p.status, active: p.status === 'ACTIVE', name: p.name, values, steps });
  });
}

/** 保存第一层草稿（不启用、不影响现有主流程） */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await req.json()) as {
      values?: Record<string, string>;
      steps?: ProfileStep[];
    };
    const values = body.values ?? {};
    const steps = Array.isArray(body.steps) ? body.steps.slice(0, 60) : [];

    const allowed = new Set(SECTIONS.flatMap((s) => s.fields.map((f) => f.key)));
    for (const k of Object.keys(values)) {
      if (!allowed.has(k)) return ok({ error: `未知字段 ${k}` }, 400);
    }
    for (const s of steps) {
      if (!Number.isInteger(Number(s.step_no)) || Number(s.step_no) < 1) {
        return ok({ error: '步骤序号必须是正整数' }, 400);
      }
    }

    let p = await q1<{ id: number }>(
      'SELECT id FROM rule_profiles WHERE tenant_id = ? ORDER BY id DESC LIMIT 1',
      [user.tenantId],
    );
    const profileId = p
      ? p.id
      : await insert(
          'INSERT INTO rule_profiles (tenant_id, name, status) VALUES (?, ?, ?)',
          [user.tenantId, '我的规矩', 'DRAFT'],
        );
    if (p) {
      await exec(
        "UPDATE rule_profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
        [profileId],
      );
    }

    await exec('DELETE FROM profile_settings WHERE profile_id = ?', [profileId]);
    for (const sec of SECTIONS) {
      for (const f of sec.fields) {
        await insert(
          'INSERT INTO profile_settings (profile_id, section, field_key, field_label, field_value) VALUES (?, ?, ?, ?, ?)',
          [profileId, sec.key, f.key, f.label, String(values[f.key] ?? '').trim()],
        );
      }
    }

    await exec('DELETE FROM profile_steps WHERE profile_id = ?', [profileId]);
    for (const s of steps) {
      await insert(
        'INSERT OR IGNORE INTO profile_steps (profile_id, class_code, step_no, step_name, role_code) VALUES (?, ?, ?, ?, ?)',
        [
          profileId,
          String(s.class_code ?? '').trim().slice(0, 20),
          Number(s.step_no),
          String(s.step_name ?? '').trim().slice(0, 60),
          String(s.role_code ?? '').trim().slice(0, 40),
        ],
      );
    }

    await exec(
      'INSERT INTO events (tenant_id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
      [
        user.tenantId,
        user.name,
        'RULE_CONFIG_SAVE',
        'rule_profile',
        String(profileId),
        `保存第一层配置草稿：${Object.values(values).filter(Boolean).length} 个格子有值，${steps.length} 条审批步骤`,
      ],
    );

    return ok({ saved: true, profileId, filled: Object.values(values).filter(Boolean).length });
  });
}
