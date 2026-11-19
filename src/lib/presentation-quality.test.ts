import { describe, expect, it } from 'vitest';
import { auditSlidePlan, presentationQualityWarnings } from './presentation-quality';

describe('presentation plan quality', () => {
  it('flags dense pages without rejecting the whole result', () => {
    const issues = auditSlidePlan([{ type:'text', title:'这是一个很长很长的标题'.repeat(5), keyPoints:['内容'.repeat(70)], citations:[], speakerNotes:'' }]);
    expect(issues.map(issue => issue.kind)).toEqual(expect.arrayContaining(['title','dense']));
    expect(presentationQualityWarnings([])).toEqual([]);
  });
});
