import type { KnowledgeSearchResult } from '@/lib/vector-store';
import { extractRelevanceTerms } from '@/lib/source-relevance';

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
  return Math.min(1, coverage * 0.65 + specificity * 0.35);
}

export function fuseKnowledgeResults(
  semantic: KnowledgeSearchResult[],
  keyword: KnowledgeSearchResult[],
  limit: number,
  options: { semanticReliable?: boolean; semanticThreshold?: number; keywordThreshold?: number } = {},
): KnowledgeSearchResult[] {
  const semanticReliable = options.semanticReliable ?? true;
  const semanticThreshold = options.semanticThreshold ?? 0.58;
  const keywordThreshold = options.keywordThreshold ?? 0.16;
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
    const routes: Array<'semantic' | 'keyword'> = [];
    if (semanticAccepted) routes.push('semantic');
    if (keywordAccepted) routes.push('keyword');
    const score = semanticAccepted && keywordAccepted
      ? Math.min(1, semanticScore * 0.62 + keywordScore * 0.38 + 0.2)
      : semanticAccepted
        ? semanticScore
        : Math.min(1, keywordScore * 0.9 + (semanticReliable ? semanticScore * 0.1 : 0));
    return [{ ...base, score, routes }];
  })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
