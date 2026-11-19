import type { SlideSpec } from '@/types/research';

export type PresentationQualityIssue = {
  slide: number;
  kind: 'dense' | 'title' | 'visual';
  message: string;
};

export function auditSlidePlan(slides: SlideSpec[]): PresentationQualityIssue[] {
  const issues: PresentationQualityIssue[] = [];
  slides.forEach((slide, index) => {
    if (slide.title.length > 42) issues.push({ slide: index + 1, kind: 'title', message: `第 ${index + 1} 页标题较长，建议在 PPT 中人工确认换行。` });
    if (slide.keyPoints.length > 5 || slide.keyPoints.some(point => point.length > 120)) {
      issues.push({ slide: index + 1, kind: 'dense', message: `第 ${index + 1} 页文字密度较高，建议拆页或将细节放入讲稿备注。` });
    }
    if (slide.visual && slide.visual.items.length > 6) {
      issues.push({ slide: index + 1, kind: 'visual', message: `第 ${index + 1} 页视觉元素较多，可能影响可读性。` });
    }
  });
  return issues;
}

export function presentationQualityWarnings(slides: SlideSpec[]): string[] {
  return auditSlidePlan(slides).slice(0, 8).map(issue => issue.message);
}
