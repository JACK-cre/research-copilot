import { describe, expect, it } from 'vitest';

import { parseTemplateBlueprint } from '@/lib/template-blueprint';
import { extractPptxVisualTemplate } from '@/lib/pptx-visual';

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
  it('extracts notes, chart metadata, image metadata and reading order', async () => {
    const zip = new (await import('jszip')).default();
    zip.file('ppt/presentation.xml', '<p:presentation><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
    zip.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:pic><p:nvPicPr><p:cNvPr id="8" name="封面图" descr="流程示意图"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="1000000"/></a:xfrm></p:spPr></p:pic><a:tbl><a:tr><a:tc><a:t>列1</a:t></a:tc><a:tc><a:t>列2</a:t></a:tc></a:tr></a:tbl></p:spTree></p:cSld></p:sld>');
    zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId2" Target="../media/image1.png"/><Relationship Id="rId3" Target="../charts/chart1.xml"/></Relationships>');
    zip.file('ppt/charts/chart1.xml', '<c:chart><c:title><a:t>趋势图</a:t></c:title><c:plotArea><c:lineChart><c:ser><c:tx><a:t>系列一</a:t></c:tx><c:cat><c:strCache><c:pt idx="0"><c:v>一月</c:v></c:pt></c:strCache></c:cat><c:val><c:numCache><c:pt idx="0"><c:v>3</c:v></c:pt></c:numCache></c:val></c:ser></c:lineChart></c:plotArea></c:chart>');
    zip.file('ppt/notesSlides/notesSlide1.xml', '<p:notes><a:t>这一页说明实施路径。</a:t></p:notes>');
    const result = await extractPptxVisualTemplate(await zip.generateAsync({ type: 'uint8array' }));
    expect(result.slides[0].analysis?.speakerNotes).toContain('实施路径');
    expect(result.slides[0].analysis?.charts[0]?.title).toBe('趋势图');
    expect(result.slides[0].analysis?.images[0]?.altText).toBe('流程示意图');
    expect(result.slides[0].analysis?.tables[0]?.columns).toBe(2);
  });

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
