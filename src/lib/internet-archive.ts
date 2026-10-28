import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

interface ArchiveDocument {
  identifier?: string;
  title?: string;
  creator?: string | string[];
  date?: string;
  description?: string | string[];
  subject?: string | string[];
}

function list(value?: string | string[]): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export async function searchInternetArchive(
  query: string,
  limit: number,
): Promise<{ papers: Paper[]; warning?: string }> {
  const url = new URL('https://archive.org/advancedsearch.php');
  url.searchParams.set('q', `(${query}) AND mediatype:texts`);
  ['identifier', 'title', 'creator', 'date', 'description', 'subject'].forEach((field) => {
    url.searchParams.append('fl[]', field);
  });
  url.searchParams.set('rows', String(Math.min(limit, 20)));
  url.searchParams.set('page', '1');
  url.searchParams.set('output', 'json');

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`Internet Archive returned ${response.status}`);
    const payload = await response.json() as { response?: { docs?: ArchiveDocument[] } };
    const papers = (payload.response?.docs ?? []).flatMap((document): Paper[] => {
      if (!document.identifier || !document.title) return [];
      const description = list(document.description).join(' ');
      return [{
        id: `internet-archive:${document.identifier}`,
        title: normalizeWhitespace(document.title),
        abstract: normalizeWhitespace(description || 'Internet Archive 暂未提供内容简介。'),
        year: Number(document.date?.match(/\d{4}/)?.[0] ?? 0),
        authors: list(document.creator).slice(0, 8).map((name) => ({ name: normalizeWhitespace(name) })),
        citedByCount: 0,
        url: `https://archive.org/details/${encodeURIComponent(document.identifier)}`,
        topics: list(document.subject).slice(0, 4).map(normalizeWhitespace),
        source: 'internet-archive',
        sourceType: 'book',
      }];
    });
    return { papers };
  } catch (error) {
    console.warn('Internet Archive search failed.', error);
    return { papers: [], warning: 'Internet Archive 暂时不可用。' };
  }
}
