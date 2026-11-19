import { describe, expect, it } from 'vitest';

import { buildRetrievalQueries, buildRetrievalStrategy, calculateStructureScore, detectRetrievalSignals } from '@/lib/retrieval-strategy';
import { fuseKnowledgeResults } from '@/lib/hybrid-search';
import type { KnowledgeSearchResult } from '@/lib/vector-store';

function result(id: string, score: number, meta: Partial<KnowledgeSearchResult> = {}): KnowledgeSearchResult {
  return { id, documentId: meta.documentId ?? id, documentName: meta.documentName ?? '教材.pdf', content: id, embedding: [], score, ...meta };
}

describe('adaptive retrieval strategy', () => {
  it('uses question signals instead of a task-type label', () => {
    const procedural = buildRetrievalStrategy('第 3 个实验的测试步骤是什么？');
    const abstract = buildRetrievalStrategy('这本书表达了什么核心主题？');
    expect(detectRetrievalSignals('第 3 个实验的测试步骤是什么？')).toMatchObject({ location: true, procedural: true });
    expect(procedural.keywordWeight).toBeGreaterThan(abstract.keywordWeight);
    expect(procedural.semanticWeight).toBeLessThan(abstract.semanticWeight);
    expect(abstract.semanticWeight).toBeGreaterThan(abstract.keywordWeight);
  });

  it('keeps the original question and adds bounded variants for relations and procedures', () => {
    const comparison = buildRetrievalQueries('测试用例和需求分析有什么区别？');
    const procedure = buildRetrievalQueries('第 3 个实验的测试步骤是什么？');
    expect(comparison[0]).toContain('测试用例');
    expect(comparison).toEqual(expect.arrayContaining(['测试用例', '需求分析']));
    expect(procedure).toEqual(expect.arrayContaining(['第 3 个实验的测试步骤是什么？']));
    expect(procedure.length).toBeLessThanOrEqual(4);
  });

  it('never disables either route', () => {
    for (const query of ['第 3 个实验的测试步骤', '这本书的核心主题', 'Kafka 与异步导出的区别']) {
      const strategy = buildRetrievalStrategy(query);
      expect(strategy.semanticWeight).toBeGreaterThan(0);
      expect(strategy.keywordWeight).toBeGreaterThan(0);
    }
  });

  it('widens recall only for complex question signals', () => {
    expect(buildRetrievalStrategy('软件质量保障实验的测试步骤').retrievalLimit).toBe(32);
    expect(buildRetrievalStrategy('测试用例和需求分析有什么区别').retrievalLimit).toBe(40);
    expect(buildRetrievalStrategy('这个是什么').retrievalLimit).toBe(24);
  });

  it('gives structural metadata a bounded boost for location questions', () => {
    const strategy = buildRetrievalStrategy('第 3 个实验的测试步骤');
    const withMetadata = result('with-meta', 0.7, { page: 3, section: '实验三 / 测试步骤', chunkIndex: 12 });
    const withoutMetadata = result('without-meta', 0.7);
    expect(calculateStructureScore(withMetadata, '第 3 个实验的测试步骤', strategy)).toBeGreaterThan(
      calculateStructureScore(withoutMetadata, '第 3 个实验的测试步骤', strategy),
    );
    expect(calculateStructureScore(withMetadata, '第 3 个实验的测试步骤', strategy)).toBeLessThanOrEqual(1);
  });

  it('preserves semantic-only and keyword-only candidates while adapting their scores', () => {
    const strategy = buildRetrievalStrategy('第 3 个实验的测试步骤');
    const fused = fuseKnowledgeResults(
      [result('semantic', 0.8)],
      [result('keyword', 0.7, { page: 3, section: '实验三 / 测试步骤', chunkIndex: 2 })],
      10,
      { strategy, semanticReliable: true },
    );
    expect(fused.map(item => item.id).sort()).toEqual(['keyword', 'semantic']);
    expect(fused.find(item => item.id === 'keyword')?.structureScore).toBeGreaterThan(0);
  });
});
