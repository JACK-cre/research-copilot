import { describe, expect, it } from 'vitest';

import { prefilterSources, scoreSourceLexically } from '@/lib/source-relevance';
import type { Paper, ResearchRequest } from '@/types/research';

const request: ResearchRequest = {
  topic: '长征读后感',
  requirements: '结合历史背景与长征精神',
  deliverable: 'survey',
  audience: 'general',
  yearFrom: 2020,
  paperCount: 8,
  includeExternal: true,
  includeLibrary: true,
};

function source(input: Partial<Paper> & Pick<Paper, 'id' | 'title' | 'abstract'>): Paper {
  return {
    year: 0,
    authors: [],
    citedByCount: 0,
    url: 'https://example.com',
    topics: [],
    source: 'wikipedia',
    sourceType: 'web',
    ...input,
  };
}

describe('external source relevance', () => {
  it('keeps exact Long March sources and rejects homonyms and generic reading research', () => {
    const relevant = source({ id: 'long-march', title: '长征', abstract: '中国工农红军长征的历史背景与过程。' });
    const fishing = source({ id: 'fishing', title: '长江十年禁渔', abstract: '长江水生生物保护研究。', sourceType: 'paper', source: 'openalex' });
    const reading = source({ id: 'reading', title: '触觉阅读的神经基础', abstract: '关于阅读与神经可塑性的实验。', sourceType: 'paper', source: 'crossref' });

    expect(scoreSourceLexically(relevant, request, 'book_review', '长征')).toBeGreaterThan(0.5);
    expect(scoreSourceLexically(fishing, request, 'book_review', '长征')).toBeLessThan(0.1);
    expect(scoreSourceLexically(reading, request, 'book_review', '长征')).toBeLessThan(0.1);
    expect(prefilterSources([fishing, relevant, reading], request, 'book_review', '长征').map((item) => item.id))
      .toEqual(['long-march']);
  });
});
