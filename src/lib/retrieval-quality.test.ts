import { describe, expect, it, vi } from 'vitest';
import { structureChunks, evidencePassage, locationLabel } from './chunk-context';
import { createChatJsonCompletion } from './chat-client';
import { rerankKnowledgeResults } from './knowledge-rerank';
import type { KnowledgeSearchResult } from './vector-store';
import { getPlatformAiRuntimeConfig } from './platform-config';

vi.mock('./chat-client', () => ({ createChatJsonCompletion: vi.fn() }));
const model = vi.mocked(createChatJsonCompletion);
const question = '软件质量保障实验 测试用例的生成来源';
const answer = '测试用例的生成来源包括需求规格、设计模型和代码结构。';
const hit = (id: string, content: string): KnowledgeSearchResult => ({ id, documentId: id.split(':')[0], documentName: '实验报告', content, embedding: [], score: 0.8 });
const run = (candidates: KnowledgeSearchResult[], limit = 8) => rerankKnowledgeResults({ query: question, candidates, ai: { ...getPlatformAiRuntimeConfig(), apiKey:'test' }, limit });

describe('retrieval quality regressions (no provider calls)', () => {
  it('does not mix physical pages or Markdown sections; keeps a stable ordinal', () => {
    const parts = structureChunks([{ page: 2, text: '# 测试\n## 边界\n输入取值\n\n边界分析' }, { page: 5, text: '上一页的章节不应延续。' }], true);
    expect(parts.map(p => [p.page, p.section, p.chunkIndex])).toEqual([[2,'测试',0],[2,'测试 / 边界',1],[5,undefined,2]]);
    expect(parts[1].content).toContain('输入取值\n\n边界分析');
    expect(locationLabel({})).toBe('');
  });
  it('finds a known answer at the end of a legacy chunk for chat and report', () => {
    for (const budget of [360, 520]) expect(evidencePassage({ content: '实验步骤与环境说明。'.repeat(100) + answer }, question, budget)).toContain(answer);
  });
  it('keeps the next paragraph when the evidence runs across a chunk boundary', () => {
    expect(evidencePassage({ content: '测试用例的生成来源如下：', followingText: '需求规格、设计模型和代码结构。' }, question, 360)).toContain('设计模型');
  });
  it('adds relevant parent context without replacing the matched child chunk', () => {
    const passage = evidencePassage({ content: answer, parentContent: '实验三：测试用例设计方法与适用条件。', followingText: '需求规格是第一来源。' }, question, 360);
    expect(passage).toContain('章节上下文');
    expect(passage).toContain(answer);
  });
  it('maps model aliases back to real chunks, including a match outside the initial top 8', async () => {
    const candidates = Array.from({length:10}, (_, i) => hit(`doc:${i}`, i === 9 ? answer : '环境配置'));
    model.mockResolvedValueOnce({items:candidates.map((_, i) => ({id:`K${i+1}`, score:i === 9 ? 1 : 0}))});
    expect((await run(candidates)).map(c => c.id)).toEqual(['doc:9']);
  });
  it('returns no evidence on explicit rejection; only falls back on unusable response or failure', async () => {
    const candidates = [hit('doc:1','同名报告的封面')];
    model.mockResolvedValueOnce({items:[{id:'K1', score:0}]}).mockResolvedValueOnce({unexpected:true}).mockRejectedValueOnce(Error('timeout'));
    expect(await run(candidates)).toEqual([]);
    expect((await run(candidates))[0].routes ?? []).not.toContain('model');
    expect((await run(candidates))[0].id).toBe('doc:1');
  });
  it('diversifies before limiting', async () => {
    const candidates = [hit('a:1','环境配置相同'),hit('a:2','环境配置相同'),hit('b:1',answer)];
    model.mockResolvedValueOnce({items:[{id:'K1',score:1},{id:'K2',score:0.99},{id:'K3',score:0.97}]});
    expect((await run(candidates, 2)).map(c => c.id)).toEqual(['a:1','b:1']);
  });
});
