import { PNG } from 'pngjs';
import { extractImages, extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';

import { createChatVisionCompletion, isVisionChatModel } from '@/lib/chat-client';
import { withExponentialRetry } from '@/lib/retry';
import { normalizeWhitespace } from '@/lib/text';
import type { AiRuntimeConfig } from '@/types/platform';

export const DEFAULT_OCR_MAX_PAGES = 20;
export const OCR_IMAGE_MAX_EDGE = 1400;
export const MIN_DIGITAL_PAGE_CHARS = 80;
export const MIN_PAGE_TEXT_CHARS = 40;

type ExtractedImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
};

export type PdfPageKind = 'text' | 'image' | 'mixed';
type PageKind = PdfPageKind;

export function classifyPdfPage(text: string, significantImageCount = 0): PageKind {
  const length = normalizeWhitespace(text).length;
  const hasImages = significantImageCount > 0;
  if (length >= MIN_DIGITAL_PAGE_CHARS && hasImages) return 'mixed';
  if (length >= MIN_PAGE_TEXT_CHARS && hasImages) return 'mixed';
  if (length >= MIN_PAGE_TEXT_CHARS) return 'text';
  return 'image';
}

export function needsPdfOcr(text: string, totalPages: number): boolean {
  const normalized = normalizeWhitespace(text);
  if (classifyPdfPage(normalized) === 'image') return true;
  if (totalPages >= 3 && normalized.length / totalPages < 24) return true;
  return false;
}

export function mergePageText(digital: string, visual: string): string {
  const text = normalizeWhitespace(digital);
  const analysis = normalizeWhitespace(visual);
  if (!analysis) return text;
  if (!text) return analysis;
  if (analysis === text || text.includes(analysis)) return text;
  return `${text}\n\n【图/表解析】\n${analysis}`;
}

export function visionPageSystemPrompt(): string {
  return [
    '你是教材和论文插图分析助手。输出供知识库检索使用的中文分析，不要闲聊、不要翻译成英文。',
    '必须同时包含：1) 图/表/照片/流程图在表达什么结构、关系或结论；2) 图中全部可见文字（标题、图注、坐标轴、表头、单元格、公式）。',
    '看不清的字用【?】。不要编造看不见的细节。',
  ].join('');
}

export function visionPageUserPrompt(kind: PageKind, page: number, totalPages: number): string {
  if (kind === 'mixed') {
    return `这是第 ${page} / ${totalPages} 页。正文已经能复制，不要重复正文。请只分析图、表、照片、流程图：先说明画面含义和关键结论，再完整抄录图中文字。`;
  }
  return `请分析第 ${page} / ${totalPages} 页的全部可见内容：说明页面结构、图/表含义和关键结论，并完整抄录全部可见文字。不要只摘几个词。`;
}

export function isSignificantImage(image: { width: number; height: number }): boolean {
  return image.width >= 240 && image.height >= 240 && image.width * image.height >= 80_000;
}

export function ocrPageLimit(totalPages: number, configured = Number(process.env.OCR_MAX_PAGES ?? DEFAULT_OCR_MAX_PAGES)): number {
  const maxPages = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_OCR_MAX_PAGES;
  return Math.min(totalPages, maxPages);
}

export function extractedImageToPngDataUrl(image: ExtractedImage, maxEdge = OCR_IMAGE_MAX_EDGE): string {
  const rgba = toRgba(image);
  const resized = downscaleRgba(rgba, maxEdge);
  const png = new PNG({ width: resized.width, height: resized.height });
  png.data = resized.data;
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

export function canUsePdfOcr(ai: Pick<AiRuntimeConfig, 'apiKey' | 'chatModel'>): boolean {
  return Boolean(ai.apiKey) && isVisionChatModel(ai.chatModel);
}

export function copyPdfBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

export function isPdfTransferError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  return /Cannot transfer object of unsupported type|DataCloneError|could not be cloned|detached ArrayBuffer|InvalidStateError/i.test(`${name} ${message}`);
}

async function destroyPdfDocument(pdf?: { destroy?: () => Promise<void> }): Promise<void> {
  if (typeof pdf?.destroy === 'function') await pdf.destroy().catch(() => undefined);
}

function joinDigitalPages(pageTexts: string[]): string {
  return pageTexts
    .map((page, index) => {
      const digital = normalizeWhitespace(page);
      return digital ? `## 第 ${index + 1} 页\n${digital}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function finalizeExtractedText(text: string, skippedOcr: number, ai: AiRuntimeConfig): string {
  let combined = text;
  if (skippedOcr) {
    combined += `\n\n（有 ${skippedOcr} 页图片未分析：已达本次看图上限或当前模型不支持识图。文字页已保留。）`;
  }
  if (normalizeWhitespace(combined).length < MIN_PAGE_TEXT_CHARS) {
    if (!canUsePdfOcr(ai)) {
      throw new Error('这是扫描版或图文混排 PDF，需要对话模型识图。请先在配置中心填写对话 API Key，并使用 glm-5.3-flash。');
    }
    throw new Error('没有从文件中提取到足够的文本。扫描页请改用更清晰的版本，或拆分后再上传。');
  }
  return combined;
}

export async function extractPdfText(bytes: Uint8Array, ai: AiRuntimeConfig): Promise<string> {
  // PDF.js fake-worker transfers the input ArrayBuffer. Reusing the same
  // Uint8Array for extractText + getDocumentProxy throws:
  // "Cannot transfer object of unsupported type".
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(copyPdfBytes(bytes));
    const parsed = await extractText(pdf, { mergePages: false });
    const pageTexts = parsed.text.map((page) => normalizeWhitespace(page));
    const limit = ocrPageLimit(parsed.totalPages);
    const pages: string[] = [];
    let ocrUsed = 0;
    let skippedOcr = 0;

    for (let page = 1; page <= parsed.totalPages; page += 1) {
      const digital = pageTexts[page - 1] ?? '';
      const inspectImages = normalizeWhitespace(digital).length < MIN_DIGITAL_PAGE_CHARS || ocrUsed < limit;
      const images = inspectImages ? await extractImages(pdf, page).catch(() => []) : [];
      const largeImages = images.filter(isSignificantImage);
      const kind = classifyPdfPage(digital, largeImages.length);

      let visual = '';
      if (kind !== 'text') {
        if (ocrUsed < limit && canUsePdfOcr(ai)) {
          visual = await ocrPageContent({
            ai,
            pdf,
            page,
            totalPages: parsed.totalPages,
            kind,
            digital,
            images: largeImages,
          });
          ocrUsed += 1;
        } else if (kind === 'image' || largeImages.length) {
          skippedOcr += 1;
        }
      }

      const combined = mergePageText(digital, visual);
      if (combined) pages.push(`## 第 ${page} 页\n${combined}`);
    }

    return finalizeExtractedText(pages.join('\n\n'), skippedOcr, ai);
  } catch (error) {
    if (!isPdfTransferError(error)) throw error;
    const parsed = await extractText(copyPdfBytes(bytes), { mergePages: false });
    return finalizeExtractedText(joinDigitalPages(parsed.text), 0, ai);
  } finally {
    await destroyPdfDocument(pdf);
  }
}

async function ocrPageContent(input: {
  ai: AiRuntimeConfig;
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  page: number;
  totalPages: number;
  kind: PageKind;
  digital: string;
  images: ExtractedImage[];
}): Promise<string> {
  const imageUrls = await getPageImageUrls(input.pdf, input.page, input.images);
  if (!imageUrls.length) return '';

  return withExponentialRetry(
    () => createChatVisionCompletion({
      ai: input.ai,
      system: visionPageSystemPrompt(),
      prompt: visionPageUserPrompt(input.kind, input.page, input.totalPages),
      images: imageUrls,
      timeoutMs: 180_000,
    }),
    { retries: 1, baseDelayMs: 600 },
  );
}

async function getPageImageUrls(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  page: number,
  images: ExtractedImage[],
): Promise<string[]> {
  if (images.length) {
    return images
      .slice()
      .sort((left, right) => right.width * right.height - left.width * left.height)
      .slice(0, 3)
      .map((image) => extractedImageToPngDataUrl(image));
  }

  try {
    const rendered = await renderPageAsImage(pdf, page, {
      canvasImport: () => import('@napi-rs/canvas'),
      width: 1280,
      toDataURL: true,
    });
    return rendered ? [rendered] : [];
  } catch {
    return [];
  }
}

function toRgba(image: ExtractedImage): { data: Buffer; width: number; height: number } {
  const { width, height, channels, data } = image;
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    if (channels === 1) {
      const gray = data[index] ?? 0;
      rgba[offset] = gray;
      rgba[offset + 1] = gray;
      rgba[offset + 2] = gray;
      rgba[offset + 3] = 255;
    } else if (channels === 3) {
      rgba[offset] = data[index * 3] ?? 0;
      rgba[offset + 1] = data[index * 3 + 1] ?? 0;
      rgba[offset + 2] = data[index * 3 + 2] ?? 0;
      rgba[offset + 3] = 255;
    } else {
      rgba[offset] = data[index * 4] ?? 0;
      rgba[offset + 1] = data[index * 4 + 1] ?? 0;
      rgba[offset + 2] = data[index * 4 + 2] ?? 0;
      rgba[offset + 3] = data[index * 4 + 3] ?? 255;
    }
  }
  return { data: rgba, width, height };
}

function downscaleRgba(
  image: { data: Buffer; width: number; height: number },
  maxEdge: number,
): { data: Buffer; width: number; height: number } {
  const longest = Math.max(image.width, image.height);
  if (longest <= maxEdge) return image;
  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor(x / scale));
      const source = (sourceY * image.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      data[target] = image.data[source] ?? 0;
      data[target + 1] = image.data[source + 1] ?? 0;
      data[target + 2] = image.data[source + 2] ?? 0;
      data[target + 3] = image.data[source + 3] ?? 255;
    }
  }
  return { data, width, height };
}
