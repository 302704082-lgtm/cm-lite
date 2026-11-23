import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '构型管理平台 · 毛坯房演示',
  description: '多租户构型管理演示系统：变更控制、审批防线、证据留痕',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
