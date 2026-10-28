import type { ResearchIntent, ResearchRequest } from '@/types/research';

const BOOK_REVIEW_PATTERN = /读后感|书评|阅读报告|读书笔记|作品赏析|作品分析|名著阅读|观后感/i;
const ACADEMIC_PATTERN = /论文|文献综述|研究综述|学术|实验|算法|模型|技术方案|架构|survey|review|research|benchmark/i;
const TASK_WORDS = /(?:读后感|书评|阅读报告|读书笔记|作品赏析|作品分析|研究综述|文献综述|论文|报告|汇报|PPT|ppt)+/gi;

export interface SearchPlan {
  intent: ResearchIntent;
  coreTopic: string;
  queries: string[];
}

export function detectResearchIntent(request: Pick<ResearchRequest, 'topic' | 'requirements' | 'audience'>): ResearchIntent {
  const text = `${request.topic} ${request.requirements}`;
  if (BOOK_REVIEW_PATTERN.test(text)) return 'book_review';
  if (request.audience === 'academic' || ACADEMIC_PATTERN.test(text)) return 'academic';
  return 'general';
}

function cleanCoreTopic(topic: string): string {
  const quoted = topic.match(/[《“"]([^》”"]{2,80})[》”"]/)?.[1];
  if (quoted) return quoted.trim();
  const cleaned = topic
    .replace(TASK_WORDS, ' ')
    .replace(/[：:———\-_|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || topic.trim();
}

export function buildSearchPlan(request: ResearchRequest): SearchPlan {
  const intent = detectResearchIntent(request);
  const coreTopic = cleanCoreTopic(request.topic);
  const requirements = request.requirements.trim();
  const queries = intent === 'book_review'
    ? [
      coreTopic,
      `${coreTopic} 作者 内容简介 主题 背景`,
      `${coreTopic} 作品评价 书评${requirements ? ` ${requirements}` : ''}`,
    ]
    : intent === 'academic'
      ? [
        coreTopic,
        `${coreTopic} research review`,
        requirements ? `${coreTopic} ${requirements}` : `${coreTopic} survey evidence`,
      ]
      : [
        coreTopic,
        `${coreTopic} 背景 事实 权威资料`,
        requirements ? `${coreTopic} ${requirements}` : `${coreTopic} 分析 观点`,
      ];

  return { intent, coreTopic, queries: Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean))) };
}
