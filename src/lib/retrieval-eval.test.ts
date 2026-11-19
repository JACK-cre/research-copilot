import { describe, expect, it } from 'vitest';

import { evaluateRetrieval } from '@/lib/retrieval-eval';
import type { KnowledgeSearchResult } from '@/lib/vector-store';

function result(id: string, content: string): KnowledgeSearchResult {
  return { id, documentId: id, documentName: '实验.pdf', content, embedding: [], score: 0.8 };
}

describe('retrieval evaluation metrics', () => {
  it('calculates Hit@K, MRR and no-answer false positives', async () => {
    const summary = await evaluateRetrieval([
      { question: 'q1', expectedText: '答案 A' },
      { question: 'q2', expectedText: '答案 B' },
      { question: 'q3', expectedText: null },
    ], async question => question === 'q1'
      ? [result('wrong', '噪声'), result('right', '答案 A')]
      : question === 'q2'
        ? [result('right-2', '答案 B')]
        : []);
    expect(summary.total).toBe(3);
    expect(summary.hitAt5).toBe(1);
    expect(summary.hitAt8).toBe(1);
    expect(summary.mrr).toBe(0.75);
    expect(summary.noAnswerFalsePositiveRate).toBe(0);
  });

  it('supports explicit relevant chunk IDs and reports false positives', async () => {
    const summary = await evaluateRetrieval([
      { question: 'q1', relevantChunkIds: ['chunk-2'] },
      { question: 'q2', expectedText: null },
    ], async question => question === 'q1'
      ? [result('chunk-2', '正文')]
      : [result('noise', '关键词碰撞')]);
    expect(summary.cases[0].rank).toBe(1);
    expect(summary.noAnswerFalsePositiveRate).toBe(1);
  });
});
