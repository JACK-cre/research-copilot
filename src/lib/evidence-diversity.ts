import type { KnowledgeSearchResult } from '@/lib/vector-store';

function tokenSet(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = normalized.match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,4}/gu) ?? [];
  return new Set(tokens);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

/**
 * Maximal Marginal Relevance: keep high-scoring evidence while avoiding
 * returning near-duplicate passages from the same page or adjacent chunks.
 */
export function diversifyKnowledgeResults(
  candidates: KnowledgeSearchResult[],
  limit: number,
  lambda = 0.78,
): KnowledgeSearchResult[] {
  const remaining = candidates.slice();
  const selected: KnowledgeSearchResult[] = [];
  const tokenCache = new Map(remaining.map((item) => [item.id, tokenSet(item.content)]));
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index];
      const relevance = item.score;
      const redundancy = selected.length
        ? Math.max(...selected.map((picked) => {
          const sameDocumentPenalty = picked.documentId === item.documentId ? 0.08 : 0;
          const samePagePenalty = picked.documentId === item.documentId && picked.page && picked.page === item.page ? 0.16 : 0;
          return jaccard(tokenCache.get(item.id) ?? new Set(), tokenCache.get(picked.id) ?? new Set())
            + sameDocumentPenalty
            + samePagePenalty;
        }))
        : 0;
      const score = lambda * relevance - (1 - lambda) * redundancy;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}
