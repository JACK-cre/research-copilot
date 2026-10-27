import { createHash, randomUUID } from 'node:crypto';

import { extractText } from 'unpdf';

import { embedTexts } from '@/lib/embeddings';
import { getEmbeddingIdentity } from '@/lib/platform-config';
import { chunkText, normalizeWhitespace } from '@/lib/text';
import type { KnowledgeChunk, KnowledgeDocument } from '@/types/research';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
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

async function parseFileText(file: File): Promise<string> {
  const extension = file.name.toLowerCase().split('.').pop();
  const buffer = new Uint8Array(await file.arrayBuffer());

  if (file.type === 'application/pdf' || extension === 'pdf') {
    const parsed = await extractText(buffer, { mergePages: true });
    return parsed.text;
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

export async function parseUpload(file: File): Promise<ParsedUpload> {
  if (!file.name) throw new Error('文件名不能为空。');
  if (file.size === 0) throw new Error('文件内容为空。');
  if (file.size > MAX_FILE_BYTES) throw new Error('单个文件不能超过 15 MB。');
  if (!ALLOWED_TYPES.has(file.type) && !/\.(pdf|md|txt)$/i.test(file.name)) {
    throw new Error('仅支持 PDF、Markdown 和 TXT 文件。');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = normalizeWhitespace(await parseFileText(file));
  if (text.length < 40) throw new Error('没有从文件中提取到足够的文本。');

  const parts = chunkText(text);
  const vectors = await embedTexts(parts);
  const documentId = randomUUID();
  const embedding = getEmbeddingIdentity();
  const document: KnowledgeDocument = {
    id: documentId,
    name: file.name.replace(/[\\/]/g, '_'),
    type: file.type || 'text/plain',
    size: file.size,
    chunkCount: parts.length,
    createdAt: new Date().toISOString(),
    status: 'ready',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    embeddingModel: embedding.model,
    embeddingDimensions: embedding.dimensions,
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
