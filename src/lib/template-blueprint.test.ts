import { describe, expect, it } from 'vitest';

import { blueprintToInstructions, parseTemplateBlueprint } from '@/lib/template-blueprint';

const visualSlide = {
  id: 'uploaded-slide-1',
  title: '转正述职',
  purpose: '封面',
  layout: 'title' as const,
  background: '#FFFFFF',
  source: 'uploaded-pptx' as const,
  elements: [
    { id: 't1', type: 'text' as const, x: 10, y: 20, width: 300, height: 40, text: '转正述职', fontSize: 36, color: '#1F2937', zIndex: 1 },
    { id: 'i1', type: 'image' as const, x: 20, y: 100, width: 200, height: 100, imageDataUrl: 'data:image/png;base64,AAAA', zIndex: 0 },
  ],
};

describe('template blueprint', () => {
  it('keeps visual page elements through parsing and prompt generation', () => {
    const blueprint = parseTemplateBlueprint({
      sections: [],
      slides: [visualSlide],
      style: {
        citationStyle: '证据编号',
        headingScheme: 'numeric',
        tone: '严谨',
        accentColor: '#0f766e',
        fontFamily: '系统默认',
        slideWidth: 960,
        slideHeight: 540,
      },
    });
    expect(blueprint?.slides[0].elements).toHaveLength(2);
    expect(blueprintToInstructions(blueprint!)).toContain('2 个页面元素');
  });

  it('accepts legacy slide entries without visual data', () => {
    const blueprint = parseTemplateBlueprint({
      sections: [],
      slides: [{ id: 'old', title: '旧页面', purpose: '', layout: 'landscape' }],
      style: { citationStyle: '按模板规则', headingScheme: 'numeric', tone: '清晰', accentColor: '#0f766e', fontFamily: '系统默认' },
    });
    expect(blueprint?.slides[0].elements).toBeUndefined();
  });
});
