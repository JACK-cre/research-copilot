import type { KnowledgeSearchResult } from '@/lib/vector-store';

export interface RetrievalEvalCase {
  question: string;
  expectedText?: string | null;
  relevantChunkIds?: string[];
  documentName?: string;
  page?: number;
}

export interface RetrievalEvalCaseResult {
  question: string;
  returned: number;
  rank: number | null;
  reciprocalRank: number;
  noAnswer: boolean;
  falsePositive: boolean;
  latencyMs: number;
}

export interface RetrievalEvalSummary {
  total: number;
  answerable: number;
  noAnswer: number;
  hitAt5: number;
  hitAt8: number;
  mrr: number;
  noAnswerFalsePositiveRate: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  cases: RetrievalEvalCaseResult[];
}

function matchesExpected(result: KnowledgeSearchResult, item: RetrievalEvalCase): boolean {
  if (item.relevantChunkIds?.includes(result.id)) return true;
  if (item.documentName && result.documentName !== item.documentName) return false;
  if (item.page && result.page !== item.page) return false;
  return Boolean(item.expectedText && result.content.includes(item.expectedText));
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

export async function evaluateRetrieval(
  cases: RetrievalEvalCase[],
  retrieve: (question: string) => Promise<KnowledgeSearchResult[]>,
): Promise<RetrievalEvalSummary> {
  const results: RetrievalEvalCaseResult[] = [];
  for (const item of cases) {
    const started = performance.now();
    const returned = await retrieve(item.question);
    const latencyMs = Math.round(performance.now() - started);
    const noAnswer = item.expectedText === null && !item.relevantChunkIds?.length;
    const found = noAnswer ? -1 : returned.findIndex((candidate) => matchesExpected(candidate, item));
    const rank = found < 0 ? null : found + 1;
    results.push({
      question: item.question,
      returned: returned.length,
      rank,
      reciprocalRank: rank ? 1 / rank : 0,
      noAnswer,
      falsePositive: noAnswer && returned.length > 0,
      latencyMs,
    });
  }
  const answerable = results.filter((item) => !item.noAnswer);
  const noAnswerCases = results.filter((item) => item.noAnswer);
  const latencies = results.map((item) => item.latencyMs);
  return {
    total: results.length,
    answerable: answerable.length,
    noAnswer: noAnswerCases.length,
    hitAt5: answerable.length ? answerable.filter((item) => (item.rank ?? Infinity) <= 5).length / answerable.length : 0,
    hitAt8: answerable.length ? answerable.filter((item) => (item.rank ?? Infinity) <= 8).length / answerable.length : 0,
    mrr: answerable.length ? answerable.reduce((sum, item) => sum + item.reciprocalRank, 0) / answerable.length : 0,
    noAnswerFalsePositiveRate: noAnswerCases.length ? noAnswerCases.filter((item) => item.falsePositive).length / noAnswerCases.length : 0,
    meanLatencyMs: latencies.length ? latencies.reduce((sum, item) => sum + item, 0) / latencies.length : 0,
    p95LatencyMs: percentile(latencies, 0.95),
    cases: results,
  };
}
