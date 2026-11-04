import { describe, expect, it } from 'vitest';

import {
  assertEmbeddingDimensions,
  inferEmbeddingDimensions,
  normalizeEmbeddingBatch,
} from '@/lib/embedding-dimensions';

describe('embedding dimensions', () => {
  it('does not force a provider-specific size for Zhipu or Jina', () => {
    expect(inferEmbeddingDimensions('embedding-3', 'https://open.bigmodel.cn/api/paas/v4')).toBe(512);
    expect(inferEmbeddingDimensions('jina-embeddings-v3', 'https://api.jina.ai/v1')).toBe(512);
    expect(inferEmbeddingDimensions('embedding-3', 'https://open.bigmodel.cn/api/paas/v4', 2048)).toBe(2048);
    expect(inferEmbeddingDimensions('text-embedding-3-small', 'https://api.openai.com/v1', 1536)).toBe(1536);
  });

  it('accepts native provider sizes instead of a fixed allow-list', () => {
    expect(assertEmbeddingDimensions(384)).toBe(384);
    expect(assertEmbeddingDimensions(768)).toBe(768);
    expect(assertEmbeddingDimensions(2048)).toBe(2048);
    expect(assertEmbeddingDimensions(3072)).toBe(3072);
    expect(() => assertEmbeddingDimensions(16)).toThrow('可用范围');
    expect(() => assertEmbeddingDimensions(8192)).toThrow('可用范围');
  });

  it('keeps a batch on one consistent native dimension', () => {
    const vectors = normalizeEmbeddingBatch([
      [0.1, 0.2, 0.3].concat(new Array(381).fill(0)),
      [0.4, 0.5, 0.6].concat(new Array(381).fill(0)),
    ]);
    expect(vectors[0]).toHaveLength(384);
    expect(() => normalizeEmbeddingBatch([new Array(384).fill(0.1), new Array(512).fill(0.1)])).toThrow('不一致');
  });
});
