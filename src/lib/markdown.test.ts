import { describe, expect, it } from 'vitest';

import { buildResearchMarkdown } from '@/lib/markdown';
import type { ResearchResult } from '@/types/research';

describe('buildResearchMarkdown', () => {
  it('keeps section citations and source URLs', () => {
    const result = {
      id: 'run-1',
      createdAt: '2026-10-27T00:00:00.000Z',
      request: {
        topic: 'RAG',
        requirements: '',
        deliverable: 'survey',
        audience: 'technical',
        yearFrom: 2020,
        paperCount: 3,
        includeExternal: true,
        includeLibrary: true,
      },
      title: 'RAG 研究',
      thesis: '可追溯证据是可靠研究生成的基础。',
      searchQueries: ['retrieval augmented generation'],
      papers: [],
      evidence: [{
        id: 'P1',
        kind: 'paper',
        title: 'Evidence paper',
        excerpt: 'Evidence',
        sourceUrl: 'https://example.com/paper',
        score: 1,
      }],
      sections: [{ id: 'S1', title: '结论', content: '内容', citations: ['P1'] }],
      slides: [],
      mode: 'local',
      warnings: [],
    } satisfies ResearchResult;

    const markdown = buildResearchMarkdown(result);
    expect(markdown).toContain('# RAG 研究');
    expect(markdown).toContain('来源：[P1]');
    expect(markdown).toContain('https://example.com/paper');
  });
});
