import { describe, expect, it } from 'vitest';

import { extractPptxReference, extractXmlTexts } from '@/lib/template-text';

describe('template text extraction', () => {
  it('reads drawingml text nodes', () => {
    expect(extractXmlTexts('<p><a:t>封面标题</a:t><a:t>副标题</a:t></p>')).toEqual(['封面标题', '副标题']);
  });

  it('extracts slide copy from a pptx zip', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>开题汇报</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
    zip.file('ppt/theme/theme1.xml', '<a:theme><a:srgbClr val="0F766E"/><a:latin typeface="Aptos"/></a:theme>');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const text = await extractPptxReference(bytes);
    expect(text).toContain('开题汇报');
    expect(text).toContain('#0F766E');
  });
});
