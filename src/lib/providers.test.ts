import { describe, expect, it } from 'vitest';

import { embeddingRequirement, matchProvider } from '@/lib/providers';

describe('model providers', () => {
  it('maps zhipu and deepseek base urls', () => {
    expect(matchProvider('https://open.bigmodel.cn/api/paas/v4')?.id).toBe('zhipu');
    expect(matchProvider('https://api.deepseek.com')?.embeddingModels).toEqual([]);
  });

  it('explains that DeepSeek cannot feed pgvector', () => {
    expect(embeddingRequirement('https://api.deepseek.com', 'deepseek-chat')).toContain('没有官方 Embedding');
    expect(embeddingRequirement('https://open.bigmodel.cn/api/paas/v4', 'embedding-3')).toContain('pgvector');
  });
});
