import JSZip from 'jszip';

import { extractDocxTemplateStructure } from '@/lib/docx-template-structure';
import { extractXmlTexts } from '@/lib/template-text';
import type { SourcePage } from '@/lib/chunk-context';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function extractPptxTableText(xml: string): string[] {
  return [...xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)].flatMap((match) => {
    const body = match[1] ?? '';
    const cells = [...body.matchAll(/<a:tc>[\s\S]*?<a:t>([^<]*)<\/a:t>[\s\S]*?<\/a:tc>/g)]
      .map((cell) => cell[1]?.trim()).filter((cell): cell is string => Boolean(cell));
    return cells.length ? [`表格：${cells.join(' | ')}`] : [];
  });
}

function extractPptxChartHints(xml: string): string[] {
  const type = ['barChart', 'lineChart', 'pieChart', 'areaChart', 'scatterChart', 'doughnutChart', 'radarChart']
    .find((name) => new RegExp(`<c:${name}\\b`).test(xml));
  const title = xml.match(/<c:title>[\s\S]*?<a:t>([^<]+)<\/a:t>/)?.[1]?.trim();
  return type ? [`图表：${type}${title ? `（${title}）` : ''}`] : [];
}

export function isDocx(name: string, mimeType = ''): boolean {
  return mimeType === DOCX || /\.docx$/i.test(name);
}

export function isPptx(name: string, mimeType = ''): boolean {
  return mimeType === PPTX || /\.pptx$/i.test(name);
}

export async function extractOfficePages(bytes: Uint8Array, name: string, mimeType: string): Promise<SourcePage[]> {
  if (isDocx(name, mimeType)) {
    const structure = await extractDocxTemplateStructure(bytes);
    const lines = structure.paragraphs.map(paragraph => `${paragraph.headingLevel ? `${'#'.repeat(paragraph.headingLevel)} ` : ''}${paragraph.text}`).join('\n\n');
    const tables = structure.tables.map(table => `表格：${table.cells.join(' | ')}`).join('\n\n');
    return [{ text: [lines, tables].filter(Boolean).join('\n\n') }];
  }
  if (isPptx(name, mimeType)) {
    const zip = await JSZip.loadAsync(bytes);
    const slideNames = Object.keys(zip.files)
      .filter(file => /^ppt\/slides\/slide\d+\.xml$/i.test(file))
      .sort((left, right) => Number(left.match(/slide(\d+)/i)?.[1] ?? 0) - Number(right.match(/slide(\d+)/i)?.[1] ?? 0));
    return Promise.all(slideNames.map(async (file, index) => {
      const xml = await zip.files[file].async('string');
      const notesXml = await zip.file(`ppt/notesSlides/notesSlide${index + 1}.xml`)?.async('string').catch(() => '') ?? '';
      const parts = [
        extractXmlTexts(xml).join('\n'),
        ...extractPptxTableText(xml),
        ...extractPptxChartHints(xml),
        notesXml ? `讲稿备注：${extractXmlTexts(notesXml).join(' ')}` : '',
      ].filter(Boolean);
      return { page: index + 1, text: `# 幻灯片 ${index + 1}\n${parts.join('\n')}` };
    }));
  }
  throw new Error('不支持的 Office 文档类型。');
}
