import { describe, expect, it } from 'vitest';

import {
  calculateKeywordScore,
  extractKeywordTerms,
  fuseKnowledgeResults,
} from '@/lib/hybrid-search';
import type { KnowledgeSearchResult } from '@/lib/vector-store';

function result(id: string, score: number): KnowledgeSearchResult {
  return {
    id,
    documentId: 'document',
    documentName: 'document.md',
    content: id,
    embedding: [],
    score,
  };
}

describe('hybrid knowledge retrieval', () => {
  it('extracts English terms and Chinese phrase segments', () => {
    const terms = extractKeywordTerms('RAG 与 MCP 驱动的研究智能体');
    expect(terms).toContain('rag');
    expect(terms).toContain('mcp');
    expect(terms.some((term) => term.includes('研究'))).toBe(true);
  });

  it('scores keyword coverage', () => {
    const terms = ['rag', '引用', '检索'];
    expect(calculateKeywordScore('RAG 检索需要可靠引用', terms)).toBeGreaterThan(0.9);
    expect(calculateKeywordScore('完全无关的文本', terms)).toBe(0);
  });

  it('promotes candidates recalled by both routes', () => {
    const fused = fuseKnowledgeResults(
      [result('semantic-only', 0.9), result('both', 0.7)],
      [result('both', 0.8), result('keyword-only', 0.9)],
      3,
    );
    expect(fused[0].id).toBe('both');
    expect(fused[0].routes).toEqual(['semantic', 'keyword']);
  });

  it('rejects semantic-only results when the configured embedding is not reliable', () => {
    const fused = fuseKnowledgeResults(
      [result('hash-collision', 0.95), result('keyword-match', 0.6)],
      [result('keyword-match', 0.8)],
      3,
      { semanticReliable: false },
    );
    expect(fused.map((item) => item.id)).toEqual(['keyword-match']);
    expect(fused[0].routes).toEqual(['keyword']);
  });

  it('does not label a below-threshold semantic candidate as semantic evidence', () => {
    const fused = fuseKnowledgeResults(
      [result('keyword-match', 0.4)],
      [result('keyword-match', 0.8)],
      1,
    );
    expect(fused[0].routes).toEqual(['keyword']);
  });
});
