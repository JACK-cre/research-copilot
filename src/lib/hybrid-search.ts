import type { KnowledgeSearchResult } from '@/lib/vector-store';
import { extractRelevanceTerms } from '@/lib/source-relevance';
import { buildRetrievalStrategy, calculateStructureScore, type RetrievalStrategy } from '@/lib/retrieval-strategy';

export function extractKeywordTerms(query: string): string[] {
  return extractRelevanceTerms(query).slice(0, 16);
}

export function calculateKeywordScore(content: string, terms: string[]): number {
  if (!terms.length) return 0;
  const normalized = content.toLowerCase();
  const matched = terms.filter((term) => normalized.includes(term));
  if (!matched.length) return 0;
  const coverage = matched.length / terms.length;
  const specificity = matched.reduce((sum, term) => sum + Math.min(term.length, 12), 0)
    / terms.reduce((sum, term) => sum + Math.min(term.length, 12), 0);
  // BM25-style term frequency saturation: repeated occurrences still help,
  // but long chunks cannot win merely by repeating a keyword many times.
  const lengthNorm = Math.max(0.6, Math.min(1.4, 800 / Math.max(80, content.length)));
  const frequency = matched.reduce((sum, term) => {
    const occurrences = normalized.split(term).length - 1;
    return sum + (occurrences / (occurrences + 1.2));
  }, 0) / Math.max(1, matched.length);
  return Math.min(1, coverage * 0.55 + specificity * 0.25 + frequency * 0.2 * lengthNorm);
}

export function calculateKnowledgeKeywordScore(
  content: string,
  documentName: string,
  terms: string[],
): number {
  const contentScore = calculateKeywordScore(content, terms);
  const titleScore = calculateKeywordScore(documentName, terms);
  const combinedScore = calculateKeywordScore(`${documentName}\n${content}`, terms);
  return Math.min(1, Math.max(contentScore, combinedScore, titleScore * 1.12));
}

export function fuseKnowledgeResults(
  semantic: KnowledgeSearchResult[],
  keyword: KnowledgeSearchResult[],
  limit: number,
  options: { semanticReliable?: boolean; semanticThreshold?: number; keywordThreshold?: number; strategy?: RetrievalStrategy } = {},
): KnowledgeSearchResult[] {
  const semanticReliable = options.semanticReliable ?? true;
  const strategy = options.strategy;
  const semanticThreshold = options.semanticThreshold ?? strategy?.semanticThreshold ?? 0.58;
  const keywordThreshold = options.keywordThreshold ?? strategy?.keywordThreshold ?? 0.16;
  const semanticById = new Map(semantic.map((item) => [item.id, item]));
  const keywordById = new Map(keyword.map((item) => [item.id, item]));
  const ids = new Set([...semanticById.keys(), ...keywordById.keys()]);

  return Array.from(ids).flatMap((id): KnowledgeSearchResult[] => {
    const semanticItem = semanticById.get(id);
    const keywordItem = keywordById.get(id);
    const semanticScore = Math.max(0, Math.min(1, semanticItem?.score ?? 0));
    const keywordScore = Math.max(0, Math.min(1, keywordItem?.score ?? 0));
    const semanticAccepted = semanticReliable && semanticScore >= semanticThreshold;
    const keywordAccepted = keywordScore >= keywordThreshold;
    if (!semanticAccepted && !keywordAccepted) return [];

    const base = semanticItem ?? keywordItem;
    if (!base) return [];
    const structureScore = strategy ? calculateStructureScore(base, strategyQuery(strategy), strategy) : 0;
    const routes: Array<'semantic' | 'keyword'> = [];
    if (semanticAccepted) routes.push('semantic');
    if (keywordAccepted) routes.push('keyword');
    const semanticWeight = strategy?.semanticWeight ?? 0.62;
    const keywordWeight = strategy?.keywordWeight ?? 0.38;
    const structureBoost = strategy ? structureScore * strategy.structureWeight : 0;
    const fusedScore = semanticAccepted && keywordAccepted
      ? Math.min(1, semanticScore * semanticWeight + keywordScore * keywordWeight + 0.2 + structureBoost)
      : semanticAccepted
        ? Math.min(1, semanticScore * semanticWeight + structureBoost)
        : Math.min(1, keywordScore * keywordWeight + (semanticReliable ? semanticScore * (1 - keywordWeight) : 0) + structureBoost);
    return [{
      ...base,
      score: fusedScore,
      fusedScore,
      semanticScore: semanticAccepted ? semanticScore : 0,
      keywordScore: keywordAccepted ? keywordScore : 0,
      structureScore,
      routes,
    }];
  })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function strategyQuery(strategy: RetrievalStrategy): string {
  return strategy.query;
}
