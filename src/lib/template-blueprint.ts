import { z } from 'zod';

import type { TemplateBlueprint, TemplateKind } from '@/types/platform';

const sectionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(2000).default(''),
});

const slideElementSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.enum(['text', 'image', 'shape']),
  x: z.number().min(-200).max(2000),
  y: z.number().min(-200).max(2000),
  width: z.number().min(0.1).max(3000),
  height: z.number().min(0.1).max(3000),
  text: z.string().max(20_000).optional(),
  fill: z.string().max(40).optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
  stroke: z.string().max(40).optional(),
  strokeOpacity: z.number().min(0).max(1).optional(),
  color: z.string().max(40).optional(),
  fontSize: z.number().min(1).max(300).optional(),
  fontFamily: z.string().max(200).optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  shape: z.enum(['rect', 'roundRect', 'ellipse', 'line', 'triangle', 'other']).optional(),
  imageDataUrl: z.string().max(1_300_000).optional(),
  imageStoragePath: z.string().max(1000).optional(),
  zIndex: z.number().int().min(0).max(500),
});

const documentPageSchema = z.object({
  index: z.number().int().min(1).max(200),
  title: z.string().max(200),
  text: z.string().max(5000),
  html: z.string().max(120_000).optional(),
  imageDataUrl: z.string().max(1_300_000).optional(),
  imageStoragePath: z.string().max(1000).optional(),
});

const slideSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(2000).default(''),
  layout: z.enum(['title', 'thesis', 'landscape', 'comparison', 'evidence', 'roadmap', 'conclusion']).default('landscape'),
  background: z.string().max(40).optional(),
  elements: z.array(slideElementSchema).max(150).optional(),
  source: z.enum(['uploaded-pptx', 'generated']).optional(),
});

export const templateBlueprintSchema = z.object({
  sections: z.array(sectionSchema).max(60).default([]),
  slides: z.array(slideSchema).max(64).default([]),
  documentPages: z.array(documentPageSchema).max(60).optional(),
  style: z.object({
    citationStyle: z.string().trim().max(120).default('按模板规则'),
    headingScheme: z.enum(['numeric', 'chinese', 'plain']).default('numeric'),
    reportWords: z.number().int().min(100).max(200_000).optional(),
    slideCount: z.number().int().min(1).max(64).optional(),
    tone: z.string().trim().max(200).default('清晰、严谨、可执行'),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0f766e'),
    fontFamily: z.string().trim().max(200).default('系统默认'),
    slideWidth: z.number().min(1).max(3000).optional(),
    slideHeight: z.number().min(1).max(3000).optional(),
    notes: z.string().max(10_000).optional(),
  }).default({
    citationStyle: '按模板规则',
    headingScheme: 'numeric',
    tone: '清晰、严谨、可执行',
    accentColor: '#0f766e',
    fontFamily: '系统默认',
  }),
});

export function defaultTemplateBlueprint(kind: TemplateKind = 'both'): TemplateBlueprint {
  const sectionTitles = ['研究背景与问题', '核心概念与相关工作', '方法与分析框架', '证据与讨论', '结论与下一步'];
  const slideTitles = ['封面', '问题与目标', '背景与现状', '核心证据', '方案与路线', '结论'];
  return {
    sections: kind === 'presentation' ? [] : sectionTitles.map((title, index) => ({
      id: `section-${index + 1}`,
      title,
      purpose: index === 0 ? '说明为什么研究这个问题' : index === sectionTitles.length - 1 ? '总结判断与后续行动' : '围绕证据展开这一部分',
    })),
    slides: kind === 'report' ? [] : slideTitles.map((title, index) => ({
      id: `slide-${index + 1}`,
      title,
      purpose: index === 0 ? '交代主题、作者与汇报对象' : '一页只表达一个中心观点',
      layout: index === 0 ? 'title' : index === 1 ? 'thesis' : index >= 4 ? 'roadmap' : 'landscape',
    })),
    style: {
      citationStyle: '在正文中保留证据编号，并在末尾统一列出处',
      headingScheme: 'numeric',
      reportWords: kind === 'presentation' ? undefined : 6000,
      slideCount: kind === 'report' ? undefined : 12,
      tone: '清晰、严谨、可执行',
      accentColor: '#0f766e',
      fontFamily: '系统默认',
    },
  };
}

export function parseTemplateBlueprint(value: unknown): TemplateBlueprint | undefined {
  if (value == null || value === '') return undefined;
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  const result = templateBlueprintSchema.safeParse(parsed);
  if (result.success) return result.data;
  // Older stored blueprints may not contain newly added visual fields. Keep
  // their existing sections and style usable instead of rejecting the whole
  // template.
  if (parsed && typeof parsed === 'object') {
    const legacy = parsed as Record<string, unknown>;
    return templateBlueprintSchema.parse({
      ...legacy,
      slides: Array.isArray(legacy.slides)
        ? legacy.slides.map((slide, index) => slide && typeof slide === 'object'
          ? { id: `slide-${index + 1}`, title: '模板页面', purpose: '', layout: 'landscape', ...slide }
          : slide)
        : [],
    });
  }
  throw result.error;
}

export function blueprintToInstructions(blueprint: TemplateBlueprint, extra = ''): string {
  const headingLabel = blueprint.style.headingScheme === 'numeric'
    ? '标题编号使用 1、1.1、1.1.1'
    : blueprint.style.headingScheme === 'chinese'
      ? '标题编号使用 一、（一）、1.'
      : '标题不强制编号，保持层级清晰';
  const lines = [
    '【结构化论文模板】',
    ...blueprint.sections.map((section, index) => `${index + 1}. ${section.title}${section.purpose ? `：${section.purpose}` : ''}`),
    '',
    '【结构化 PPT 模板】',
    ...blueprint.slides.map((slide, index) => {
      const elementSummary = slide.elements?.length
        ? `（${slide.elements.length} 个页面元素）`
        : '';
      return `${index + 1}. [${slide.layout}] ${slide.title}${slide.purpose ? `：${slide.purpose}` : ''}${elementSummary}`;
    }),
    '',
    '【样式规则】',
    `引用格式：${blueprint.style.citationStyle}`,
    headingLabel,
    blueprint.style.reportWords ? `论文/报告目标字数：约 ${blueprint.style.reportWords} 字` : '',
    blueprint.style.slideCount ? `PPT 目标页数：约 ${blueprint.style.slideCount} 页` : '',
    `表达语气：${blueprint.style.tone}`,
    `主色：${blueprint.style.accentColor}`,
    blueprint.style.notes ? `补充要求：${blueprint.style.notes}` : '',
    extra.trim() ? `\n【补充要求】\n${extra.trim()}` : '',
  ].filter(Boolean);
  return lines.join('\n').trim();
}
