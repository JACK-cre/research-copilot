import { describe, expect, it } from 'vitest';
import { diffResearchResults } from './research-diff';
import type { ResearchResult } from '@/types/research';

const base = (overrides: Partial<ResearchResult> = {}) => ({ id:'r', createdAt:'', request:{} as never, title:'A', thesis:'T', searchQueries:[], papers:[], evidence:[], sections:[{id:'S1',title:'结论',content:'A',citations:[]}], slides:[], mode:'local',warnings:[], ...overrides }) satisfies ResearchResult;
describe('research diff', () => {
  it('reports section and evidence changes', () => {
    const diff = diffResearchResults(base(), base({ title:'B', sections:[{id:'S1',title:'结论',content:'B',citations:[]},{id:'S2',title:'下一步',content:'C',citations:[]}], evidence:[{id:'K1',kind:'knowledge',title:'文档',excerpt:'证据',score:.8}] }));
    expect(diff.titleChanged).toBe(true); expect(diff.sectionsChanged).toEqual(['结论']); expect(diff.sectionsAdded).toEqual(['下一步']); expect(diff.evidenceAdded).toEqual(['K1']);
  });
});
