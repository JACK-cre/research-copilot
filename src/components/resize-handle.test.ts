import { describe, expect, it } from 'vitest';

import { DEFAULT_RESEARCH_LAYOUT, LAYOUT_LIMITS, parseResearchLayout } from '@/components/resize-handle';

describe('research layout persistence', () => {
  it('falls back to defaults', () => {
    expect(parseResearchLayout(null)).toEqual(DEFAULT_RESEARCH_LAYOUT);
    expect(parseResearchLayout('{')).toEqual(DEFAULT_RESEARCH_LAYOUT);
  });

  it('clamps stored widths', () => {
    const layout = parseResearchLayout(JSON.stringify({
      briefWidth: 80,
      evidenceWidth: 900,
      metaHeight: 40,
    }));
    expect(layout.briefWidth).toBe(LAYOUT_LIMITS.briefMin);
    expect(layout.evidenceWidth).toBe(LAYOUT_LIMITS.evidenceMax);
    expect(layout.metaHeight).toBe(LAYOUT_LIMITS.metaMin);
  });
});
