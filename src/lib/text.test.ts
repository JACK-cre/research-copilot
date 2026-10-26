import { describe, expect, it } from 'vitest';

import { chunkText, cosineSimilarity, hashEmbedding } from './text';

describe('text utilities', () => {
  it('chunks long text with bounded pieces', () => {
    const input = Array.from({ length: 20 }, (_, index) =>
      'Paragraph ' + index + ' contains evidence about retrieval and agent tools.',
    ).join('\n\n');
    const chunks = chunkText(input, { maxChars: 180, overlap: 20 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 210)).toBe(true);
  });

  it('gives related local vectors a higher score', () => {
    const query = hashEmbedding('retrieval augmented generation vector database');
    const related = hashEmbedding('vector retrieval improves augmented generation');
    const unrelated = hashEmbedding('cooking temperature and bread recipe');

    expect(cosineSimilarity(query, related)).toBeGreaterThan(
      cosineSimilarity(query, unrelated),
    );
  });
});
