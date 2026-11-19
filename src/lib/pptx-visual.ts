import JSZip from 'jszip';
import sharp from 'sharp';

import type {
  TemplatePptxChartSummary,
  TemplatePptxImageSummary,
  TemplatePptxSlideAnalysis,
  TemplatePptxTableSummary,
  TemplateSlideBlueprint,
  TemplateSlideElement,
} from '@/types/platform';

const MAX_IMAGE_BYTES = 700_000;
const MAX_TOTAL_IMAGE_BYTES = 4_500_000;
const MAX_IMAGE_EDGE = 1400;
const MAX_ELEMENTS_PER_SLIDE = 120;
const MAX_SLIDES = 64;

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function attr(xml: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.match(new RegExp(`\\b${escaped}="([^"]*)"`))?.[1];
}

function numberAttr(xml: string, name: string): number | undefined {
  const value = Number(attr(xml, name));
  return Number.isFinite(value) ? value : undefined;
}

function colorFrom(xml: string): string | undefined {
  const srgb = xml.match(/<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/)?.[1];
  if (srgb) return '#' + srgb.toUpperCase();
  const scheme = xml.match(/<a:schemeClr\b[^>]*val="([^"]+)"/)?.[1];
  const schemeMap: Record<string, string> = {
    tx1: '#1F2937',
    tx2: '#374151',
    bg1: '#FFFFFF',
    bg2: '#F3F4F6',
    accent1: '#0F766E',
    accent2: '#C45D40',
    accent3: '#B88711',
    accent4: '#5961F9',
  };
  return scheme ? schemeMap[scheme] : undefined;
}

function normalizeText(value: string): string {
  return decodeXml(value).replace(/\s+/g, ' ').trim();
}

function textFromShape(xml: string): string {
  return [...xml.matchAll(/<a:t\b[^>]*>([^<]*)<\/a:t>/g)]
    .map((match) => normalizeText(match[1] ?? ''))
    .filter(Boolean)
    .join(' ');
}

function fillFromShape(xml: string): string | undefined {
  const shapeProperties = xml.match(/<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/)?.[1] ?? '';
  if (/<a:noFill\s*\/>/i.test(shapeProperties)) return undefined;
  const solid = shapeProperties.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)?.[1];
  return solid ? colorFrom(solid) : undefined;
}

function opacityFrom(xml: string): number | undefined {
  const alpha = xml.match(/<a:alpha\b[^>]*val="(\d+)"/)?.[1];
  if (!alpha) return undefined;
  return Math.max(0, Math.min(1, Number(alpha) / 100000));
}

function strokeFromShape(xml: string): string | undefined {
  const shapeProperties = xml.match(/<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/)?.[1] ?? '';
  const line = shapeProperties.match(/<a:ln\b[^>]*>([\s\S]*?)<\/a:ln>/)?.[1];
  if (!line || /<a:noFill\s*\/>/i.test(line)) return undefined;
  return colorFrom(line);
}

function shapeKind(xml: string): TemplateSlideElement['shape'] {
  const preset = attr(xml, 'prst');
  if (preset === 'rect') return 'rect';
  if (preset === 'roundRect') return 'roundRect';
  if (preset === 'ellipse' || preset === 'oval') return 'ellipse';
  if (preset === 'line') return 'line';
  if (preset === 'triangle') return 'triangle';
  return preset ? 'other' : undefined;
}

function fontFromShape(xml: string): Pick<TemplateSlideElement, 'fontSize' | 'fontFamily' | 'fontWeight' | 'color' | 'align' | 'verticalAlign'> {
  const paragraphs = [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)];
  const candidates: Array<{ size: number; properties: string; body: string }> = [];
  for (const paragraph of paragraphs) {
    const paragraphXml = paragraph[1] ?? '';
    const paragraphRuns = [...paragraphXml.matchAll(/<a:rPr\b([^>]*)>([\s\S]*?)<\/a:rPr>/g)];
    for (const run of paragraphRuns) {
      const size = numberAttr(run[1], 'sz');
      if (size) candidates.push({ size, properties: run[1], body: run[2] });
    }
  }
  const end = xml.match(/<a:endParaRPr\b([^>]*)>([\s\S]*?)<\/a:endParaRPr>/);
  if (!candidates.length && end) {
    const size = numberAttr(end[1], 'sz');
    if (size) candidates.push({ size, properties: end[1], body: end[2] });
  }
  // Use the largest run as the dominant style; mixed-size paragraphs are
  // rendered more faithfully than falling back to the default 18pt.
  const chosen = candidates.sort((left, right) => right.size - left.size)[0];
  const properties = chosen?.properties ?? '';
  const body = chosen?.body ?? '';
  const typeface = attr(body, 'typeface');
  const alignValue = attr(xml.match(/<a:pPr\b[^>]*>/)?.[0] ?? '', 'algn');
  const anchorValue = attr(xml.match(/<a:bodyPr\b[^>]*>/)?.[0] ?? '', 'anchor');
  return {
    fontSize: chosen?.size ? Math.max(6, chosen.size / 100) : undefined,
    fontFamily: typeface,
    fontWeight: attr(properties, 'b') === '1' ? 'bold' : 'normal',
    color: colorFrom(body),
    align: alignValue === 'ctr' ? 'center' : alignValue === 'r' ? 'right' : alignValue === 'l' ? 'left' : undefined,
    verticalAlign: anchorValue === 'ctr' ? 'middle' : anchorValue === 'b' ? 'bottom' : anchorValue === 't' ? 'top' : undefined,
  };
}

async function loadRelationships(zip: JSZip, path: string): Promise<Map<string, string>> {
  const file = zip.file(path);
  const map = new Map<string, string>();
  if (!file) return map;
  const xml = await file.async('string');
  for (const match of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0];
    const id = attr(tag, 'Id');
    const target = attr(tag, 'Target');
    if (id && target) map.set(id, target);
  }
  return map;
}

function resolveTarget(slidePath: string, target: string): string {
  const base = slidePath.split('/').slice(0, -1).join('/');
  const parts = (base + '/' + target).split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop();
    else normalized.push(part);
  }
  return normalized.join('/');
}

function imageMime(path: string): string {
  const extension = path.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'gif') return 'image/gif';
  return 'image/png';
}

async function compactImage(bytes: Uint8Array, path: string): Promise<{ dataUrl: string; bytes: number } | null> {
  const mime = imageMime(path);
  if (mime === 'image/svg+xml') {
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, bytes: bytes.byteLength };
  }
  try {
    const metadata = await sharp(bytes, { animated: false }).metadata();
    const hasAlpha = Boolean(metadata.hasAlpha);
    const pipeline = sharp(bytes, { animated: false })
      .rotate()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true });
    const output = hasAlpha
      ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await pipeline.jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    if (output.byteLength > MAX_IMAGE_BYTES) return null;
    return {
      dataUrl: hasAlpha
        ? `data:image/png;base64,${output.toString('base64')}`
        : `data:image/jpeg;base64,${output.toString('base64')}`,
      bytes: output.byteLength,
    };
  } catch {
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, bytes: bytes.byteLength };
  }
}

function emptySlide(id: string, index: number): TemplateSlideBlueprint {
  return {
    id,
    title: `第 ${index + 1} 页`,
    purpose: '',
    layout: index === 0 ? 'title' : 'landscape',
    background: '#FFFFFF',
    elements: [],
    source: 'uploaded-pptx',
  };
}

function extractBackground(xml: string): string | undefined {
  const background = xml.match(/<p:bg>([\s\S]*?)<\/p:bg>/)?.[1];
  return background ? colorFrom(background) : undefined;
}

function extractTextTitle(elements: TemplateSlideElement[], index: number): string {
  const texts = elements
    .filter((element) => element.type === 'text' && element.text)
    .sort((left, right) => (right.fontSize ?? 0) - (left.fontSize ?? 0));
  return texts[0]?.text?.slice(0, 200) || `第 ${index + 1} 页`;
}

function xmlText(xml: string): string {
  return [...xml.matchAll(/<a:t\b[^>]*>([^<]*)<\/a:t>/g)]
    .map((match) => normalizeText(match[1] ?? ''))
    .filter(Boolean)
    .join(' ');
}

function chartCacheText(xml: string): string[] {
  return [...xml.matchAll(/<c:pt\b[^>]*>\s*<c:v>([^<]*)<\/c:v>\s*<\/c:pt>/g)]
    .map((match) => decodeXml(match[1] ?? '').trim())
    .filter(Boolean);
}

function chartCacheNumbers(xml: string): number[] {
  return chartCacheText(xml).map(Number).filter(Number.isFinite);
}

function extractChart(xml: string): TemplatePptxChartSummary {
  const chartType = ['barChart', 'lineChart', 'pieChart', 'areaChart', 'scatterChart', 'doughnutChart', 'radarChart']
    .find((type) => new RegExp(`<c:${type}\\b`).test(xml)) ?? 'chart';
  const title = xml.match(/<c:title>[\s\S]*?<a:t>([^<]+)<\/a:t>[\s\S]*?<\/c:title>/)?.[1];
  const series = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map((match) => {
    const body = match[1] ?? '';
    const name = body.match(/<c:tx>[\s\S]*?<a:t>([^<]+)<\/a:t>/)?.[1];
    const categoryBlock = body.match(/<c:cat>([\s\S]*?)<\/c:cat>/)?.[1] ?? '';
    const valueBlock = body.match(/<c:val>([\s\S]*?)<\/c:val>/)?.[1] ?? '';
    return { name: name ? decodeXml(name).trim() : undefined, categories: chartCacheText(categoryBlock), values: chartCacheNumbers(valueBlock) };
  });
  return { type: chartType, title: title ? decodeXml(title).trim() : undefined, seriesCount: series.length, series };
}

function extractTable(xml: string): TemplatePptxTableSummary | null {
  const table = xml.match(/<a:tbl>([\s\S]*?)<\/a:tbl>/)?.[1];
  if (!table) return null;
  const rows = [...table.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)];
  const cells = [...table.matchAll(/<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g)].map((match) => xmlText(match[1] ?? ''));
  return { rows: rows.length, columns: Math.max(0, ...rows.map((row) => (row[1]?.match(/<a:tc\b/g) ?? []).length)), cells: cells.slice(0, 1000) };
}

async function extractSpeakerNotes(zip: JSZip, slideIndex: number): Promise<string | undefined> {
  const file = zip.file(`ppt/notesSlides/notesSlide${slideIndex + 1}.xml`);
  if (!file) return undefined;
  const text = xmlText(await file.async('string'));
  return text || undefined;
}

export interface PptxVisualTemplate {
  slides: TemplateSlideBlueprint[];
  width: number;
  height: number;
}

export function pptxVisualTemplateToInstructions(template: PptxVisualTemplate): string {
  return template.slides.map((slide, index) => {
    const analysis = slide.analysis;
    const parts = [
      `第 ${index + 1} 页：${slide.title}；布局 ${slide.layout}`,
      analysis?.speakerNotes ? `演讲备注：${analysis.speakerNotes.slice(0, 1200)}` : '',
      analysis?.semanticHints.length ? `页面元素：${analysis.semanticHints.join('、')}` : '',
      analysis?.images.length ? `图片信息：${analysis.images.map((image) => [image.name, image.altText].filter(Boolean).join(' / ') || '未命名图片').join('；')}` : '',
      analysis?.charts.length ? `图表信息：${analysis.charts.map((chart) => `${chart.type}${chart.title ? `（${chart.title}）` : ''}，${chart.seriesCount} 个系列`).join('；')}` : '',
      analysis?.tables.length ? `表格信息：${analysis.tables.map((table) => `${table.rows} 行 × ${table.columns} 列`).join('；')}` : '',
      analysis?.readingOrder.length ? `阅读顺序：${analysis.readingOrder.join(' → ')}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n\n');
}

export async function extractPptxVisualTemplate(bytes: Uint8Array): Promise<PptxVisualTemplate> {
  const zip = await JSZip.loadAsync(bytes);
  const presentation = await zip.file('ppt/presentation.xml')?.async('string');
  if (!presentation) throw new Error('PPTX 缺少 presentation.xml。');
  const sizeTag = presentation.match(/<p:sldSz\b[^>]*>/)?.[0] ?? '';
  const widthEmu = numberAttr(sizeTag, 'cx') ?? 12_192_000;
  const heightEmu = numberAttr(sizeTag, 'cy') ?? 6_858_000;
  const width = 960;
  const height = Math.max(540, Math.round(width * heightEmu / widthEmu));

  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/slide(\d+)/i)?.[1] ?? 0);
      const rightNumber = Number(right.match(/slide(\d+)/i)?.[1] ?? 0);
      return leftNumber - rightNumber;
    })
    .slice(0, MAX_SLIDES);

  let totalImageBytes = 0;
  const skippedImages = { count: 0 };
  const slides: TemplateSlideBlueprint[] = [];
  for (const [slideIndex, slidePath] of slideNames.entries()) {
    const xml = await zip.file(slidePath)?.async('string');
    if (!xml) continue;
    const slide = emptySlide(`uploaded-slide-${slideIndex + 1}`, slideIndex);
    slide.background = extractBackground(xml) ?? '#FFFFFF';
    const relationships = await loadRelationships(zip, slidePath.replace(/slides\/(slide\d+\.xml)$/i, 'slides/_rels/$1.rels'));
    const elements: TemplateSlideElement[] = [];

    const shapeRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
    for (const match of xml.matchAll(shapeRegex)) {
      const shapeXml = match[1] ?? '';
      const transform = shapeXml.match(/<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/)?.[1];
      const offset = transform?.match(/<a:off\b[^>]*>/)?.[0] ?? '';
      const extent = transform?.match(/<a:ext\b[^>]*>/)?.[0] ?? '';
      const xEmu = numberAttr(offset, 'x') ?? 0;
      const yEmu = numberAttr(offset, 'y') ?? 0;
      const widthEmuShape = numberAttr(extent, 'cx') ?? 0;
      const heightEmuShape = numberAttr(extent, 'cy') ?? 0;
      if (!widthEmuShape || !heightEmuShape) continue;
      const text = textFromShape(shapeXml);
      const fill = fillFromShape(shapeXml);
      const shape = shapeKind(shapeXml);
      const x = Math.max(-50, Math.min(width + 50, xEmu / widthEmu * width));
      const y = Math.max(-50, Math.min(height + 50, yEmu / heightEmu * height));
      const shapeWidth = Math.max(0.5, Math.min(width + 100, widthEmuShape / widthEmu * width));
      const shapeHeight = Math.max(0.5, Math.min(height + 100, heightEmuShape / heightEmu * height));
      const stroke = strokeFromShape(shapeXml);
      const visibleShape = Boolean(fill || stroke);
      if (text || visibleShape) {
        const duplicate = elements.some((existing) =>
          existing.type === (text ? 'text' : 'shape')
          && Math.abs(existing.x - x) < 1
          && Math.abs(existing.y - y) < 1
          && Math.abs(existing.width - shapeWidth) < 1
          && Math.abs(existing.height - shapeHeight) < 1
          && (existing.fill ?? '') === (fill ?? '')
          && (existing.text ?? '') === (text || ''));
        if (!duplicate) {
          elements.push({
            id: `slide-${slideIndex + 1}-shape-${elements.length + 1}`,
            type: text ? 'text' : 'shape',
            x,
            y,
            width: shapeWidth,
            height: shapeHeight,
            text: text || undefined,
            fill,
            fillOpacity: fill ? opacityFrom(shapeXml) : undefined,
            stroke: strokeFromShape(shapeXml),
            strokeOpacity: strokeFromShape(shapeXml) ? opacityFrom(shapeXml) : undefined,
            shape,
            zIndex: elements.length,
            ...fontFromShape(shapeXml),
          });
        }
      }
      if (elements.length >= MAX_ELEMENTS_PER_SLIDE) break;
    }

    for (const match of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
      if (elements.length >= MAX_ELEMENTS_PER_SLIDE) break;
      const pictureXml = match[1] ?? '';
      const transform = pictureXml.match(/<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/)?.[1];
      const offset = transform?.match(/<a:off\b[^>]*>/)?.[0] ?? '';
      const extent = transform?.match(/<a:ext\b[^>]*>/)?.[0] ?? '';
      const xEmu = numberAttr(offset, 'x') ?? 0;
      const yEmu = numberAttr(offset, 'y') ?? 0;
      const imageWidth = numberAttr(extent, 'cx') ?? 0;
      const imageHeight = numberAttr(extent, 'cy') ?? 0;
      const relationId = attr(pictureXml.match(/<a:blip\b[^>]*>/)?.[0] ?? '', 'r:embed');
      const target = relationId ? relationships.get(relationId) : undefined;
      if (!target || !imageWidth || !imageHeight) continue;
      const imagePath = resolveTarget(slidePath, target);
      const imageFile = zip.file(imagePath);
      if (!imageFile) continue;
      const imageBytes = await imageFile.async('uint8array');
      const compacted = imageBytes.byteLength
        ? await compactImage(imageBytes, imagePath)
        : null;
      if (!compacted || totalImageBytes + compacted.bytes > MAX_TOTAL_IMAGE_BYTES) {
        skippedImages.count += 1;
        continue;
      }
      totalImageBytes += compacted.bytes;
      elements.push({
        id: `slide-${slideIndex + 1}-image-${elements.length + 1}`,
        type: 'image',
        x: Math.max(-50, Math.min(width + 50, xEmu / widthEmu * width)),
        y: Math.max(-50, Math.min(height + 50, yEmu / heightEmu * height)),
        width: Math.max(0.5, Math.min(width + 100, imageWidth / widthEmu * width)),
        height: Math.max(0.5, Math.min(height + 100, imageHeight / heightEmu * height)),
        imageDataUrl: compacted.dataUrl,
        zIndex: elements.length,
      });
    }

    slide.elements = elements;
    slide.title = extractTextTitle(elements, slideIndex);
    const images: TemplatePptxImageSummary[] = [];
    for (const match of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
      const pictureXml = match[1] ?? '';
      const cNvPr = pictureXml.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? '';
      const transform = pictureXml.match(/<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/)?.[1] ?? '';
      const extent = transform.match(/<a:ext\b[^>]*>/)?.[0] ?? '';
      const widthEmuImage = numberAttr(extent, 'cx');
      const heightEmuImage = numberAttr(extent, 'cy');
      const relationId = attr(pictureXml.match(/<a:blip\b[^>]*>/)?.[0] ?? '', 'r:embed');
      images.push({
        id: attr(cNvPr, 'id') ?? `image-${images.length + 1}`,
        name: attr(cNvPr, 'name'),
        altText: attr(cNvPr, 'descr'),
        path: relationId ? relationships.get(relationId) : undefined,
        width: widthEmuImage ? widthEmuImage / widthEmu * width : undefined,
        height: heightEmuImage ? heightEmuImage / heightEmu * height : undefined,
      });
    }
    const charts: TemplatePptxChartSummary[] = [];
    for (const target of relationships.values()) {
      const chartPath = resolveTarget(slidePath, target);
      if (!/^ppt\/charts\/chart\d+\.xml$/i.test(chartPath)) continue;
      const chartFile = zip.file(chartPath);
      if (chartFile) charts.push(extractChart(await chartFile.async('string')));
    }
    const tables = [...xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)].map((match) => extractTable(match[0])).filter((item): item is TemplatePptxTableSummary => Boolean(item));
    const readingOrder = elements.slice().sort((left, right) => left.y - right.y || left.x - right.x).map((element) => element.id);
    const semanticHints = [
      images.length ? `图片 ${images.length} 个${images.some((image) => image.altText) ? '，含替代文字' : ''}` : '',
      charts.length ? `图表 ${charts.length} 个` : '',
      tables.length ? `表格 ${tables.length} 个` : '',
      elements.filter((element) => element.type === 'shape').length ? `装饰/图形 ${elements.filter((element) => element.type === 'shape').length} 个` : '',
    ].filter(Boolean);
    const speakerNotes = await extractSpeakerNotes(zip, slideIndex);
    slide.analysis = { speakerNotes, images, charts, tables, readingOrder, semanticHints };
    slides.push(slide);
  }

  if (!slides.length) throw new Error('没有从 PPTX 中提取到可预览的页面。');
  if (skippedImages.count) {
    console.warn(`Skipped ${skippedImages.count} oversized PPTX image(s) while creating the visual template.`);
  }
  return { slides, width, height };
}
