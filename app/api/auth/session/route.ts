import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q1 } from '@/lib/db';
import { ApiError, handle, ok } from '@/lib/api';
import { clearPendingCookie, getPendingTenant, setSessionCookie, signSession } from '@/lib/session';
import { logEvent } from '@/lib/events';
import type { RoleCode } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  userId: z.coerce.number().int().positive(),
  pin: z.string().min(1, '请输入 PIN'),
});

/** 第二层门禁：选定用户 + PIN → 签发 12 小时会话 */
export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const pending = await getPendingTenant();
    if (!pending) throw new ApiError(401, '请先通过通道密码验证');

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? '参数非法');

    const user = await q1<{ id: number; name: string; role_code: string; pin_hash: string }>(
      `SELECT id, name, role_code, pin_hash FROM users WHERE id = ? AND tenant_id = ?`,
      [parsed.data.userId, pending.tenantId],
    );
    if (!user) throw new ApiError(401, '用户不存在');
    if (!bcrypt.compareSync(parsed.data.pin, user.pin_hash)) throw new ApiError(401, 'PIN 不正确');

    const token = await signSession({
      userId: user.id,
      tenantId: pending.tenantId,
      name: user.name,
      role: user.role_code as RoleCode,
      slug: pending.slug,
      tenantName: pending.tenantName,
    });
    await setSessionCookie(token);
    await clearPendingCookie();

    await logEvent(pending.tenantId, user.name, 'LOGIN', 'user', user.id, `${user.name} 登录演示空间`);

    return ok({ user: { id: user.id, name: user.name, role: user.role_code } });
  });
}
