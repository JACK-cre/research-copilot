import { z } from 'zod';

import type { GeneratedResearchOutput } from '@/types/research';

export type GeneratedOutput = GeneratedResearchOutput;

const SLIDE_TYPES = ['title', 'thesis', 'landscape', 'comparison', 'evidence', 'roadmap', 'conclusion'] as const;
const SLIDE_TYPE_ALIASES: Record<string, typeof SLIDE_TYPES[number]> = {
  title: 'title',
  cover: 'title',
  opening: 'title',
  intro: 'title',
  thesis: 'thesis',
  conclusion: 'conclusion',
  summary: 'conclusion',
  ending: 'conclusion',
  landscape: 'landscape',
  overview: 'landscape',
  background: 'landscape',
  comparison: 'comparison',
  compare: 'comparison',
  evidence: 'evidence',
  proof: 'evidence',
  data: 'evidence',
  roadmap: 'roadmap',
  plan: 'roadmap',
  next: 'roadmap',
};

const generatedOutputSchema = z.object({
  title: z.string().trim().min(1),
  thesis: z.string().trim().min(1),
  sections: z.array(
    z.object({
      title: z.string().trim().min(1),
      content: z.string().trim().min(1),
      citations: z.array(z.string()).default([]),
    }),
  ).min(1).max(12),
  slides: z.array(
    z.object({
      type: z.enum(SLIDE_TYPES),
      title: z.string().trim().min(1),
      keyPoints: z.array(z.string().trim().min(1)).min(1).max(8),
      citations: z.array(z.string()).default([]),
      speakerNotes: z.string().default(''),
    }),
  ).min(1).max(16),
});

const rerankOutputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    score: z.number().min(0).max(1),
    reason: z.string().max(240).default(''),
  })).max(40),
});


function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function asTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  const text = asText(value);
  return text ? [text] : [];
}

function coerceSlideType(value: unknown, index: number): typeof SLIDE_TYPES[number] {
  const alias = SLIDE_TYPE_ALIASES[asText(value).toLowerCase()];
  if (alias) return alias;
  return SLIDE_TYPES[Math.min(index, SLIDE_TYPES.length - 1)];
}

export function normalizeGeneratedResearchOutput(value: unknown): GeneratedOutput {
  if (!value || typeof value !== 'object') {
    throw new Error('模型没有返回论文/PPT JSON 对象。');
  }
  const raw = value as Record<string, unknown>;
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).map((item, index) => {
    const section = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const content = asTextList(section.content).join('\n') || asText(section.body) || asText(section.text);
    return {
      title: asText(section.title) || `第 ${index + 1} 部分`,
      content: content || '待补充内容。',
      citations: asTextList(section.citations),
    };
  });
  const slides = (Array.isArray(raw.slides) ? raw.slides : []).map((item, index) => {
    const slide = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const keyPoints = asTextList(slide.keyPoints).length
      ? asTextList(slide.keyPoints)
      : asTextList(slide.bullets).length
        ? asTextList(slide.bullets)
        : [asText(slide.title) || '要点'];
    return {
      type: coerceSlideType(slide.type, index),
      title: asText(slide.title) || `幻灯片 ${index + 1}`,
      keyPoints: keyPoints.slice(0, 8),
      citations: asTextList(slide.citations),
      speakerNotes: asText(slide.speakerNotes) || asText(slide.notes) || asText(slide.speaker_notes),
    };
  });
  return generatedOutputSchema.parse({
    title: asText(raw.title) || '未命名研究',
    thesis: asText(raw.thesis) || asText(raw.summary) || '模型未给出明确核心判断。',
    sections: sections.length ? sections : [{
      title: '综述',
      content: asText(raw.content) || asText(raw.thesis) || '模型未返回分节内容。',
      citations: [],
    }],
    slides: slides.length ? slides : [{
      type: 'title',
      title: asText(raw.title) || '研究结果',
      keyPoints: [asText(raw.thesis) || '请根据证据继续完善幻灯片。'],
      citations: [],
      speakerNotes: '',
    }],
  });
}

export function normalizeRerankOutput(value: unknown): z.infer<typeof rerankOutputSchema> {
  if (!value || typeof value !== 'object') {
    throw new Error('重排模型没有返回 JSON 对象。');
  }
  const raw = value as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? raw.items : Array.isArray(value) ? value : [];
  return rerankOutputSchema.parse({
    items: items.flatMap((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const id = asText(row.id);
      if (!id) return [];
      const score = Number(row.score);
      return [{
        id,
        score: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0,
        reason: asText(row.reason),
      }];
    }),
  });
}

