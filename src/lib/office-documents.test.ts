import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractOfficePages } from './office-documents';

describe('office document extraction', () => {
  it('extracts DOCX headings as Markdown-like structure', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>实验步骤</w:t></w:r></w:p><w:p><w:r><w:t>准备环境并执行测试。</w:t></w:r></w:p></w:body></w:document>');
    const pages = await extractOfficePages(await zip.generateAsync({type:'uint8array'}), '实验.docx', '');
    expect(pages[0].text).toContain('# 实验步骤');
    expect(pages[0].text).toContain('准备环境');
  });

  it('keeps PPTX slide boundaries', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>第一页</a:t></p:sld>');
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>第二页</a:t></p:sld>');
    const pages = await extractOfficePages(await zip.generateAsync({type:'uint8array'}), '答辩.pptx', '');
    expect(pages.map(page => page.page)).toEqual([1, 2]);
    expect(pages[1].text).toContain('第二页');
  });
});
