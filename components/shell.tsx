'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { href: '/app', label: '总览', hint: '待办与预警' },
  { href: '/app/structure', label: '构型项', hint: '结构树与属性' },
  { href: '/app/baselines', label: '基线', hint: '快照与冻结' },
  { href: '/app/changes', label: '变更', hint: 'PR / CR / CN' },
  { href: '/app/deviations', label: '偏离/让步', hint: '数量与时效' },
  { href: '/app/records', label: '纪实台账', hint: '事件与实物' },
  { href: '/app/forms', label: '受控表单', hint: '每步一张单' },
  { href: '/app/flows', label: '流程配置', hint: '步骤与签字' },
  { href: '/app/rules', label: '规则配置', hint: '内容口径' },
];

export default function Shell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; roleLabel: string; tenantName: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-56 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            CM
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-800">构型管理平台</div>
            <div className="truncate text-[11px] text-slate-400">{user.tenantName}</div>
          </div>
        </div>

        <nav className="mt-2 space-y-0.5 px-2">
          {NAV.map((item) => {
            const active =
              item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-indigo-50 font-medium text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span>{item.label}</span>
                <span className={`text-[10px] ${active ? 'text-indigo-400' : 'text-slate-300'}`}>
                  {item.hint}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-100 px-4 py-3 text-[11px] leading-5 text-slate-400">
          数据全部虚构，仅用于演示
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="md:hidden font-semibold text-slate-700">CM</span>
            <span className="hidden md:inline">当前通道：{user.tenantName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-800">{user.name}</div>
              <div className="text-[11px] text-slate-400">{user.roleLabel}</div>
            </div>
            <button
              onClick={logout}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              退出
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
