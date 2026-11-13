import { describe, expect, it } from 'vitest';

import { MAX_KNOWLEDGE_BATCH_BYTES, MAX_KNOWLEDGE_FILE_BYTES, parseUploadBytes } from '@/lib/documents';

const ai = {
  source: 'local' as const,
  baseURL: 'https://api.openai.com/v1',
  chatModel: 'gpt-4.1-mini',
  embeddingBaseURL: 'https://api.openai.com/v1',
  embeddingModel: 'local-hash-v1',
  embeddingDimensions: 512,
  embeddingIdentity: 'local-hash-v1',
};

describe('document upload limits', () => {
  it('sets a 500MB file limit and 600MB batch limit', () => {
    expect(MAX_KNOWLEDGE_FILE_BYTES).toBe(500 * 1024 * 1024);
    expect(MAX_KNOWLEDGE_BATCH_BYTES).toBe(600 * 1024 * 1024);
  });

  it('rejects a fake PDF by signature', async () => {
    await expect(parseUploadBytes({
      name: 'fake.pdf',
      mimeType: 'application/pdf',
      bytes: new TextEncoder().encode('not a real pdf'),
      ai,
    })).rejects.toThrow('不是有效 PDF');
  });

  it('preserves the stored source path for background ingestion', async () => {
    const storagePath = 'workspace-1/documents/document-1/report.txt';
    const parsed = await parseUploadBytes({
      name: 'report.txt',
      mimeType: 'text/plain',
      bytes: new TextEncoder().encode('这是一段用于知识库后台解析测试的文本，长度需要足够生成向量分块并保存原始文件路径。'),
      documentId: 'document-1',
      storagePath,
      ai,
    });

    expect(parsed.document.storagePath).toBe(storagePath);
  });
});
