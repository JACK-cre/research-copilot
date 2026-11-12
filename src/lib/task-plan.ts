import { z } from 'zod';

import type { OutputTemplateSnapshot } from '@/types/platform';
import type { ResearchRequest } from '@/types/research';

export type OutputEmphasis = 'presentation' | 'report' | 'balanced';
export type ContentStrategy = 'user-material' | 'evidence' | 'hybrid';

export interface TaskPlan {
  objective: string;
  outputEmphasis: OutputEmphasis;
  contentStrategy: ContentStrategy;
  audienceGuidance: string;
  externalEvidenceNeeded: boolean;
  knowledgeBaseNeeded: boolean;
  citationPolicy: string;
  narrativeGuidance: string[];
}

const modelTaskPlanSchema = z.object({
  objective: z.string().trim().min(2).max(1000).optional(),
  outputEmphasis: z.enum(['presentation', 'report', 'balanced']).optional(),
  contentStrategy: z.enum(['user-material', 'evidence', 'hybrid']).optional(),
  audienceGuidance: z.string().trim().min(2).max(1000).optional(),
  externalEvidenceNeeded: z.boolean().optional(),
  knowledgeBaseNeeded: z.boolean().optional(),
  citationPolicy: z.string().trim().min(2).max(1000).optional(),
  narrativeGuidance: z.array(z.string().trim().min(2).max(1000)).min(1).max(8).optional(),
});

const PRESENTATION_PATTERN = /PPTX?|幻灯片|演示|答辩|汇报|路演|述职/i;
const REPORT_PATTERN = /论文|文章|报告|文稿|Word|DOCX?|综述|方案书/i;
const USER_MATERIAL_PATTERN = /实习|转正|述职|工作总结|项目复盘|工作经历|个人经历|周报|月报|年终总结|自我介绍|简历|答辩/i;
const FIRST_PERSON_PATTERN = /(?:我|本人|个人)(?:负责|参与|完成|承担|从事|主导|协助)|这段时间|以下是|这些是/i;
const EXTERNAL_EVIDENCE_PATTERN = /文献(?:综述|调研|引用)?|参考文献|论文检索|外部资料|权威资料|行业报告|行业数据|公开数据|统计数据|史料|资料来源|引用来源|证据支持/i;
const KNOWLEDGE_BASE_PATTERN = /知识库|已上传|上传的?资料|附件|内部文档|根据资料|参考资料|从文档|基于文档/i;
const ACADEMIC_PATTERN = /学术|论文|文献综述|研究综述|实验|算法|模型评测|benchmark|survey|research/i;
const BOOK_REVIEW_PATTERN = /读后感|书评|阅读报告|读书笔记|作品赏析|作品分析|名著阅读|观后感/i;

function inferOutputEmphasis(
  request: ResearchRequest,
  template?: OutputTemplateSnapshot,
): OutputEmphasis {
  if (template?.kind === 'presentation') return 'presentation';
  if (template?.kind === 'report') return 'report';

  const text = `${request.topic}\n${request.requirements}`;
  const asksForPresentation = PRESENTATION_PATTERN.test(text);
  const asksForReport = REPORT_PATTERN.test(text);
  if (asksForPresentation && !asksForReport) return 'presentation';
  if (asksForReport && !asksForPresentation) return 'report';

  // Historical API callers can still supply the old explicit field. New UI
  // requests use auto and rely on topic, requirements and the template.
  if (request.deliverable === 'briefing') return 'presentation';
  if (request.deliverable === 'survey' || request.deliverable === 'proposal') return 'report';
  return 'balanced';
}

function inferAudience(request: ResearchRequest, sourceLed: boolean): string {
  const text = `${request.topic}\n${request.requirements}`;
  if (/转正|答辩|述职|实习/.test(text)) {
    return '面向答辩评审、导师和业务团队，既要让非项目成员快速理解，也要体现技术深度与个人贡献。';
  }
  if (ACADEMIC_PATTERN.test(text)) {
    return '面向教师、评审或研究人员，术语准确，论断与来源边界清楚。';
  }
  if (BOOK_REVIEW_PATTERN.test(text)) {
    return '面向课程教师或普通读者，兼顾作品理解、具体细节和个人思考。';
  }
  if (request.audience === 'technical') return '面向技术读者，优先说明机制、取舍、实现和验证。';
  if (request.audience === 'academic') return '面向学术读者，保持论证严谨并清楚标注外部来源。';
  if (request.audience === 'general') return '面向普通读者，减少不必要术语并突出清晰结论。';
  return sourceLed
    ? '从用户提供的材料与任务语境中推断受众，确保陌生读者也能理解背景、重点和结论。'
    : '从主题、要求和模板中推断最合适的受众与表达深度。';
}

export function buildTaskPlan(
  request: ResearchRequest,
  template?: OutputTemplateSnapshot,
): TaskPlan {
  const text = `${request.topic}\n${request.requirements}`;
  const materialLength = request.requirements.replace(/\s+/g, '').length;
  const sourceLed = (USER_MATERIAL_PATTERN.test(text) && materialLength >= 20)
    || (FIRST_PERSON_PATTERN.test(request.requirements) && materialLength >= 40);
  const explicitlyNeedsExternalEvidence = EXTERNAL_EVIDENCE_PATTERN.test(text);
  const explicitlyNeedsKnowledgeBase = KNOWLEDGE_BASE_PATTERN.test(text);
  const academic = ACADEMIC_PATTERN.test(text);
  const bookReview = BOOK_REVIEW_PATTERN.test(text);
  const outputEmphasis = inferOutputEmphasis(request, template);
  const externalEvidenceNeeded = request.includeExternal
    && (!sourceLed || explicitlyNeedsExternalEvidence || academic || bookReview);
  const knowledgeBaseNeeded = request.includeLibrary
    && (!sourceLed || explicitlyNeedsKnowledgeBase);
  const contentStrategy: ContentStrategy = sourceLed
    ? externalEvidenceNeeded || knowledgeBaseNeeded ? 'hybrid' : 'user-material'
    : externalEvidenceNeeded || knowledgeBaseNeeded ? 'evidence' : 'user-material';

  const narrativeGuidance = sourceLed
    ? [
      '从用户材料中提取事实，按主题重新组织，不要把整段原文塞进一页或一段。',
      '优先形成“概览—时间线/范围—代表事项—方法与难点—结果与价值—成长反思—下一步”的连贯叙事，并根据材料实际内容增删页面。',
      '清楚区分团队背景、个人职责、具体行动和产出价值；没有明确数字时不得虚构指标。',
    ]
    : bookReview
      ? [
        '围绕作品内容、创作或历史背景、关键主题、具体细节、个人思考与现实启示组织内容。',
        '不要把通用研究框架或技术路线强行套入读后感、书评或作品分析。',
      ]
      : academic
        ? [
          '围绕问题定义、相关工作、证据或方法比较、局限与结论形成论证链。',
          '外部事实和研究结论必须由证据支持，不能为了凑数量保留低相关来源。',
        ]
        : [
          '依据主题、用户要求和模板动态设计结构，不套用固定的学术研究、书评或通用研究提纲。',
          '每一部分只承担一个清晰目的，优先输出具体、可执行、与任务直接相关的内容。',
        ];

  return {
    objective: `围绕“${request.topic.trim()}”完成符合用户要求和模板结构的高质量交付物。`,
    outputEmphasis,
    contentStrategy,
    audienceGuidance: inferAudience(request, sourceLed),
    externalEvidenceNeeded,
    knowledgeBaseNeeded,
    citationPolicy: contentStrategy === 'user-material'
      ? '用户提供的经历、要求和事实可直接使用且不需要伪造引用；只有新增的外部事实才需要证据编号。'
      : contentStrategy === 'hybrid'
        ? '用户材料作为第一方事实直接使用；外部背景、数据和研究结论必须引用对应证据编号。'
        : '外部事实和研究结论必须引用对应证据编号；分析性过渡语不需要为了形式强行添加引用。',
    narrativeGuidance,
  };
}

export function applyModelTaskPlan(
  value: unknown,
  fallback: TaskPlan,
  request: ResearchRequest,
): TaskPlan {
  const parsed = modelTaskPlanSchema.safeParse(value);
  if (!parsed.success) return fallback;
  const externalEvidenceNeeded = request.includeExternal
    && (parsed.data.externalEvidenceNeeded ?? fallback.externalEvidenceNeeded);
  const knowledgeBaseNeeded = request.includeLibrary
    && (parsed.data.knowledgeBaseNeeded ?? fallback.knowledgeBaseNeeded);
  const requestedStrategy = parsed.data.contentStrategy ?? fallback.contentStrategy;
  const contentStrategy: ContentStrategy = !externalEvidenceNeeded && !knowledgeBaseNeeded
    ? 'user-material'
    : requestedStrategy === 'user-material' ? 'hybrid' : requestedStrategy;
  return {
    ...fallback,
    ...parsed.data,
    // A planner can narrow an enabled source, but it cannot turn on a source
    // that the user explicitly disabled.
    externalEvidenceNeeded,
    knowledgeBaseNeeded,
    contentStrategy,
  };
}

function elementSummary(template: OutputTemplateSnapshot, index: number): string {
  const elements = template.blueprint?.slides[index]?.elements ?? [];
  if (!elements.length) return '';
  const textSlots = elements.filter((element) => element.type === 'text').length;
  const imageSlots = elements.filter((element) => element.type === 'image').length;
  const shapeSlots = elements.filter((element) => element.type === 'shape').length;
  return `; slots=text:${textSlots},image:${imageSlots},shape:${shapeSlots}`;
}

export function templateGenerationContext(template?: OutputTemplateSnapshot): string {
  if (!template) return 'No fixed template. Infer the best structure from the topic and user requirements.';
  const blueprint = template.blueprint;
  const lines = [
    `Template name: ${template.name}`,
    `Template kind: ${template.kind}`,
    'The template is a visual/structural reference only. Never copy its sample subject, company, course, names, labels, example paragraphs or original claims.',
  ];
  if (!blueprint) {
    lines.push('No reliable parsed layout blueprint is available. Infer the structure from the current task and use only the template kind as a generic formatting preference.');
    return lines.join('\n');
  }

  if (blueprint.sections.length) {
    lines.push('Report structure:');
    lines.push(...blueprint.sections.map((section, index) => (
      `${index + 1}. heading=${section.title}; purpose=${section.purpose || 'infer from the user task'}`
    )));
  }
  if (blueprint.slides.length) {
    lines.push(`Presentation structure: ${blueprint.slides.length} pages.`);
    lines.push(...blueprint.slides.map((slide, index) => {
      const structuralRole = slide.purpose || `use the ${slide.layout} layout for the most suitable task content`;
      return `${index + 1}. layout=${slide.layout}; role=${structuralRole}${elementSummary(template, index)}`;
    }));
  }
  lines.push([
    'Style:',
    `tone=${blueprint.style.tone}`,
    `font=${blueprint.style.fontFamily}`,
    `accent=${blueprint.style.accentColor}`,
    blueprint.style.reportWords ? `reportWords≈${blueprint.style.reportWords}` : '',
    blueprint.style.slideCount ? `slideCount≈${blueprint.style.slideCount}` : '',
    blueprint.style.notes ? `notes=${blueprint.style.notes}` : '',
  ].filter(Boolean).join('; '));
  return lines.join('\n');
}
