import { describeHttpFailure, fetchJson } from '@/lib/http';
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

async function searchWikipediaEdition(
  lang: 'zh' | 'en',
  query: string,
  limit: number,
): Promise<Paper[]> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', String(Math.min(limit, 15)));
  url.searchParams.set('srprop', 'snippet');
  url.searchParams.set('origin', '*');

  const payload = await fetchJson<{ query?: { search?: WikipediaPage[] } }>(url, { timeoutMs: 8_000 });
  return (payload.query?.search ?? []).flatMap((page): Paper[] => {
    if (!page.title) return [];
    const abstract = plainText(page.snippet ?? '');
    if (!abstract) return [];
    return [{
      id: `wikipedia:${lang}:${page.pageid}`,
      title: normalizeWhitespace(page.title),
      abstract,
      year: 0,
      authors: [{ name: 'Wikipedia contributors' }],
      citedByCount: 0,
      url: `https://${lang}.wikipedia.org/?curid=${page.pageid}`,
      topics: ['百科资料'],
      source: 'wikipedia',
      sourceType: 'web',
    }];
  });
}

export async function searchWikipedia(
  query: string,
  limit: number,
): Promise<{ papers: Paper[]; warning?: string }> {
  try {
    const zh = await searchWikipediaEdition('zh', query, limit);
    if (zh.length) return { papers: zh };
    const en = await searchWikipediaEdition('en', query, limit);
    return { papers: en };
  } catch (error) {
    try {
      const en = await searchWikipediaEdition('en', query, limit);
      if (en.length) return { papers: en };
    } catch {
      // Both editions failed; fall through to the original error.
    }
    console.warn('Wikipedia search failed.', error);
    return { papers: [], warning: describeHttpFailure('Wikipedia', error) };
  }
}
