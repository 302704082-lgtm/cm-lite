import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from './session';

/** 业务错误：直接映射为 HTTP 状态码（403 越权 / 409 规则冲突 / 400 参数） */
export class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** 一律从会话取用户与 tenant_id，绝不接受前端传参（§0 第 6 条） */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new ApiError(401, '登录已过期，请重新登录');
  return user;
}

export function ok(data: unknown = { ok: true }, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: e.status });
    }
    console.error('[api] 未捕获异常', e);
    const msg = e instanceof Error ? e.message : '未知错误';
    return NextResponse.json({ error: `服务器内部错误：${msg}` }, { status: 500 });
  }
}

/** 路由参数里的 id 转正整数，非法即 400 */
export function toId(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, '参数非法');
  return n;
}

export const dynamic = 'force-dynamic';
