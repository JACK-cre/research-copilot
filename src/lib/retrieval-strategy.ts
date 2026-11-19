import { extractRelevanceTerms } from '@/lib/source-relevance';
import type { KnowledgeSearchResult } from '@/lib/vector-store';

export type RetrievalSignals = {
  location: boolean;
  procedural: boolean;
  entity: boolean;
  comparative: boolean;
  abstract: boolean;
};

export type RetrievalStrategy = RetrievalSignals & {
  query: string;
  retrievalLimit: number;
  semanticWeight: number;
  keywordWeight: number;
  structureWeight: number;
  semanticThreshold: number;
  keywordThreshold: number;
};

const LOCATION_PATTERN = /第\s*[0-9一二三四五六七八九十百]+\s*(?:章|节|个?实验|页)|(?:chapter|section|page)\s*\d+|实验[一二三四五六七八九十]|(?:图|表)\s*\d+|上一(?:页|节)|本(?:页|节)/iu;
const PROCEDURAL_PATTERN = /步骤|流程|方法|操作|实验|如何做|怎么做|实现|生成来源|依据|条件|输入|输出/iu;
const COMPARATIVE_PATTERN = /区别|差异|比较|对比|关系|关联|异同|优缺点|为什么|为何|是否一样/iu;
const ABSTRACT_PATTERN = /主题|核心思想|主要内容|主要观点|主要贡献|意义|启示|概括|总结|本质|是什么/iu;

function hasEntitySignal(value: string, terms: string[]): boolean {
  const generic = new Set(['这个', '什么', '如何', '为什么', '核心主题', '主要内容', '主要观点']);
  return terms.some(term => !generic.has(term) && (/[a-z0-9]/i.test(term) || term.length >= 4));
}

export function detectRetrievalSignals(query: string): RetrievalSignals {
  const normalized = query.trim();
  const terms = extractRelevanceTerms(normalized);
  return {
    location: LOCATION_PATTERN.test(normalized),
    procedural: PROCEDURAL_PATTERN.test(normalized),
    entity: hasEntitySignal(normalized, terms),
    comparative: COMPARATIVE_PATTERN.test(normalized),
    abstract: ABSTRACT_PATTERN.test(normalized),
  };
}

export function buildRetrievalQueries(query: string, keywordQuery = ''): string[] {
  const original = query.trim();
  const normalized = keywordQuery.trim() || original;
  const queries = [original, normalized];
  const relation = normalized.match(/^(.+?)\s*(?:和|与|跟|同)\s*(.+?)\s*(?:有什么区别|有何区别|有什么差异|的关系|关系|对比|比较)/u);
  if (relation) {
    queries.push(relation[1], relation[2], `${relation[1]} ${relation[2]} 关系 区别`);
  }
  const signals = detectRetrievalSignals(normalized);
  if (signals.location || signals.procedural) {
    const terms = extractRelevanceTerms(normalized).slice(0, 8).join(' ');
    if (terms && terms !== normalized) queries.push(terms);
  }
  return Array.from(new Set(queries.map(item => item.replace(/\s+/g, ' ').trim()).filter(item => item.length >= 2))).slice(0, 4);
}

export function buildRetrievalStrategy(query: string, keywordQuery = ''): RetrievalStrategy {
  const signals = detectRetrievalSignals(`${query} ${keywordQuery}`.trim());
  let semanticWeight = 0.62;
  let keywordWeight = 0.38;
  let structureWeight = 0.08;

  // These are bounded nudges, not hard routes. Every query still uses both paths.
  if (signals.abstract || signals.comparative) {
    semanticWeight += 0.08;
    keywordWeight -= 0.08;
  }
  if (signals.location || signals.procedural || signals.entity) {
    semanticWeight -= 0.07;
    keywordWeight += 0.07;
    structureWeight += 0.04;
  }
  if (signals.location) structureWeight += 0.04;
  const retrievalLimit = signals.comparative || signals.location
    ? 40
    : (signals.procedural && (signals.entity || signals.location || query.trim().length >= 10)) || (signals.abstract && signals.entity && query.trim().length >= 8)
      ? 32
      : 24;

  return {
    query,
    retrievalLimit,
    ...signals,
    semanticWeight,
    keywordWeight,
    structureWeight: Math.min(0.18, structureWeight),
    // Keep early recall permissive. Strict rejection remains the reranker's job.
    semanticThreshold: signals.abstract ? 0.54 : 0.52,
    keywordThreshold: signals.location || signals.procedural ? 0.10 : 0.12,
  };
}

export function calculateStructureScore(
  candidate: Pick<KnowledgeSearchResult, 'documentName' | 'section' | 'page' | 'chunkIndex'>,
  query: string,
  signals = detectRetrievalSignals(query),
): number {
  if (!signals.location && !signals.procedural) return 0;
  const terms = extractRelevanceTerms(query);
  const metadata = `${candidate.documentName} ${candidate.section ?? ''}`.toLowerCase();
  const metadataHits = terms.filter(term => metadata.includes(term)).length;
  let score = candidate.section ? 0.25 : 0;
  if (candidate.page != null) score += signals.location ? 0.35 : 0.1;
  if (candidate.chunkIndex != null) score += 0.2;
  if (metadataHits) score += Math.min(0.25, metadataHits * 0.08);
  return Math.min(1, score);
}
