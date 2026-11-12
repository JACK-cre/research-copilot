import { describe, expect, it } from 'vitest';

import { buildLocalRevision } from './local-revision';
import { normalizeGeneratedResearchOutput, normalizeStudyAction } from './generated-output';
import { runResearchAgent } from './research-agent';
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


describe('normalizeStudyAction', () => {
  it('accepts tool and final payloads', () => {
    expect(normalizeStudyAction({ type: 'tool', name: 'search_knowledge', arguments: { query: '长征' } })).toMatchObject({
      type: 'tool',
      name: 'search_knowledge',
    });
    expect(normalizeStudyAction({ type: 'final', content: '这是答案', citations: ['K1'] }).content).toBe('这是答案');
  });
});

describe('normalizeGeneratedResearchOutput limits', () => {
  it('accepts more than 16 slides instead of failing the whole generation', () => {
    const output = normalizeGeneratedResearchOutput({
      title: '长报告',
      thesis: '按用户要求展开。',
      sections: [{ title: '背景', content: '内容', citations: ['K1'] }],
      slides: Array.from({ length: 20 }, (_, index) => ({
        type: 'evidence',
        title: '第 ' + (index + 1) + ' 页',
        keyPoints: ['要点'],
        citations: ['K1'],
        speakerNotes: '',
      })),
    });
    expect(output.slides).toHaveLength(20);
  });

  it('slices oversized slide decks instead of throwing', () => {
    const output = normalizeGeneratedResearchOutput({
      title: '长报告',
      thesis: '按用户要求展开。',
      sections: [{ title: '背景', content: '内容', citations: ['K1'] }],
      slides: Array.from({ length: 80 }, (_, index) => ({
        type: 'evidence',
        title: '第 ' + (index + 1) + ' 页',
        keyPoints: ['要点'],
        citations: ['K1'],
        speakerNotes: '',
      })),
    });
    expect(output.slides).toHaveLength(64);
  });
});

describe('runResearchAgent dynamic source-material route', () => {
  it('generates an internship presentation from first-party material with zero evidence', async () => {
    const result = await runResearchAgent({
      topic: '实习生转正答辩',
      requirements: '我在电商搜索团队从事 Java 后端开发；5-6 月完成诊断与评测平台；6-8 月负责商品卡与搜索首页改造；后续完成发券、图搜 Agent 和导流项目；希望突出个人职责、技术难点与成长。',
      deliverable: 'auto',
      audience: 'auto',
      yearFrom: 2020,
      paperCount: 8,
      includeExternal: false,
      includeLibrary: false,
    }, undefined, 'run-internship', {
      source: 'local',
      baseURL: 'http://127.0.0.1:11434/v1',
      chatModel: 'local',
      embeddingBaseURL: 'http://127.0.0.1:11434/v1',
      embeddingModel: 'local',
      embeddingDimensions: 1024,
      embeddingIdentity: 'local:1024',
    });

    expect(result.evidence).toHaveLength(0);
    expect(result.title).toBe('实习生转正答辩');
    expect(result.slides.map((slide) => slide.title)).toContain('阶段推进');
    expect(JSON.stringify(result)).not.toContain('当前尚未获得可用证据');
    expect(JSON.stringify(result)).not.toContain('研究版图');
  });
});
