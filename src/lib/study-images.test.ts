import { describe, expect, it } from 'vitest';

import {
  assertStudyImageBatch,
  inferStudyImageMime,
  isStudyImageMime,
  studyAttachmentLabel,
  studyImageCaption,
} from '@/lib/study-images';

describe('study image helpers', () => {
  it('accepts common image types from mime or filename', () => {
    expect(isStudyImageMime('image/png')).toBe(true);
    expect(isStudyImageMime('application/pdf')).toBe(false);
    expect(inferStudyImageMime({ type: 'image/jpg', name: 'a.jpg' })).toBe('image/jpeg');
    expect(inferStudyImageMime({ type: '', name: 'note.WEBP' })).toBe('image/webp');
    expect(inferStudyImageMime({ type: '', name: 'notes.txt' })).toBe('');
  });

  it('allows image-only turns with a short default caption', () => {
    expect(studyImageCaption('  这是什么  ', 1)).toBe('这是什么');
    expect(studyImageCaption('', 1)).toBe('请看这张图');
    expect(studyImageCaption('', 3)).toBe('请看这些图片');
    expect(studyImageCaption('', 0)).toBe('');
  });

  it('caps a turn at six images', () => {
    expect(() => assertStudyImageBatch(6)).not.toThrow();
    expect(() => assertStudyImageBatch(7)).toThrow(/一次最多发送 6 张图片/);
  });

  it('labels attached image names for model history', () => {
    expect(studyAttachmentLabel(['板书.png', '公式.jpg'])).toBe('用户发送了图片：板书.png、公式.jpg');
    expect(studyAttachmentLabel([])).toBe('');
  });
});
