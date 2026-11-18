import PptxGenJS from 'pptxgenjs';

import type { TemplateSlideBlueprint, TemplateSlideElement } from '@/types/platform';
import type { ResearchResult, SlideSpec, SlideVisualItem, SlideVisualLayout } from '@/types/research';

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
  const visualMode = Boolean(spec.visual) || ['timeline', 'process', 'architecture', 'case-study', 'three-columns', 'metrics', 'quote'].includes(spec.type);
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
        : visualMode
          ? ''
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
  if (visualMode) renderVisualSlide(pptx, slide, spec);
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

function visualItems(spec: SlideSpec): SlideVisualItem[] {
  if (spec.visual?.items?.length) return spec.visual.items;
  return spec.keyPoints.slice(0, 6).map((point, index) => ({
    label: String(index + 1).padStart(2, '0'),
    title: point,
  }));
}

function addVisualSubtitle(slide: PptxGenJS.Slide, subtitle?: string) {
  if (!subtitle) return;
  slide.addText(trimText(subtitle, 150), {
    x: 0.74,
    y: 1.08,
    w: 11.5,
    h: 0.3,
    fontSize: 11,
    color: COLORS.muted,
    margin: 0,
  });
}

function addTimelineVisual(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const items = visualItems(spec).slice(0, 5);
  if (!items.length) return;
  addVisualSubtitle(slide, spec.visual?.subtitle);
  const startX = 0.82;
  const totalWidth = 11.7;
  const step = totalWidth / items.length;
  const lineY = 3.55;
  slide.addShape(pptx.ShapeType.line, {
    x: startX + step / 2,
    y: lineY,
    w: Math.max(0.4, totalWidth - step),
    h: 0,
    line: { color: COLORS.line, width: 2 },
  });
  items.forEach((item, index) => {
    const centerX = startX + step * index + step / 2;
    const cardX = startX + step * index + 0.06;
    const cardY = index % 2 === 0 ? 1.55 : 4.18;
    const cardW = Math.max(1.65, step - 0.18);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: cardX,
      y: cardY,
      w: cardW,
      h: 1.28,
      rectRadius: 0.05,
      fill: { color: index % 2 === 0 ? 'EFF7F4' : 'FFF3EE' },
      line: { color: COLORS.line, width: 1 },
    });
    slide.addShape(pptx.ShapeType.line, {
      x: centerX,
      y: index % 2 === 0 ? cardY + 1.28 : lineY,
      w: 0,
      h: index % 2 === 0 ? lineY - (cardY + 1.28) : cardY - lineY,
      line: { color: index % 2 === 0 ? COLORS.teal : COLORS.coral, width: 1.2 },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: centerX - 0.23,
      y: lineY - 0.23,
      w: 0.46,
      h: 0.46,
      fill: { color: index % 2 === 0 ? COLORS.teal : COLORS.coral },
      line: { color: COLORS.white, width: 1 },
    });
    slide.addText(item.label || String(index + 1).padStart(2, '0'), {
      x: cardX + 0.16,
      y: cardY + 0.13,
      w: cardW - 0.32,
      h: 0.18,
      fontSize: 9,
      bold: true,
      color: index % 2 === 0 ? COLORS.teal : COLORS.coral,
      margin: 0,
    });
    slide.addText(trimText(item.title, 38), {
      x: cardX + 0.16,
      y: cardY + 0.38,
      w: cardW - 0.32,
      h: 0.36,
      fontSize: 14,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
    });
    if (item.description) slide.addText(trimText(item.description, 66), {
      x: cardX + 0.16,
      y: cardY + 0.8,
      w: cardW - 0.32,
      h: 0.32,
      fontSize: 9,
      color: COLORS.muted,
      margin: 0,
      fit: 'shrink',
    });
  });
}

function addProcessVisual(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const items = visualItems(spec).slice(0, 5);
  if (!items.length) return;
  addVisualSubtitle(slide, spec.visual?.subtitle);
  const gap = 0.22;
  const startX = 0.78;
  const boxW = (11.78 - gap * (items.length - 1)) / items.length;
  items.forEach((item, index) => {
    const x = startX + index * (boxW + gap);
    const accent = index % 2 === 0 ? COLORS.teal : COLORS.coral;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.08,
      w: boxW,
      h: 2.45,
      rectRadius: 0.06,
      fill: { color: index % 2 === 0 ? 'EFF7F4' : 'FFF3EE' },
      line: { color: COLORS.line, width: 1 },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.2,
      y: 2.32,
      w: 0.42,
      h: 0.42,
      fill: { color: accent },
      line: { transparency: 100 },
    });
    slide.addText(String(index + 1).padStart(2, '0'), {
      x: x + 0.29,
      y: 2.45,
      w: 0.24,
      h: 0.12,
      fontSize: 8,
      bold: true,
      color: COLORS.white,
      align: 'center',
      margin: 0,
    });
    slide.addText(item.label || '步骤 ' + (index + 1), {
      x: x + 0.76,
      y: 2.37,
      w: boxW - 0.94,
      h: 0.2,
      fontSize: 9,
      bold: true,
      color: accent,
      margin: 0,
    });
    slide.addText(trimText(item.title, 42), {
      x: x + 0.24,
      y: 3.02,
      w: boxW - 0.48,
      h: 0.56,
      fontSize: 16,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
      valign: 'middle',
    });
    if (item.description) slide.addText(trimText(item.description, 90), {
      x: x + 0.24,
      y: 3.72,
      w: boxW - 0.48,
      h: 0.48,
      fontSize: 10,
      color: COLORS.muted,
      margin: 0,
      fit: 'shrink',
    });
    if (index < items.length - 1) slide.addShape(pptx.ShapeType.rightArrow, {
      x: x + boxW + 0.02,
      y: 3.08,
      w: gap - 0.04,
      h: 0.34,
      fill: { color: COLORS.line },
      line: { transparency: 100 },
    });
  });
}

function addArchitectureVisual(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const items = visualItems(spec).slice(0, 4);
  if (!items.length) return;
  addVisualSubtitle(slide, spec.visual?.subtitle);
  items.forEach((item, index) => {
    const y = 1.52 + index * 1.23;
    const accent = index % 2 === 0 ? COLORS.teal : COLORS.coral;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.84,
      y,
      w: 11.58,
      h: 0.92,
      rectRadius: 0.04,
      fill: { color: index % 2 === 0 ? 'EFF7F4' : 'FFF6F1' },
      line: { color: COLORS.line, width: 1 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.84,
      y,
      w: 1.72,
      h: 0.92,
      fill: { color: accent },
      line: { transparency: 100 },
    });
    slide.addText(item.label || `层 ${index + 1}`, {
      x: 1.02,
      y: y + 0.32,
      w: 1.36,
      h: 0.2,
      fontSize: 11,
      bold: true,
      color: COLORS.white,
      align: 'center',
      margin: 0,
    });
    slide.addText(trimText(item.title, 48), {
      x: 2.88,
      y: y + 0.17,
      w: 3.8,
      h: 0.28,
      fontSize: 15,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
    });
    slide.addText(trimText(item.description || '围绕这一层能力形成稳定的输入、处理与输出关系。', 120), {
      x: 6.72,
      y: y + 0.22,
      w: 5.2,
      h: 0.25,
      fontSize: 10,
      color: COLORS.muted,
      margin: 0,
      fit: 'shrink',
    });
    if (index < items.length - 1) slide.addShape(pptx.ShapeType.downArrow, {
      x: 6.42,
      y: y + 0.94,
      w: 0.38,
      h: 0.3,
      fill: { color: COLORS.line },
      line: { transparency: 100 },
    });
  });
}

function addCaseStudyVisual(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const items = visualItems(spec).slice(0, 4);
  if (!items.length) return;
  addVisualSubtitle(slide, spec.visual?.subtitle);
  const labels = ['背景', '负责', '方案', '产出'];
  const width = 11.72 / items.length;
  items.forEach((item, index) => {
    const x = 0.8 + index * width;
    const accent = index % 2 === 0 ? COLORS.teal : COLORS.coral;
    slide.addShape(pptx.ShapeType.line, {
      x,
      y: 1.7,
      w: width - 0.2,
      h: 0,
      line: { color: accent, width: 4 },
    });
    slide.addText(item.label || labels[index] || `阶段 ${index + 1}`, {
      x,
      y: 1.92,
      w: width - 0.2,
      h: 0.24,
      fontSize: 10,
      bold: true,
      color: accent,
      margin: 0,
    });
    slide.addText(trimText(item.title, 44), {
      x,
      y: 2.42,
      w: width - 0.24,
      h: 0.8,
      fontSize: 18,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
      valign: 'middle',
    });
    slide.addText(trimText(item.description || '根据用户材料提炼这一部分的关键行动与价值。', 105), {
      x,
      y: 3.62,
      w: width - 0.24,
      h: 0.82,
      fontSize: 11,
      color: COLORS.muted,
      margin: 0,
      fit: 'shrink',
    });
    if (index < items.length - 1) slide.addShape(pptx.ShapeType.rightArrow, {
      x: x + width - 0.1,
      y: 3.05,
      w: 0.28,
      h: 0.28,
      fill: { color: COLORS.line },
      line: { transparency: 100 },
    });
  });
}

function addThreeColumnsVisual(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const items = visualItems(spec).slice(0, 3);
  if (!items.length) return;
  addVisualSubtitle(slide, spec.visual?.subtitle);
  const width = 11.7 / items.length;
  items.forEach((item, index) => {
    const x = 0.82 + index * width;
    const accent = index === 1 ? COLORS.coral : COLORS.teal;
    if (index > 0) slide.addShape(pptx.ShapeType.line, {
      x: x - 0.08,
      y: 1.68,
      w: 0,
      h: 3.8,
      line: { color: COLORS.line, width: 1 },
    });
    slide.addText(String(index + 1).padStart(2, '0'), {
      x,
      y: 1.7,
      w: 0.64,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: accent,
      margin: 0,
    });
    slide.addText(trimText(item.label || item.title, 30), {
      x,
      y: 2.34,
      w: width - 0.34,
      h: 0.7,
      fontSize: 20,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
    });
    slide.addText(trimText(item.description || item.title, 110), {
      x,
      y: 3.42,
      w: width - 0.34,
      h: 1.25,
      fontSize: 12,
      color: COLORS.muted,
      margin: 0,
      fit: 'shrink',
    });
  });
}

function addMetricsVisual(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const items = visualItems(spec).slice(0, 4);
  if (!items.length) return;
  addVisualSubtitle(slide, spec.visual?.subtitle);
  const width = 11.7 / items.length;
  items.forEach((item, index) => {
    const x = 0.82 + index * width;
    const accent = index % 2 === 0 ? COLORS.teal : COLORS.coral;
    slide.addText(item.value || String(index + 1).padStart(2, '0'), {
      x,
      y: 2.0,
      w: width - 0.3,
      h: 0.74,
      fontSize: 30,
      bold: true,
      color: accent,
      margin: 0,
      fit: 'shrink',
    });
    slide.addText(trimText(item.title, 32), {
      x,
      y: 3.05,
      w: width - 0.3,
      h: 0.5,
      fontSize: 15,
      bold: true,
      color: COLORS.ink,
      margin: 0,
      fit: 'shrink',
    });
    if (item.description) slide.addText(trimText(item.description, 78), {
      x,
      y: 3.78,
      w: width - 0.3,
      h: 0.7,
      fontSize: 10,
      color: COLORS.muted,
      margin: 0,
      fit: 'shrink',
    });
  });
}

function addQuoteVisual(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec) {
  const items = visualItems(spec);
  if (!items.length) return;
  addVisualSubtitle(slide, spec.visual?.subtitle);
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.82,
    y: 1.72,
    w: 0.16,
    h: 3.7,
    fill: { color: COLORS.coral },
    line: { transparency: 100 },
  });
  slide.addText('“', {
    x: 1.28,
    y: 1.72,
    w: 0.6,
    h: 0.65,
    fontFace: 'Georgia',
    fontSize: 38,
    color: COLORS.teal,
    margin: 0,
  });
  slide.addText(trimText(items[0].title, 170), {
    x: 1.72,
    y: 2.28,
    w: 10.3,
    h: 1.65,
    fontSize: 25,
    bold: true,
    color: COLORS.ink,
    margin: 0,
    fit: 'shrink',
    valign: 'middle',
  });
  if (items[0].description) slide.addText(trimText(items[0].description, 150), {
    x: 1.76,
    y: 4.32,
    w: 9.8,
    h: 0.58,
    fontSize: 13,
    color: COLORS.muted,
    margin: 0,
    fit: 'shrink',
  });
}

function visualLayoutFor(spec: SlideSpec): SlideVisualLayout | undefined {
  if (spec.visual?.layout) return spec.visual.layout;
  if (spec.type === 'timeline' || spec.type === 'roadmap') return 'timeline';
  if (spec.type === 'process') return 'process';
  if (spec.type === 'architecture') return 'architecture';
  if (spec.type === 'case-study' || spec.type === 'evidence') return 'case-study';
  if (spec.type === 'three-columns' || spec.type === 'landscape') return 'three-columns';
  if (spec.type === 'metrics') return 'metrics';
  if (spec.type === 'quote' || spec.type === 'thesis' || spec.type === 'conclusion') return 'quote';
  if (spec.type === 'comparison') return 'comparison';
  return undefined;
}

function renderVisualSlide(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec): boolean {
  const layout = visualLayoutFor(spec);
  switch (layout) {
    case 'timeline': addTimelineVisual(pptx, slide, spec); return true;
    case 'process': addProcessVisual(pptx, slide, spec); return true;
    case 'architecture': addArchitectureVisual(pptx, slide, spec); return true;
    case 'case-study': addCaseStudyVisual(pptx, slide, spec); return true;
    case 'three-columns': addThreeColumnsVisual(pptx, slide, spec); return true;
    case 'metrics': addMetricsVisual(pptx, slide, spec); return true;
    case 'quote': addQuoteVisual(pptx, slide, spec); return true;
    case 'comparison': addComparison(pptx, slide, spec); return true;
    default: return false;
  }
}


function addDocumentStructureSlide(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  spec: SlideSpec,
  index: number,
  templateName: string,
) {
  const accent = index % 2 ? COLORS.teal : COLORS.coral;
  slide.background = { color: COLORS.paper };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: accent }, line: { transparency: 100 } });
  slide.addText(trimText(spec.title, 70), { x: 0.65, y: 0.48, w: 11.9, h: 0.55, fontFace: 'Aptos Display', fontSize: 25, bold: true, color: COLORS.ink, margin: 0 });
  slide.addShape(pptx.ShapeType.line, { x: 0.65, y: 1.18, w: 11.9, h: 0, line: { color: COLORS.line, width: 1 } });
  if (visualLayoutFor(spec)) {
    renderVisualSlide(pptx, slide, spec);
    slide.addText(templateName, { x: 0.7, y: 7.08, w: 6, h: 0.2, fontSize: 8, color: COLORS.muted, margin: 0 });
    if (spec.citations.length) slide.addText(spec.citations.map((id) => `[${id}]`).join(' '), { x: 8.4, y: 7.08, w: 4.2, h: 0.2, fontSize: 8, color: COLORS.muted, align: 'right', margin: 0 });
    return;
  }
  const points = spec.keyPoints.slice(0, 4);
  points.forEach((point, pointIndex) => {
    const y = 1.55 + pointIndex * 1.25;
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.72, y, w: 11.75, h: 1.02, rectRadius: 0.08, fill: { color: pointIndex % 2 ? 'F2F7F5' : 'FFF8F4' }, line: { color: COLORS.line, width: 1 } });
    slide.addText(String(pointIndex + 1).padStart(2, '0'), { x: 0.95, y: y + 0.23, w: 0.6, h: 0.35, fontSize: 12, bold: true, color: accent, margin: 0 });
    slide.addText(trimText(point, 210), { x: 1.65, y: y + 0.16, w: 10.3, h: 0.7, fontSize: 17, color: COLORS.ink, valign: 'middle', margin: 0 });
  });
  slide.addText(templateName, { x: 0.7, y: 7.08, w: 6, h: 0.2, fontSize: 8, color: COLORS.muted, margin: 0 });
  if (spec.citations.length) slide.addText(spec.citations.map((id) => `[${id}]`).join(' '), { x: 8.4, y: 7.08, w: 4.2, h: 0.2, fontSize: 8, color: COLORS.muted, align: 'right', margin: 0 });
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

    if (result.template?.blueprint?.documentPages?.length && !templateSlide?.elements?.length) {
      addDocumentStructureSlide(pptx, slide, spec, index, result.template.name);
    } else if (templateSlide?.elements?.length) {
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
      const renderedVisual = renderVisualSlide(pptx, slide, spec);
      if (!renderedVisual && spec.type === 'evidence') {
        addBullets(slide, spec.keyPoints, { y: 1.55 });
        slide.addShape(pptx.ShapeType.roundRect, { x: 0.72, y: 5.95, w: 2.1, h: 0.42, rectRadius: 0.06, fill: { color: COLORS.tealSoft }, line: { transparency: 100 } });
        slide.addText('证据驱动', { x: 0.9, y: 6.06, w: 1.7, h: 0.18, fontSize: 10, bold: true, color: COLORS.teal, margin: 0 });
      } else if (!renderedVisual) addBullets(slide, spec.keyPoints);
    }

    if (spec.speakerNotes) slide.addNotes(spec.speakerNotes);
  });

  const output = await pptx.write({ outputType: 'uint8array' });
  return output as Uint8Array;
}
