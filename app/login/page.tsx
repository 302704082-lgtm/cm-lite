'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UserOption {
  id: number;
  name: string;
  role_code: string;
}

const ROLE_NAMES: Record<string, string> = {
  DESIGN_ENG: '设计工程师',
  CM_ENGINEER: '构型管理工程师',
  QUALITY_ENG: '质量工程师',
  AIRWORTHINESS: '适航管理',
  PRODUCTION: '生产',
  DEPT_DIRECTOR: '部门总监',
  TECH_DIRECTOR: '技术分管',
  CCB_CHAIR: '构型管理委员会主任',
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'tenant' | 'user'>('tenant');
  const [slug, setSlug] = useState('demo');
  const [passcode, setPasscode] = useState('demo123');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [pin, setPin] = useState('1234');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitTenant(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '通道验证失败');
      setUsers(data.users);
      setTenantName(data.tenant.name);
      setSelected(data.users[0]?.id ?? null);
      setStep('user');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '通道验证失败');
    } finally {
      setBusy(false);
    }
  }

  async function submitUser(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setErr('请选择用户');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '登录失败');
      router.push('/app');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 block text-center text-sm text-slate-500 hover:text-slate-700">
          ← 返回门面
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                CM
              </div>
              <span className="text-base font-semibold text-slate-900">构型管理平台</span>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {step === 'tenant'
                ? '第 1 层门禁 · 输入通道标识与通道密码'
                : `第 2 层门禁 · ${tenantName}：选择用户并输入 PIN`}
            </p>
          </div>

          {step === 'tenant' ? (
            <form onSubmit={submitTenant} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">通道标识</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="demo"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">通道密码</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="demo123"
                />
              </div>
              {err ? <p className="text-xs text-rose-600">{err}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? '验证中…' : '进入通道'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitUser} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">选择用户</label>
                <div className="max-h-64 space-y-1.5 overflow-auto rounded-lg border border-slate-200 p-1.5">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelected(u.id)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                        selected === u.id
                          ? 'bg-indigo-50 text-indigo-900 ring-1 ring-inset ring-indigo-200'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-medium">{u.name}</span>
                      <span className="text-xs text-slate-500">{ROLE_NAMES[u.role_code] ?? u.role_code}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">PIN</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-[0.3em] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="1234"
                  maxLength={8}
                />
              </div>
              {err ? <p className="text-xs text-rose-600">{err}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? '登录中…' : '登录'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('tenant');
                  setErr(null);
                }}
                className="w-full text-xs text-slate-500 hover:text-slate-700"
              >
                返回上一步
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">
          演示租户：demo / demo123，PIN 统一 1234。全部数据虚构。
        </p>
      </div>
    </main>
  );
}
