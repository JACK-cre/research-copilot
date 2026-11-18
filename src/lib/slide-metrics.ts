import type { SlideSpec } from '@/types/research';

export function isMetricSlide(slide: SlideSpec) {
  return slide.visual ? slide.visual.layout === 'metrics' : slide.type === 'metrics';
}

export function usableMetrics(slide: SlideSpec) {
  return !!slide.visual?.items.length && slide.visual.items.every(item => !!item.value?.trim() && /\d/.test(item.value));
}

export function descriptiveSlide(slide: SlideSpec): SlideSpec {
  const descriptions = slide.visual?.items.map(item => [item.title, item.description].filter(Boolean).join('：'));
  return { ...slide, type: 'text', visual: undefined, keyPoints: descriptions?.length ? descriptions : slide.keyPoints };
}

export function groundedMetricSlide(slide: SlideSpec, sources: string): SlideSpec {
  if (!isMetricSlide(slide)) return slide;
  const normalize = (s: string) => s.normalize('NFKC').replace(/\s/g, '');
  const text = normalize(sources);
  const supported = usableMetrics(slide) && slide.visual!.items.every(i => {
    const value = normalize(i.value!);
    return [...text.matchAll(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))].some(m =>
      !/[\d.]/.test(text[m.index! - 1] ?? '') && !/\d/.test(text[m.index! + value.length] ?? ''));
  });
  return supported ? slide : descriptiveSlide(slide);
}
