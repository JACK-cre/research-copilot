import { describe, expect, it } from 'vitest';

import { auditCitations } from '@/lib/citation-audit';

const evidence = [{ id: 'K1', kind: 'knowledge' as const, title: '教材', excerpt: '妊娠期高血压疾病包括子痫前期和子痫', score: 0.9 }];

describe('citation audit', () => {
  it('flags missing citation ids', () => {
    const audit = auditCitations(evidence, [{ id: 'S1', title: '章节', content: '妊娠期高血压疾病包括子痫前期', citations: ['K9'] }], []);
    expect(audit.valid).toBe(false);
    expect(audit.issues[0].kind).toBe('missing');
  });

  it('accepts a supported citation', () => {
    const audit = auditCitations(evidence, [{ id: 'S1', title: '章节', content: '妊娠期高血压疾病包括子痫前期和子痫', citations: ['K1'] }], []);
    expect(audit.valid).toBe(true);
  });
});
