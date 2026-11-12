import PptxGenJS from 'pptxgenjs';

import type { TemplateSlideBlueprint, TemplateSlideElement } from '@/types/platform';
import type { ResearchResult, SlideSpec } from '@/types/research';

const COLORS = {
  ink: '17211F',
  paper: 'F6F7F4',
  white: 'FFFFFF',
  teal: '0F766E',
  tealSoft: 'DDEDEA',
  coral: 'C65D3A',
  gold: 'D5A429',
  muted: '65716E',
  line: 'D7DDDA',
};

function trimText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, maxLength - 3).trim() + '...';
}

function addFrame(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  title: string,
  index: number,
  citations: string[],
  citationStyle: string,
) {
  slide.background = { color: COLORS.paper };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.16,
    fill: { color: index % 2 ? COLORS.teal : COLORS.coral },
    line: { transparency: 100 },
  });
  slide.addText(trimText(title, 64), {
    x: 0.72,
    y: 0.48,
    w: 10.8,
    h: 0.55,
    fontFace: 'Aptos Display',
    fontSize: 24,
    bold: true,
    color: COLORS.ink,
    margin: 0,
  });
  slide.addText(String(index).padStart(2, '0'), {
    x: 11.85,
    y: 0.53,
    w: 0.7,
    h: 0.3,
    fontFace: 'Aptos',
    fontSize: 10,
    color: COLORS.muted,
    align: 'right',
    margin: 0,
  });
  if (citations.length) {
    slide.addText(citationStyle + '  ' + citations.join(' · '), {
      x: 0.72,
      y: 7.08,
      w: 11.85,
      h: 0.18,
      fontFace: 'Aptos',
      fontSize: 8,
      color: COLORS.muted,
      margin: 0,
    });
  }
}


function toHex(color: string | undefined, fallback: string): string {
  return (color ?? fallback).replace(/^#/, '').toUpperCase();
}

function addTemplateSlide(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  templateSlide: TemplateSlideBlueprint,
  spec: SlideSpec,
  templateWidth: number,
  templateHeight: number,
  fallbackText: string,
) {
  const width = templateWidth || 960;
  const height = templateHeight || 540;
  const pxX = (value: number) => value / width * 13.333;
  const pxY = (value: number) => value / height * 7.5;
  slide.background = { color: toHex(templateSlide.background, 'FFFFFF') };
  const elements = (templateSlide.elements ?? []).slice().sort((left, right) => left.zIndex - right.zIndex);
  let textSlot = 0;
  for (const element of elements) {
    const x = pxX(element.x);
    const y = pxY(element.y);
    const w = Math.max(0.02, pxX(element.width));
    const h = Math.max(0.02, pxY(element.height));
    if (element.type === 'image' && element.imageDataUrl) {
      slide.addImage({
        data: element.imageDataUrl,
        x,
        y,
        w,
        h,
        sizing: { type: 'contain', w, h },
      });
      continue;
    }
    if (element.type === 'shape') {
      const shape = element.shape === 'ellipse'
        ? pptx.ShapeType.ellipse
        : element.shape === 'line'
          ? pptx.ShapeType.line
          : pptx.ShapeType.rect;
      slide.addShape(shape, {
        x,
        y,
        w,
        h,
        fill: element.fill
          ? { color: toHex(element.fill, 'FFFFFF'), transparency: Math.round((1 - (element.fillOpacity ?? 1)) * 100) }
          : { color: 'FFFFFF', transparency: 100 },
        line: element.stroke
          ? { color: toHex(element.stroke, 'FFFFFF'), width: 1, transparency: Math.round((1 - (element.strokeOpacity ?? 1)) * 100) }
          : { color: 'FFFFFF', transparency: 100 },
        ...(element.shape === 'roundRect' ? { rectRadius: 0.04 } : {}),
      });
      continue;
    }
    if (element.type === 'text') {
      // The uploaded deck supplies the visual layout; generated content supplies
      // the text. Keep the first text element as the title and distribute
      // subsequent content into the remaining text slots.
      const generatedText = textSlot === 0
        ? spec.title
        : spec.keyPoints[textSlot - 1] ?? '';
      textSlot += 1;
      if (!generatedText) continue;
      slide.addText(trimText(generatedText, 260), {
        x,
        y,
        w,
        h,
        fontFace: element.fontFamily || 'Aptos',
        fontSize: Math.max(8, Math.min(40, element.fontSize ?? 16)),
        bold: element.fontWeight === 'bold',
        color: toHex(element.color, '17211F'),
        align: element.align ?? 'left',
        valign: element.verticalAlign === 'middle' ? 'middle' : element.verticalAlign === 'bottom' ? 'bottom' : 'top',
        margin: 0.02,
        breakLine: false,
        fit: 'shrink',
      });
    }
  }
  if (spec.citations.length) {
    slide.addText(spec.citations.map((id) => `[${id}]`).join(' '), {
      x: 0.6,
      y: 7.13,
      w: 12.1,
      h: 0.18,
      fontSize: 8,
      color: '65716E',
      align: 'right',
      margin: 0,
    });
  }
  if (!elements.length) slide.addText(trimText(fallbackText, 220), { x: 0.8, y: 1.4, w: 11.6, h: 5, fontSize: 20, color: '17211F' });
}

function addBullets(slide: PptxGenJS.Slide, points: string[], options?: { y?: number; color?: string }) {
  const rows = points.slice(0, 5).map((point) => ({
    text: trimText(point, 175),
    options: { bullet: { indent: 16 }, hanging: 4, breakLine: true },
  }));
  slide.addText(rows, {
    x: 0.9,
    y: options?.y ?? 1.45,
    w: 11.35,
    h: 4.95,
    fontFace: 'Aptos',
    fontSize: 19,
    color: options?.color ?? COLORS.ink,
    breakLine: false,
    paraSpaceAfter: 18,
    valign: 'middle',
    margin: 0.08,
  });
}

function addComparison(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const points = spec.keyPoints.slice(0, 4);
  points.forEach((point, index) => {
    const x = index % 2 === 0 ? 0.78 : 6.78;
    const y = index < 2 ? 1.45 : 4.05;
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 5.75,
      h: 2.18,
      rectRadius: 0.04,
      fill: { color: index % 2 ? 'F4E8E2' : COLORS.tealSoft },
      line: { color: COLORS.line, width: 1 },
    });
    slide.addText(String(index + 1).padStart(2, '0'), {
      x: x + 0.28,
      y: y + 0.25,
      w: 0.55,
      h: 0.3,
      fontSize: 11,
      bold: true,
      color: index % 2 ? COLORS.coral : COLORS.teal,
      margin: 0,
    });
    slide.addText(trimText(point, 145), {
      x: x + 0.28,
      y: y + 0.72,
      w: 5.12,
      h: 1.12,
      fontSize: 17,
      bold: true,
      color: COLORS.ink,
      valign: 'middle',
      margin: 0,
    });
  });
}

function addRoadmap(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const points = spec.keyPoints.slice(0, 5);
  const width = 11.8 / Math.max(points.length, 1);
  slide.addShape(pptx.ShapeType.line, {
    x: 1.0,
    y: 3.05,
    w: 11.05,
    h: 0,
    line: { color: COLORS.line, width: 2 },
  });
  points.forEach((point, index) => {
    const x = 0.75 + index * width;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + width / 2 - 0.28,
      y: 2.77,
      w: 0.56,
      h: 0.56,
      fill: { color: index % 2 ? COLORS.coral : COLORS.teal },
      line: { transparency: 100 },
    });
    slide.addText(String(index + 1), {
      x: x + width / 2 - 0.18,
      y: 2.91,
      w: 0.36,
      h: 0.18,
      fontSize: 9,
      bold: true,
      align: 'center',
      color: COLORS.white,
      margin: 0,
    });
    slide.addText(trimText(point, 72), {
      x,
      y: index % 2 ? 3.55 : 1.55,
      w: width - 0.12,
      h: 0.92,
      fontSize: 14,
      bold: true,
      align: 'center',
      valign: 'middle',
      color: COLORS.ink,
      margin: 0.05,
    });
  });
}

export async function buildPresentation(result: ResearchResult): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Research Copilot';
  pptx.subject = result.request.topic;
  pptx.title = result.title;
  pptx.company = 'Research Copilot';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };

  result.slides.forEach((spec, index) => {
    const slide = pptx.addSlide();
    const slideNumber = index + 1;
    const visualTemplate = result.template?.blueprint;
    const templateSlide = visualTemplate?.slides[index];

    if (templateSlide?.elements?.length) {
      addTemplateSlide(
        pptx,
        slide,
        templateSlide,
        spec,
        visualTemplate?.style.slideWidth ?? 960,
        visualTemplate?.style.slideHeight ?? 540,
        spec.keyPoints.join(' '),
      );
    } else if (spec.type === 'title') {
      slide.background = { color: COLORS.ink };
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.75,
        y: 0.75,
        w: 0.16,
        h: 5.85,
        fill: { color: COLORS.coral },
        line: { transparency: 100 },
      });
      slide.addText(trimText(spec.title, 72), {
        x: 1.25,
        y: 1.35,
        w: 10.9,
        h: 2.35,
        fontFace: 'Aptos Display',
        fontSize: 34,
        bold: true,
        color: COLORS.white,
        margin: 0,
        valign: 'middle',
      });
      slide.addText(trimText(spec.keyPoints[0] ?? result.request.requirements, 160), {
        x: 1.28,
        y: 4.12,
        w: 9.9,
        h: 1.1,
        fontSize: 17,
        color: 'B8C5C1',
        margin: 0,
      });
      slide.addText(new Date(result.createdAt).toLocaleDateString('zh-CN'), {
        x: 1.28,
        y: 6.24,
        w: 2.5,
        h: 0.3,
        fontSize: 10,
        color: '91A19C',
        margin: 0,
      });
      if (result.template) {
        slide.addText(`${result.template.name} · V${result.version ?? 1}`, {
          x: 8.4,
          y: 6.24,
          w: 3.7,
          h: 0.3,
          fontSize: 10,
          align: 'right',
          color: '91A19C',
          margin: 0,
        });
      }
    } else {
      addFrame(pptx, slide, spec.title, slideNumber, spec.citations, result.template?.citationStyle ?? 'Sources');
      if (spec.type === 'comparison') addComparison(pptx, slide, spec);
      else if (spec.type === 'roadmap') addRoadmap(pptx, slide, spec);
      else addBullets(slide, spec.keyPoints);
    }

    if (spec.speakerNotes) slide.addNotes(spec.speakerNotes);
  });

  const output = await pptx.write({ outputType: 'uint8array' });
  return output as Uint8Array;
}
