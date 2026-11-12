'use client';

import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';

import type { DocumentPagePreview } from '@/types/platform';

export function DocumentPagePreviewPanel({
  pages,
}: {
  pages: DocumentPagePreview[];
}) {
  const [pageIndex, setPageIndex] = useState(0);
  if (!pages.length) return null;
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  return <section className="document-preview-panel">
    <header>
      <FileText size={16} />
      <div><strong>文档页面预览</strong><small>这里展示上传文件的实际页面，用于查看版式；正文内容不会被当作模板结构</small></div>
      <div className="document-page-nav">
        <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((value) => Math.max(0, value - 1))} aria-label="上一页"><ChevronLeft size={16} /></button>
        <span>{pageIndex + 1} / {pages.length}</span>
        <button type="button" disabled={pageIndex === pages.length - 1} onClick={() => setPageIndex((value) => Math.min(pages.length - 1, value + 1))} aria-label="下一页"><ChevronRight size={16} /></button>
      </div>
    </header>
    <div className="document-page-stage">
      <article className="document-page-sheet">
        {page.imageDataUrl ? <img src={page.imageDataUrl} alt={`第 ${page.index} 页`} /> : <div className="document-page-text" dangerouslySetInnerHTML={{ __html: page.html || `<p>${escapeHtml(page.text)}</p>` }} />}
      </article>
    </div>
    <footer className="document-page-caption"><strong>{page.title || `第 ${page.index} 页`}</strong><span>仅用于预览版式</span></footer>
  </section>;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
