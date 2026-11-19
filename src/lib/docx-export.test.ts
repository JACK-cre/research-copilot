import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildResearchDocx } from './docx-export';

describe('docx export', () => {
  it('creates an editable Word package with sections and evidence', async () => {
    const bytes = await buildResearchDocx({ title:'测试报告', thesis:'核心判断', sections:[{id:'S1',title:'结论',content:'内容',citations:['K1']}], evidence:[{id:'K1',kind:'knowledge',title:'教材',excerpt:'证据',score:.9}], slides:[], papers:[], searchQueries:[], warnings:[], mode:'local', id:'r', createdAt:new Date().toISOString(), request:{} as never });
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('测试报告');
    expect(xml).toContain('K1');
  });
});
