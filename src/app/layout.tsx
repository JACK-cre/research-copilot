import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Research Copilot',
  description: '论文检索、知识库、研究报告与演示文稿工作台',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
