import { describe, expect, it } from 'vitest';

import { isVisionChatModel } from '@/lib/chat-client';
import {
  classifyPdfPage,
  extractedImageToPngDataUrl,
  mergePageText,
  needsPdfOcr,
  ocrPageLimit,
  visionPageSystemPrompt,
  visionPageUserPrompt,
} from '@/lib/pdf-ocr';

describe('pdf ocr helpers', () => {
  it('treats glm-5.3-flash as a vision model and glm-5.3 as text-only', () => {
    expect(isVisionChatModel('glm-5.3-flash')).toBe(true);
    expect(isVisionChatModel('GLM-5.3-FlashX')).toBe(true);
    expect(isVisionChatModel('glm-5.3')).toBe(false);
    expect(isVisionChatModel('glm-4.5-flash')).toBe(false);
    expect(isVisionChatModel('deepseek-chat')).toBe(false);
  });

  it('detects scanned textbooks with almost no extractable text', () => {
    expect(needsPdfOcr('   ', 12)).toBe(true);
    expect(needsPdfOcr('第1页 第2页', 40)).toBe(true);
    expect(needsPdfOcr('这是一本可复制文字的教材。'.repeat(20), 8)).toBe(false);
  });

  it('keeps digital text and still flags figure-heavy mixed pages for OCR', () => {
    const digital = '妊娠期高血压的诊断需要结合血压、尿蛋白和临床症状，并区分慢性高血压与妊娠期新发高血压。'.repeat(2);
    expect(classifyPdfPage(digital, 0)).toBe('text');
    expect(classifyPdfPage('', 1)).toBe('image');
    expect(classifyPdfPage(digital, 2)).toBe('mixed');
  });

  it('merges figure analysis without dropping the original page text', () => {
    const merged = mergePageText('妊娠期高血压的诊断标准。', '柱状图比较慢性高血压与妊娠期高血压的发生率。表1 血压分级');
    expect(merged).toContain('妊娠期高血压的诊断标准。');
    expect(merged).toContain('【图/表解析】');
    expect(merged).toContain('柱状图比较慢性高血压与妊娠期高血压的发生率');
    expect(mergePageText('同一段文字', '同一段文字')).toBe('同一段文字');
  });

  it('asks the vision model to explain figures, not only copy text', () => {
    expect(visionPageSystemPrompt()).toContain('图/表/照片/流程图在表达什么结构、关系或结论');
    expect(visionPageUserPrompt('mixed', 2, 10)).toContain('不要重复正文');
    expect(visionPageUserPrompt('mixed', 2, 10)).toContain('画面含义');
    expect(visionPageUserPrompt('image', 1, 3)).toContain('图/表含义和关键结论');
  });

  it('caps OCR pages so a long scan does not block the upload request', () => {
    expect(ocrPageLimit(800, 20)).toBe(20);
    expect(ocrPageLimit(6, 20)).toBe(6);
  });

  it('encodes extracted page pixels as a png data url', () => {
    const dataUrl = extractedImageToPngDataUrl({
      data: Uint8ClampedArray.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 128, 128, 128]),
      width: 2,
      height: 2,
      channels: 3,
    });
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(40);
  });
});
