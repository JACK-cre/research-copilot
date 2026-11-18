import { describe, expect, it } from 'vitest';
import { applyReview, reviewExcerpts } from './draft-review';
import { groundedMetricSlide } from './slide-metrics';
import type { GeneratedResearchOutput, SlideSpec } from '@/types/research';

const slide: SlideSpec = { type:'metrics', title:'交付', citations:[], keyPoints:['上线异步导出'], speakerNotes:'', visual:{ layout:'metrics', items:[{ title:'延迟下降', value:'40%' }] } };
const draft: GeneratedResearchOutput = { title:'实习', thesis:'交付', sections:[{title:'实践', content:'主导异步化，耗时下降 40%。',citations:[]}], slides:[slide] };
describe('grounded review', () => {
  it('sends both slide values and section text; applies edits only to the requested target', () => {
    expect(reviewExcerpts(draft, 'all').map(x => x.id)).toEqual(expect.arrayContaining(['section0.body','slide0.item0.value']));
    const result = applyReview(draft,'report',{edits:[{field:'section0.body',before:'主导异步化，耗时下降 40%',after:'参与异步化改造'},{field:'slide0.item0.value',before:'40%',after:'50%'}],issues:[]}, '参与异步化改造');
    expect(result.applied).toBe(1);
    expect(result.generated.sections[0].content).toBe('参与异步化改造。');
    expect(result.generated.slides).toEqual(draft.slides);
    expect(draft.sections[0].content).toContain('40%');
  });
  it('does not present ordinals or unsupported percentages as metrics', () => {
    expect(groundedMetricSlide(slide, '耗时下降 140%').visual).toBeUndefined();
    expect(groundedMetricSlide(slide, '耗时下降 40％')).toBe(slide);
    expect(groundedMetricSlide({...slide,visual:undefined}, '').type).toBe('text');
  });
});
