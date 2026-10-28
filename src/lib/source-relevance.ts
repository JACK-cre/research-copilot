import type { Paper, ResearchIntent, ResearchRequest } from '@/types/research';

const STOP_WORDS = new Set([
  '以及', '一个', '一种', '关于', '进行', '基于', '如何', '什么', '研究', '分析', '报告', '论文',
  '读后感', '书评', '阅读', '内容', '要求', '生成', 'the', 'and', 'with', 'from', 'using', 'review',
]);

export function extractRelevanceTerms(value: string): string[] {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, ' ').trim();
  const segments = normalized.match(/[a-z0-9][a-z0-9-]{1,}|[\p{Script=Han}]{2,}/gu) ?? [];
  const terms: string[] = [];
  for (const segment of segments) {
    if (STOP_WORDS.has(segment)) continue;
    if (/^[\p{Script=Han}]+$/u.test(segment)) {
      if (segment.length <= 8) terms.push(segment);
      if (segment.length > 2) {
        for (let index = 0; index < segment.length - 1; index += 1) {
          terms.push(segment.slice(index, index + Math.min(3, segment.length - index)));
        }
      }
    } else {
      terms.push(segment);
    }
  }
  return Array.from(new Set(terms.filter((term) => term.length >= 2 && !STOP_WORDS.has(term)))).slice(0, 24);
}

function coverage(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const normalized = text.toLowerCase();
  const matched = terms.filter((term) => normalized.includes(term));
  return matched.length / terms.length;
}

export function scoreSourceLexically(
  source: Paper,
  request: Pick<ResearchRequest, 'topic' | 'requirements'>,
  intent: ResearchIntent,
  coreTopic?: string,
): number {
  const core = (coreTopic ?? request.topic).toLowerCase().trim();
  const coreTerms = extractRelevanceTerms(core);
  const supportTerms = extractRelevanceTerms(request.requirements).slice(0, 12);
  const title = source.title.toLowerCase();
  const body = `${source.abstract} ${source.topics.join(' ')}`.toLowerCase();
  const exactTitle = core.length >= 2 && title.includes(core) ? 1 : 0;
  const exactBody = core.length >= 2 && body.includes(core) ? 1 : 0;
  const titleCoverage = coverage(title, coreTerms);
  const bodyCoverage = coverage(body, coreTerms);
  const supportCoverage = coverage(`${title} ${body}`, supportTerms);
  const typeFit = intent === 'book_review'
    ? source.sourceType === 'book' ? 1 : source.sourceType === 'web' ? 0.72 : 0.35
    : intent === 'academic'
      ? source.sourceType === 'paper' ? 1 : 0.45
      : source.sourceType === 'web' ? 1 : 0.75;

  let score = exactTitle * 0.42
    + exactBody * 0.13
    + titleCoverage * 0.24
    + bodyCoverage * 0.11
    + supportCoverage * 0.05
    + typeFit * 0.05;

  const hasCoreMatch = exactTitle > 0 || exactBody > 0 || titleCoverage >= 0.2 || bodyCoverage >= 0.2;
  if (!hasCoreMatch) score *= 0.12;
  return Math.max(0, Math.min(1, score));
}

export function prefilterSources(
  sources: Paper[],
  request: ResearchRequest,
  intent: ResearchIntent,
  coreTopic: string,
  limit = 30,
): Paper[] {
  return sources
    .map((source) => ({ ...source, relevanceScore: scoreSourceLexically(source, request, intent, coreTopic) }))
    .filter((source) => (source.relevanceScore ?? 0) >= 0.08)
    .sort((left, right) => (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0))
    .slice(0, limit);
}
