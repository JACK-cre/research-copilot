import { describe, expect, it } from 'vitest';

import { diversifyKnowledgeResults } from '@/lib/evidence-diversity';
import type { KnowledgeSearchResult } from '@/lib/vector-store';

function result(id: string, content: string, score: number, page = 1): KnowledgeSearchResult {
  return { id, documentId: 'doc', documentName: '教材.pdf', content, page, embedding: [], score };
}

describe('evidence diversity', () => {
  it('keeps strong evidence while avoiding near-duplicate passages', () => {
    const selected = diversifyKnowledgeResults([
      result('a', '妊娠期高血压疾病包括子痫前期和子痫', 0.95, 10),
      result('b', '妊娠期高血压疾病包括子痫前期和子痫', 0.94, 10),
      result('c', '产后出血的常见原因包括子宫收缩乏力', 0.75, 20),
    ], 2);
    expect(selected.map((item) => item.id)).toContain('a');
    expect(selected.map((item) => item.id)).toContain('c');
  });
});
