import type { KnowledgeSearchResult } from '@/lib/vector-store';

export function extractKeywordTerms(query: string): string[] {
  const normalized = query.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, ' ').trim();
  const terms = normalized.match(/[a-z0-9][a-z0-9-]{1,}|[\p{Script=Han}]{2,}/gu) ?? [];
  const expanded: string[] = [];
  for (const term of terms) {
    if (/^[\p{Script=Han}]+$/u.test(term) && term.length > 4) {
      for (let index = 0; index < term.length - 1; index += 2) {
        expanded.push(term.slice(index, Math.min(index + 4, term.length)));
      }
    } else {
      expanded.push(term);
    }
  }
  return Array.from(new Set(expanded.filter((term) => term.length >= 2))).slice(0, 12);
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
): KnowledgeSearchResult[] {
  const candidates = new Map<string, KnowledgeSearchResult & { fused: number; peak: number }>();
  const add = (items: KnowledgeSearchResult[], weight: number, route: 'semantic' | 'keyword') => {
    items.forEach((item, index) => {
      const current = candidates.get(item.id) ?? { ...item, routes: [], fused: 0, peak: 0 };
      current.fused += weight / (60 + index + 1);
      current.peak = Math.max(current.peak, item.score);
      current.routes = Array.from(new Set([...(current.routes ?? []), route]));
      candidates.set(item.id, current);
    });
  };
  add(semantic, 0.65, 'semantic');
  add(keyword, 0.35, 'keyword');
  const maximum = 1 / 61;
  return Array.from(candidates.values())
    .map(({ fused, peak, ...item }) => ({ ...item, score: Math.min(1, (fused / maximum) * 0.85 + peak * 0.15) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
