import { describe, expect, it } from 'vitest';

import { docxStructureToInstructions, type DocxTemplateStructure } from '@/lib/docx-template-structure';

const structure: DocxTemplateStructure = {
  title: '实习周记',
  paragraphs: [{ text: '实习周记', alignment: 'center', fontSize: 14 }],
  tables: [{ rows: 3, columns: 1, cells: ['一、本周具体工作安排及工作内容：', '二、本周工作的实际完成情况', '三、本周自我评价'] }],
};

describe('DOCX template structure', () => {
  it('turns layout and form fields into reusable rules without treating them as report prose', () => {
    const instructions = docxStructureToInstructions(structure);
    expect(instructions).toContain('表格：3 行 × 1 列');
    expect(instructions).toContain('不得把示例内容当成本次生成的主题或正文');
    expect(instructions).toContain('一、本周具体工作安排及工作内容');
  });
});
