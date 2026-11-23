import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { RoleCode } from './constants';

const SESSION_COOKIE = 'cm_session';
const PENDING_COOKIE = 'cm_pending';
const SESSION_HOURS = 12;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < 32) {
    // 开发环境兜底；生产必须配 JWT_SECRET（>=32 位），否则登录态会在重启后失效
    return new TextEncoder().encode('cm-lite-dev-only-secret-key-please-change-32');
  }
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  userId: number;
  tenantId: number;
  name: string;
  role: RoleCode;
  slug: string;
  tenantName: string;
}

interface PendingTenant {
  tenantId: number;
  slug: string;
  tenantName: string;
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function signPending(t: PendingTenant): Promise<string> {
  return new SignJWT({ ...t, pending: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret());
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function setPendingCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
}

export async function clearPendingCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(PENDING_COOKIE);
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PENDING_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.userId || !payload.tenantId) return null;
    return {
      userId: Number(payload.userId),
      tenantId: Number(payload.tenantId),
      name: String(payload.name),
      role: payload.role as RoleCode,
      slug: String(payload.slug),
      tenantName: String(payload.tenantName),
    };
  } catch {
    return null;
  }
}

export async function getPendingTenant(): Promise<PendingTenant | null> {
  const jar = await cookies();
  const token = jar.get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.pending) return null;
    return {
      tenantId: Number(payload.tenantId),
      slug: String(payload.slug),
      tenantName: String(payload.tenantName),
    };
  } catch {
    return null;
  }
}
