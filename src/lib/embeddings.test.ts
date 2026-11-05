import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EMBEDDING_INPUT_BATCH_SIZE,
  embeddingInputBatchSize,
  SILICONFLOW_EMBEDDING_INPUT_BATCH_SIZE,
  splitIntoBatches,
} from '@/lib/embeddings';

describe('embedding batches', () => {
  it('caps Zhipu-compatible providers at 64 inputs', () => {
    expect(embeddingInputBatchSize('https://open.bigmodel.cn/api/paas/v4')).toBe(DEFAULT_EMBEDDING_INPUT_BATCH_SIZE);
    expect(embeddingInputBatchSize('https://api.openai.com/v1')).toBe(64);
    expect(embeddingInputBatchSize('https://api.siliconflow.cn/v1')).toBe(SILICONFLOW_EMBEDDING_INPUT_BATCH_SIZE);
  });

  it('splits a textbook-sized chunk list so no request exceeds 64 inputs', () => {
    const parts = Array.from({ length: 130 }, (_, index) => `chunk-${index}`);
    const batches = splitIntoBatches(parts, embeddingInputBatchSize('https://open.bigmodel.cn/api/paas/v4'));
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(64);
    expect(batches[1]).toHaveLength(64);
    expect(batches[2]).toHaveLength(2);
    expect(batches.flat()).toEqual(parts);
  });
});
