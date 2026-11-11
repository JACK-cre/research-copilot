import { createHash, randomUUID } from 'node:crypto';

import { embedTexts } from '@/lib/embeddings';
import { extractPdfText, isPdfTransferError } from '@/lib/pdf-ocr';
import { getPlatformAiRuntimeConfig } from '@/lib/platform-config';
import { chunkText, normalizeWhitespace } from '@/lib/text';
import type { AiRuntimeConfig } from '@/types/platform';
import type { IngestionJobStage } from '@/types/ingestion';
import type { KnowledgeChunk, KnowledgeDocument } from '@/types/research';

export const MAX_KNOWLEDGE_FILE_BYTES = 500 * 1024 * 1024;
export const MAX_KNOWLEDGE_BATCH_BYTES = 600 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/octet-stream',
]);

export interface ParsedUpload {
  document: KnowledgeDocument;
  chunks: KnowledgeChunk[];
}

function isPdf(file: File): boolean {
  const extension = file.name.toLowerCase().split('.').pop();
  return file.type === 'application/pdf' || extension === 'pdf';
}

async function parseFileText(file: File, bytes: Uint8Array, ai: AiRuntimeConfig): Promise<string> {
  if (isPdf(file)) return extractPdfText(bytes, ai);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export interface ParseUploadBytesInput {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  documentId?: string;
  ai?: AiRuntimeConfig;
  onProgress?: (stage: IngestionJobStage, progress: number) => Promise<void> | void;
}

export async function parseUploadBytes(input: ParseUploadBytesInput): Promise<ParsedUpload> {
  const ai = input.ai ?? getPlatformAiRuntimeConfig();
  const name = input.name.replace(/[\\/]/g, '_');
  const mimeType = input.mimeType || 'application/octet-stream';
  if (!name) throw new Error('文件名不能为空。');
  if (input.bytes.byteLength === 0) throw new Error('文件内容为空。');
  if (!ALLOWED_TYPES.has(mimeType) && !/\.(pdf|md|txt)$/i.test(name)) {
    throw new Error('仅支持 PDF、Markdown 和 TXT 文件。');
  }

  const extension = name.toLowerCase().split('.').pop();
  if ((mimeType === 'application/pdf' || extension === 'pdf')
    && !(input.bytes[0] === 0x25 && input.bytes[1] === 0x50 && input.bytes[2] === 0x44 && input.bytes[3] === 0x46)) {
    throw new Error('文件扩展名是 PDF，但文件内容不是有效 PDF。');
  }
  await input.onProgress?.('extracting', 15);
  const fileBytes = input.bytes.slice();
  const file = new File([fileBytes.buffer], name, { type: mimeType });
  let text: string;
  try {
    text = normalizeWhitespace(await parseFileText(file, input.bytes.slice(), ai));
  } catch (error) {
    if (isPdfTransferError(error)) {
      throw new Error('这份 PDF 解析失败，请重试一次。如果仍失败，可先导出为文字版 PDF 再上传。');
    }
    throw error;
  }
  if (text.length < 40) throw new Error('没有从文件中提取到足够的文本。');

  const parts = chunkText(text);
  await input.onProgress?.('vectorizing', 45);
  const vectors = await embedTexts(parts, ai);
  await input.onProgress?.('saving', 85);
  const documentId = input.documentId ?? randomUUID();
  const document: KnowledgeDocument = {
    id: documentId,
    name,
    type: mimeType,
    size: input.bytes.byteLength,
    chunkCount: parts.length,
    createdAt: new Date().toISOString(),
    status: 'ready',
    sha256: createHash('sha256').update(input.bytes).digest('hex'),
    embeddingModel: ai.embeddingIdentity,
    embeddingDimensions: vectors[0]?.length ?? ai.embeddingDimensions,
  };
  const chunks: KnowledgeChunk[] = parts.map((content, index) => ({
    id: documentId + ':' + index,
    documentId,
    documentName: document.name,
    content,
    embedding: vectors[index],
  }));

  return { document, chunks };
}

export async function parseUpload(
  file: File,
  ai: AiRuntimeConfig = getPlatformAiRuntimeConfig(),
): Promise<ParsedUpload> {
  return parseUploadBytes({
    name: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
    ai,
  });
}
