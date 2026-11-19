import { describe, expect, it } from 'vitest';
import { auditClaims } from './claim-audit';

describe('claim evidence audit', () => {
  it('flags unsupported numbers and accepts a cited supported claim', () => {
    const supported = auditClaims(
      [{ id:'K1', kind:'knowledge', title:'实验', excerpt:'测试效率提升 20%，来源是需求规格和设计模型。', score:0.9 }],
      [{ title:'结果', content:'测试效率提升 20%。', citations:['K1'] }], [], '实验记录',
    );
    expect(supported.valid).toBe(true);
    const unsupported = auditClaims([], [{ title:'结果', content:'系统性能提升 40%。', citations:[] }], [], '实验记录');
    expect(unsupported.valid).toBe(false);
    expect(unsupported.numericIssues).toBe(1);
  });
});
