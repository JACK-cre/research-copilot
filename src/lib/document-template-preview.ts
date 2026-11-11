import { Buffer } from 'node:buffer';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export interface DocumentPagePreview {
  index: number;
  title: string;
  text: string;
}

export interface DocumentTemplatePreview {
  kind: 'pdf' | 'docx';
  pages: DocumentPagePreview[];
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export async function extractDocumentTemplatePreview(bytes: Uint8Array, extension: '.pdf' | '.docx'): Promise<DocumentTemplatePreview> {
  if (extension === '.pdf') {
    const pdf = await getDocumentProxy(bytes.slice());
    try {
      const parsed = await extractText(pdf, { mergePages: false });
      const pages = parsed.text.map((text, index) => ({
        index: index + 1,
        title: clean(text).slice(0, 60) || `第 ${index + 1} 页`,
        text: clean(text).slice(0, 3000),
      })).filter((page) => page.text);
      if (!pages.length) throw new Error('PDF 没有可预览文字。');
      return { kind: 'pdf', pages: pages.slice(0, 60) };
    } finally {
      const destroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy;
      if (typeof destroy === 'function') await destroy.call(pdf).catch(() => undefined);
    }
  }
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const paragraphs = result.value.split(/\n{2,}/).map(clean).filter(Boolean);
  const pages: DocumentPagePreview[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if ((current + '\n' + paragraph).length > 1800 && current) {
      pages.push({ index: pages.length + 1, title: current.slice(0, 60), text: current });
      current = paragraph;
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
    }
  }
  if (current) pages.push({ index: pages.length + 1, title: current.slice(0, 60), text: current });
  if (!pages.length) throw new Error('DOCX 没有可预览文字。');
  return { kind: 'docx', pages: pages.slice(0, 60) };
}
