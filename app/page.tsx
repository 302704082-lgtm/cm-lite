import Link from 'next/link';
import { q1, q } from '@/lib/db';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

const FEATURES = [
  ['变更唯一入口', 'PR → CR → CN 一条线，任何改动都留痕'],
  ['审批防线', '按 I / II / III 类自动生成审批链，职责分离在服务端强制'],
  ['基线快照', '冻结即只读，改动只能走变更；两个基线一键 diff'],
  ['证据留痕', '纪实日志只追加，数据库层直接拒绝修改'],
];

export default async function LandingPage() {
  let tenantCount = 0;
  let demoReady = false;
  try {
    const row = await q1<{ n: number }>(`SELECT COUNT(*) AS n FROM tenants`, []);
    tenantCount = row?.n ?? 0;
    const demo = await q<{ slug: string }>(`SELECT slug FROM tenants WHERE slug = 'demo'`, []);
    demoReady = demo.length > 0;
  } catch {
    // 库还没初始化时门面也要能打开
    tenantCount = 0;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              CM
            </div>
            <span className="text-sm font-semibold text-slate-800">构型管理平台</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
              毛坯房演示版
            </span>
          </div>
          <div className="text-xs text-slate-500 tnum">已有 {tenantCount} 个租户空间</div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-10">
        <h1 className="max-w-3xl text-3xl font-semibold leading-snug tracking-tight text-slate-900">
          管住每一次改动 —— 改什么、影响谁、谁批准、怎么落实、装在哪台、怎么举证。
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
          它不是 PLM，不是文档管理系统，也不是 BOM 编辑器。唯一主线是
          <strong className="text-slate-800">变更控制 + 审批防线 + 证据留痕</strong>。
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([title, desc]) => (
            <Card key={title} className="bg-white/70">
              <div className="text-sm font-semibold text-slate-800">{title}</div>
              <div className="mt-1.5 text-xs leading-5 text-slate-500">{desc}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <Card className="border-indigo-100 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-900">演示空间</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {demoReady ? '可用' : '待初始化'}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-500">
                机型 EX-01 · 15 项构型项 · 1 个已冻结基线 · 2 台实物；通道密码与演示账号见下方说明。
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
            >
              进入演示空间 →
            </Link>
          </div>

          <div className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
            通道密码 <code className="rounded bg-white px-1 py-0.5 font-mono">demo123</code>
            ，登录后选用户并输入 PIN <code className="rounded bg-white px-1 py-0.5 font-mono">1234</code>。
            数据全部虚构，不涉及任何真实企业、人员或文号。
          </div>
        </Card>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-5xl px-6 text-xs leading-6 text-slate-400">
          本系统为行业兴趣开源演示项目，与任何在职企业无关；页面内企业名、人员名、文号均为虚构。
        </div>
      </footer>
    </main>
  );
}
