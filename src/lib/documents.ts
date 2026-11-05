import { createHash, randomUUID } from 'node:crypto';

import { embedTexts } from '@/lib/embeddings';
import { extractPdfText } from '@/lib/pdf-ocr';
import { getPlatformAiRuntimeConfig } from '@/lib/platform-config';
import { chunkText, normalizeWhitespace } from '@/lib/text';
import type { AiRuntimeConfig } from '@/types/platform';
import type { KnowledgeChunk, KnowledgeDocument } from '@/types/research';

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

export async function parseUpload(
  file: File,
  ai: AiRuntimeConfig = getPlatformAiRuntimeConfig(),
): Promise<ParsedUpload> {
  if (!file.name) throw new Error('文件名不能为空。');
  if (file.size === 0) throw new Error('文件内容为空。');
  if (!ALLOWED_TYPES.has(file.type) && !/\.(pdf|md|txt)$/i.test(file.name)) {
    throw new Error('仅支持 PDF、Markdown 和 TXT 文件。');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = normalizeWhitespace(await parseFileText(file, bytes, ai));
  if (text.length < 40) throw new Error('没有从文件中提取到足够的文本。');

  const parts = chunkText(text);
  const vectors = await embedTexts(parts, ai);
  const documentId = randomUUID();
  const document: KnowledgeDocument = {
    id: documentId,
    name: file.name.replace(/[\\/]/g, '_'),
    type: file.type || 'text/plain',
    size: file.size,
    chunkCount: parts.length,
    createdAt: new Date().toISOString(),
    status: 'ready',
    sha256: createHash('sha256').update(bytes).digest('hex'),
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
