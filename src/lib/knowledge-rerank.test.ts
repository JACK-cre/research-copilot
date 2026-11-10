import { describe, expect, it } from 'vitest';

import { finalizeKnowledgeRerank, knowledgeRecallLimit } from '@/lib/knowledge-rerank';
import type { KnowledgeSearchResult } from '@/lib/vector-store';

function result(id: string, score: number): KnowledgeSearchResult {
  return {
    id,
    documentId: 'doc',
    documentName: '教材.pdf',
    content: id,
    embedding: [],
    score,
    fusedScore: score,
    semanticScore: score,
    keywordScore: 0,
    routes: ['semantic'],
  };
}

describe('knowledge rerank', () => {
  it('retrieves at least 24 candidates and returns the requested final count', () => {
    expect(knowledgeRecallLimit(8)).toEqual({ retrievalLimit: 24, finalLimit: 8 });
    expect(knowledgeRecallLimit(6)).toEqual({ retrievalLimit: 24, finalLimit: 6 });
  });

  it('combines model and fused scores and rejects weak candidates', () => {
    const ranked = finalizeKnowledgeRerank(
      [result('strong', 0.8), result('weak', 0.2), result('medium', 0.5)],
      [
        { id: 'weak', score: 0.2, reason: '只是提到关键词' },
        { id: 'medium', score: 0.6, reason: '背景相关' },
        { id: 'strong', score: 0.95, reason: '直接回答问题' },
      ],
      3,
    );
    expect(ranked.map((item) => item.id)).toEqual(['strong', 'medium']);
    expect(ranked[0].routes).toContain('model');
    expect(ranked[0].rerankScore).toBe(0.95);
  });

  it('does not trust an id that was not in the retrieved candidate set', () => {
    const ranked = finalizeKnowledgeRerank(
      [result('real', 0.9)],
      [{ id: 'invented', score: 1, reason: 'not a candidate' }],
      3,
    );
    expect(ranked).toEqual([]);
  });
});
