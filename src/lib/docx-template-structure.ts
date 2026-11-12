import JSZip from 'jszip';

export interface DocxParagraphRule {
  text: string;
  alignment?: 'left' | 'center' | 'right';
  fontSize?: number;
  bold?: boolean;
  headingLevel?: number;
}

export interface DocxTableRule {
  rows: number;
  columns: number;
  cells: string[];
}

export interface DocxTemplateStructure {
  title?: string;
  paragraphs: DocxParagraphRule[];
  tables: DocxTableRule[];
}

function attr(xml: string, name: string): string | undefined {
  return xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function decode(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function paragraphText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((match) => decode(match[1] ?? '')).join('').trim();
}

function paragraphRule(xml: string): DocxParagraphRule | null {
  const text = paragraphText(xml);
  if (!text) return null;
  const style = attr(xml.match(/<w:pStyle\b[^>]*>/)?.[0] ?? '', 'w:val') ?? '';
  const headingMatch = style.match(/Heading\s*(\d)/i) ?? style.match(/标题\s*(\d)/);
  const size = Number(attr(xml.match(/<w:sz\b[^>]*>/)?.[0] ?? '', 'w:val'));
  const alignment = attr(xml.match(/<w:jc\b[^>]*>/)?.[0] ?? '', 'w:val');
  return {
    text,
    alignment: alignment === 'center' ? 'center' : alignment === 'right' ? 'right' : 'left',
    fontSize: Number.isFinite(size) && size > 0 ? size / 2 : undefined,
    bold: /<w:b\b/.test(xml),
    headingLevel: headingMatch ? Number(headingMatch[1]) : undefined,
  };
}

export async function extractDocxTemplateStructure(bytes: Uint8Array): Promise<DocxTemplateStructure> {
  const zip = await JSZip.loadAsync(bytes);
  const document = await zip.file('word/document.xml')?.async('string');
  if (!document) throw new Error('DOCX 缺少 document.xml。');
  const body = document.match(/<w:body>([\s\S]*?)<\/w:body>/)?.[1] ?? document;
  const tables: DocxTableRule[] = [];
  for (const table of body.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)) {
    const tableXml = table[1] ?? '';
    const rows = [...tableXml.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)];
    const cells = [...tableXml.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((cell) => paragraphText(cell[1] ?? '')).filter(Boolean);
    const columns = Math.max(1, ...rows.map((row) => (row[1]?.match(/<w:tc>/g) ?? []).length));
    tables.push({ rows: rows.length, columns, cells: cells.slice(0, 30) });
  }
  const paragraphs = [...body.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '').matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map((match) => paragraphRule(match[1] ?? ''))
    .filter((item): item is DocxParagraphRule => Boolean(item));
  return { title: paragraphs[0]?.text, paragraphs, tables };
}

export function docxStructureToInstructions(structure: DocxTemplateStructure): string {
  const lines = ['【文档版式结构】'];
  if (structure.title) lines.push(`标题：${structure.title}`);
  for (const paragraph of structure.paragraphs.slice(0, 30)) {
    const style = [paragraph.headingLevel ? `标题 ${paragraph.headingLevel} 级` : '', paragraph.bold ? '加粗' : '', paragraph.fontSize ? `${paragraph.fontSize}pt` : '', paragraph.alignment].filter(Boolean).join('，');
    lines.push(`段落：${paragraph.text}${style ? `（${style}）` : ''}`);
  }
  for (const table of structure.tables) {
    lines.push(`表格：${table.rows} 行 × ${table.columns} 列；表内文字：${table.cells.join(' / ').slice(0, 1200)}`);
  }
  lines.push('以上文字仅用于识别版式、字段和段落结构，不得把示例内容当成本次生成的主题或正文。');
  return lines.join('\n');
}
