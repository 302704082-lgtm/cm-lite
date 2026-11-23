import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, q1 } from '@/lib/db';
import { ApiError, handle, ok } from '@/lib/api';
import { setPendingCookie, signPending } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  slug: z.string().trim().min(1, '请输入通道标识'),
  passcode: z.string().min(1, '请输入通道密码'),
});

/** 第一层门禁：租户通道密码 → 返回该租户可选用户列表 */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');

    const tenant = await q1<{ id: number; slug: string; name: string; passcode_hash: string }>(
      `SELECT id, slug, name, passcode_hash FROM tenants WHERE slug = ?`,
      [parsed.data.slug.toLowerCase()],
    );
    if (!tenant) throw new ApiError(401, '通道不存在或密码错误');
    if (!bcrypt.compareSync(parsed.data.passcode, tenant.passcode_hash)) {
      throw new ApiError(401, '通道不存在或密码错误');
    }

    const users = await q<{ id: number; name: string; role_code: string }>(
      `SELECT id, name, role_code FROM users WHERE tenant_id = ? ORDER BY id`,
      [tenant.id],
    );

    await setPendingCookie(
      await signPending({ tenantId: tenant.id, slug: tenant.slug, tenantName: tenant.name }),
    );

    return ok({
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      users,
    });
  });
}
