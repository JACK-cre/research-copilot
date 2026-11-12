import { describe, expect, it } from 'vitest';

import { applyModelTaskPlan, buildTaskPlan, templateGenerationContext } from '@/lib/task-plan';
import type { OutputTemplateSnapshot } from '@/types/platform';
import type { ResearchRequest } from '@/types/research';

const internshipRequest: ResearchRequest = {
  topic: '实习生转正答辩',
  requirements: '我在电商搜索团队从事 Java 后端开发，5-6 月完成诊断与评测平台，6-8 月负责商品卡与搜索首页改造，后续完成发券、图搜 Agent 和导流项目。希望生成一份突出个人职责、技术难点和成长的 PPTX。',
  deliverable: 'auto',
  audience: 'auto',
  yearFrom: 2020,
  paperCount: 8,
  includeExternal: true,
  includeLibrary: true,
};

describe('dynamic task planning', () => {
  it('treats a detailed internship defense as first-party material instead of mandatory research', () => {
    const plan = buildTaskPlan(internshipRequest, { kind: 'presentation' } as OutputTemplateSnapshot);

    expect(plan.outputEmphasis).toBe('presentation');
    expect(plan.contentStrategy).toBe('user-material');
    expect(plan.externalEvidenceNeeded).toBe(false);
    expect(plan.knowledgeBaseNeeded).toBe(false);
    expect(plan.audienceGuidance).toContain('答辩评审');
  });

  it('keeps academic source-backed tasks on the evidence route', () => {
    const plan = buildTaskPlan({
      ...internshipRequest,
      topic: 'RAG 多路召回方法研究综述',
      requirements: '检索近五年论文，比较实验结果并给出参考文献。',
    });

    expect(plan.contentStrategy).toBe('evidence');
    expect(plan.externalEvidenceNeeded).toBe(true);
    expect(plan.outputEmphasis).toBe('report');
  });

  it('never lets the model planner enable a source disabled by the user', () => {
    const request = { ...internshipRequest, includeExternal: false, includeLibrary: false };
    const fallback = buildTaskPlan(request);
    const plan = applyModelTaskPlan({
      externalEvidenceNeeded: true,
      knowledgeBaseNeeded: true,
      narrativeGuidance: ['按项目组织内容。'],
    }, fallback, request);

    expect(plan.externalEvidenceNeeded).toBe(false);
    expect(plan.knowledgeBaseNeeded).toBe(false);
  });
});

describe('template generation context', () => {
  it('passes page roles and slots without copying uploaded slide sample text', () => {
    const template: OutputTemplateSnapshot = {
      id: 'template-1',
      name: '实习答辩模板',
      kind: 'presentation',
      description: '',
      citationStyle: '按模板规则',
      instructions: '旧说明中含有示例公司内容',
      isDefault: false,
      blueprint: {
        sections: [],
        slides: [{
          id: 'slide-1',
          title: '《企业实习》实习周记',
          purpose: '封面，突出本次任务主题',
          layout: 'title',
          source: 'uploaded-pptx',
          elements: [
            { id: 'text-1', type: 'text', x: 10, y: 10, width: 100, height: 20, text: '某公司实习', zIndex: 1 },
            { id: 'image-1', type: 'image', x: 10, y: 40, width: 100, height: 80, zIndex: 0 },
          ],
        }],
        style: {
          citationStyle: '按模板规则',
          headingScheme: 'plain',
          tone: '专业',
          accentColor: '#0f766e',
          fontFamily: '系统默认',
        },
      },
    };

    const context = templateGenerationContext(template);
    expect(context).toContain('layout=title');
    expect(context).toContain('slots=text:1,image:1');
    expect(context).not.toContain('《企业实习》实习周记');
    expect(context).not.toContain('某公司实习');
    expect(context).not.toContain('旧说明中含有示例公司内容');
  });

  it('does not forward unparsed template instructions that may contain sample content', () => {
    const context = templateGenerationContext({
      id: 'legacy-template',
      name: '旧模板',
      kind: 'presentation',
      description: '',
      citationStyle: '',
      instructions: '照抄某公司的业务总结与示例结论',
      isDefault: false,
    });

    expect(context).not.toContain('某公司');
    expect(context).toContain('No reliable parsed layout blueprint');
  });
});
