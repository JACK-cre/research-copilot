import { describe, expect, it } from 'vitest';

import { buildSearchPlan, detectResearchIntent } from '@/lib/search-plan';
import type { ResearchRequest } from '@/types/research';

const baseRequest: ResearchRequest = {
  topic: '长征读后感',
  requirements: '结合历史背景与当代青年启示',
  deliverable: 'survey',
  audience: 'general',
  yearFrom: 2020,
  paperCount: 8,
  includeExternal: true,
  includeLibrary: true,
};

describe('research search planning', () => {
  it('routes reading responses to book and web research', () => {
    expect(detectResearchIntent(baseRequest)).toBe('book_review');
    const plan = buildSearchPlan(baseRequest);
    expect(plan.coreTopic).toBe('长征');
    expect(plan.queries[0]).toBe('长征');
    expect(plan.queries.some((query) => query.includes('作者'))).toBe(true);
  });

  it('routes technical literature reviews to academic research', () => {
    expect(detectResearchIntent({
      ...baseRequest,
      topic: 'RAG 多路召回研究综述',
      requirements: '比较算法与实验',
      audience: 'academic',
    })).toBe('academic');
  });
});
