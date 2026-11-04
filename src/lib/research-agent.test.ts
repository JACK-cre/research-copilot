import { describe, expect, it } from 'vitest';

import { buildLocalRevision } from './local-revision';
import { normalizeGeneratedResearchOutput } from './generated-output';
import type { ResearchResult } from '@/types/research';

const previous = {
  id: 'run-1',
  createdAt: '2026-10-27T00:00:00.000Z',
  request: {
    topic: 'RAG research agent',
    requirements: '',
    deliverable: 'survey',
    audience: 'technical',
    yearFrom: 2020,
    paperCount: 8,
    includeExternal: true,
    includeLibrary: true,
  },
  title: 'Research agent',
  thesis: 'Evidence quality matters.',
  searchQueries: [],
  papers: [],
  evidence: [{
    id: 'K1',
    kind: 'knowledge',
    title: 'Evaluation notes',
    excerpt: 'Evaluate retrieval recall and citation precision.',
    score: 0.9,
  }],
  sections: [{ id: 'S1', title: 'Overview', content: 'Original content.', citations: ['K1'] }],
  slides: [{ type: 'title', title: 'Overview', keyPoints: ['Original'], citations: [], speakerNotes: '' }],
  mode: 'local',
  warnings: [],
} satisfies ResearchResult;

describe('buildLocalRevision', () => {
  it('materially expands both report and slides from existing evidence', () => {
    const instruction = '补充更多方向并让内容更丰富';
    const revised = buildLocalRevision(previous, instruction, 'all');

    expect(revised.sections.length).toBeGreaterThan(previous.sections.length);
    expect(revised.slides.length).toBeGreaterThan(previous.slides.length);
    expect(revised.thesis).toContain(instruction);
    expect(revised.sections.map((section) => section.content).join('\n')).toContain(instruction);
    expect(revised.sections.some((section) => section.citations.includes('K1'))).toBe(true);
  });
});

describe('normalizeGeneratedResearchOutput', () => {
  it('coerces missing speaker notes and unknown slide types', () => {
    const output = normalizeGeneratedResearchOutput({
      title: '长征读后感',
      thesis: '应紧扣原著与可靠史料。',
      sections: [{ title: '背景', content: '依据证据说明长征背景。', citations: ['K1'] }],
      slides: [{ type: 'cover', title: '开场', keyPoints: '主题', citations: ['K1'] }],
    });
    expect(output.slides[0]).toMatchObject({
      type: 'title',
      speakerNotes: '',
      keyPoints: ['主题'],
    });
  });
});
