import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

interface WikipediaPage {
  pageid: number;
  title?: string;
  snippet?: string;
}

function plainText(value: string): string {
  return normalizeWhitespace(value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'));
}

export async function searchWikipedia(
  query: string,
  limit: number,
): Promise<{ papers: Paper[]; warning?: string }> {
  const url = new URL('https://zh.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', String(Math.min(limit, 15)));
  url.searchParams.set('srprop', 'snippet');

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ResearchCopilot/0.1' },
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
    const payload = await response.json() as { query?: { search?: WikipediaPage[] } };
    const papers = (payload.query?.search ?? []).flatMap((page): Paper[] => {
      if (!page.title || !page.snippet) return [];
      return [{
        id: `wikipedia:${page.pageid}`,
        title: normalizeWhitespace(page.title),
        abstract: plainText(page.snippet),
        year: 0,
        authors: [{ name: 'Wikipedia contributors' }],
        citedByCount: 0,
        url: `https://zh.wikipedia.org/?curid=${page.pageid}`,
        topics: ['百科资料'],
        source: 'wikipedia',
        sourceType: 'web',
      }];
    });
    return { papers };
  } catch (error) {
    console.warn('Wikipedia search failed.', error);
    return { papers: [], warning: 'Wikipedia 暂时不可用。' };
  }
}
