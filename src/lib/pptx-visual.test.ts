import { describe, expect, it } from 'vitest';

import { parseTemplateBlueprint } from '@/lib/template-blueprint';

const slide = {
  id: 'uploaded-slide-1',
  title: '封面',
  purpose: '',
  layout: 'title' as const,
  background: '#FFFFFF',
  source: 'uploaded-pptx' as const,
  elements: [
    {
      id: 'text-1',
      type: 'text' as const,
      x: 120,
      y: 80,
      width: 600,
      height: 80,
      text: '转正述职',
      color: '#1F2937',
      fontSize: 36,
      fontWeight: 'bold' as const,
      align: 'center' as const,
      zIndex: 1,
    },
    {
      id: 'image-1',
      type: 'image' as const,
      x: 40,
      y: 200,
      width: 200,
      height: 120,
      imageDataUrl: 'data:image/png;base64,AAAA',
      zIndex: 0,
    },
  ],
};

describe('visual PPTX templates', () => {
  it('validates slide elements in a persisted blueprint', () => {
    const blueprint = parseTemplateBlueprint({
      sections: [],
      slides: [slide],
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
    expect(blueprint?.slides[0].elements?.[0].text).toBe('转正述职');
    expect(blueprint?.style.slideWidth).toBe(960);
  });

  it('keeps legacy blueprints without visual elements usable', () => {
    const blueprint = parseTemplateBlueprint({
      sections: [],
      slides: [{ id: 'slide-1', title: '旧页面', purpose: '', layout: 'landscape' }],
      style: {
        citationStyle: '按模板规则',
        headingScheme: 'numeric',
        tone: '清晰',
        accentColor: '#0f766e',
        fontFamily: '系统默认',
      },
    });
    expect(blueprint?.slides[0].elements).toBeUndefined();
  });
});
