import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

interface CrossrefWork {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  published?: { 'date-parts'?: number[][] };
  author?: Array<{ given?: string; family?: string }>;
  'is-referenced-by-count'?: number;
  subject?: string[];
}

function plainText(value: string): string {
  return normalizeWhitespace(value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'"));
}

export async function searchCrossref(
  query: string,
  options: { yearFrom: number; limit: number },
): Promise<{ papers: Paper[]; warning?: string }> {
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query.bibliographic', query);
  url.searchParams.set('filter', `from-pub-date:${options.yearFrom}-01-01`);
  url.searchParams.set('rows', String(Math.min(options.limit, 30)));
  url.searchParams.set('select', 'DOI,title,abstract,published,author,URL,is-referenced-by-count,subject');
  if (process.env.OPENALEX_MAILTO) url.searchParams.set('mailto', process.env.OPENALEX_MAILTO);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ResearchCopilot/0.1' },
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
    const payload = await response.json() as { message?: { items?: CrossrefWork[] } };
    const papers = (payload.message?.items ?? []).flatMap((work): Paper[] => {
      const title = plainText(work.title?.[0] ?? '');
      if (!title) return [];
      const doi = work.DOI ? `https://doi.org/${work.DOI}` : undefined;
      return [{
        id: doi ?? work.URL ?? `crossref:${title}`,
        title,
        abstract: work.abstract ? plainText(work.abstract) : 'Crossref 暂未提供该论文摘要。',
        year: work.published?.['date-parts']?.[0]?.[0] ?? 0,
        authors: (work.author ?? []).slice(0, 8).map((author) => ({
          name: normalizeWhitespace([author.given, author.family].filter(Boolean).join(' ')),
        })).filter((author) => Boolean(author.name)),
        citedByCount: work['is-referenced-by-count'] ?? 0,
        doi,
        url: work.URL ?? doi ?? '',
        topics: (work.subject ?? []).slice(0, 4),
        source: 'crossref',
        sourceType: 'paper',
      }];
    });
    return { papers };
  } catch (error) {
    console.warn('Crossref search failed.', error);
    return { papers: [], warning: 'Crossref 暂时不可用。' };
  }
}
