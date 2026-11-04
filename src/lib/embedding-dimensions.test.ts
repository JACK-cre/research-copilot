import { describe, expect, it } from 'vitest';

import {
  inferEmbeddingDimensions,
  toStorageVector,
  VECTOR_STORAGE_DIMENSIONS,
} from '@/lib/embedding-dimensions';

describe('embedding dimensions', () => {
  it('uses 512 for Zhipu embedding-3 even if the client still sends 384', () => {
    expect(inferEmbeddingDimensions('embedding-3', 'https://open.bigmodel.cn/api/paas/v4', 384)).toBe(512);
  });

  it('keeps Jina at 384 and pads it to the storage size', () => {
    expect(inferEmbeddingDimensions('jina-embeddings-v3', 'https://api.jina.ai/v1', 384)).toBe(384);
    expect(toStorageVector(new Array(384).fill(0.1))).toHaveLength(VECTOR_STORAGE_DIMENSIONS);
  });

  it('rejects vectors larger than the storage size', () => {
    expect(() => toStorageVector(new Array(2048).fill(0.1))).toThrow('2048');
  });
});
