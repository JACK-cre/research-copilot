import { describeHttpFailure, fetchJson } from '@/lib/http';
import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  url?: string;
  venue?: string;
  authors?: Array<{ name?: string }>;
  externalIds?: { DOI?: string };
}

export function mapSemanticScholarPaper(work: SemanticScholarPaper): Paper | null {
  const title = normalizeWhitespace(work.title ?? '');
  if (!title || !work.paperId) return null;
  const doi = work.externalIds?.DOI
    ? `https://doi.org/${work.externalIds.DOI.replace(/^https?:\/\/doi\.org\//, '')}`
    : undefined;
  return {
    id: doi ?? `semantic-scholar:${work.paperId}`,
    title,
    abstract: normalizeWhitespace(work.abstract || 'Semantic Scholar 暂未提供摘要。'),
    year: work.year ?? 0,
    authors: (work.authors ?? [])
      .map((author) => author.name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 8)
      .map((name) => ({ name })),
    citedByCount: work.citationCount ?? 0,
    doi,
    url: work.url || doi || `https://www.semanticscholar.org/paper/${work.paperId}`,
    topics: [work.venue].filter((item): item is string => Boolean(item)).slice(0, 4),
    source: 'semantic-scholar',
    sourceType: 'paper',
  };
}

export async function searchSemanticScholar(
  query: string,
  options: { yearFrom: number; limit: number },
): Promise<{ papers: Paper[]; warning?: string }> {
  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(Math.min(options.limit, 20)));
  url.searchParams.set('fields', 'title,abstract,year,authors,citationCount,url,venue,externalIds');
  if (options.yearFrom > 1900) {
    url.searchParams.set('year', `${options.yearFrom}-`);
  }
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();

  try {
    const payload = await fetchJson<{ data?: SemanticScholarPaper[] }>(url, {
      timeoutMs: 10_000,
      retries: apiKey ? 1 : 0,
      headers: apiKey ? { 'x-api-key': apiKey } : undefined,
    });
    return {
      papers: (payload.data ?? [])
        .map(mapSemanticScholarPaper)
        .filter((paper): paper is Paper => Boolean(paper)),
    };
  } catch (error) {
    console.warn('Semantic Scholar search failed.', error);
    return { papers: [], warning: describeHttpFailure('Semantic Scholar', error) };
  }
}
