'use client';

import { FileText } from 'lucide-react';

import type { DocumentPagePreview } from '@/types/platform';

export function DocumentPagePreviewPanel({
  pages,
  onSelect,
}: {
  pages: DocumentPagePreview[];
  onSelect?: (page: DocumentPagePreview) => void;
}) {
  if (!pages.length) return null;
  return <section className="document-preview-panel">
    <header><FileText size={16} /><div><strong>文档页面预览</strong><small>从上传的 PDF / Word 提取的页面结构，可点击定位章节</small></div></header>
    <div className="document-page-grid">{pages.map((page) => <button type="button" className="document-page-card" key={page.index} onClick={() => onSelect?.(page)}>
      <span className="document-page-number">{String(page.index).padStart(2, '0')}</span>
      <strong>{page.title || `第 ${page.index} 页`}</strong>
      <p>{page.text.slice(0, 240)}</p>
    </button>)}</div>
  </section>;
}
