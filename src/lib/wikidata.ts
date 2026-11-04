import { describeHttpFailure, fetchJson } from '@/lib/http';
import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

interface WikidataSearchItem {
  id?: string;
  label?: string;
  description?: string;
  concepturi?: string;
  url?: string;
}

function absoluteUrl(value?: string, fallbackId?: string): string {
  if (value?.startsWith('http')) return value;
  if (value?.startsWith('//')) return `https:${value}`;
  return fallbackId ? `https://www.wikidata.org/wiki/${fallbackId}` : '';
}

export function mapWikidataItem(item: WikidataSearchItem): Paper | null {
  if (!item.id || !item.label) return null;
  const url = absoluteUrl(item.concepturi || item.url, item.id);
  if (!url) return null;
  return {
    id: `wikidata:${item.id}`,
    title: normalizeWhitespace(item.label),
    abstract: normalizeWhitespace(item.description || 'Wikidata 暂无简介。'),
    year: 0,
    authors: [{ name: 'Wikidata' }],
    citedByCount: 0,
    url,
    topics: ['百科资料'],
    source: 'wikidata',
    sourceType: 'web',
  };
}

export async function searchWikidata(
  query: string,
  limit: number,
): Promise<{ papers: Paper[]; warning?: string }> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('search', query);
  url.searchParams.set('language', 'zh');
  url.searchParams.set('uselang', 'zh');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(Math.min(limit, 8)));

  try {
    const payload = await fetchJson<{ search?: WikidataSearchItem[] }>(url, { timeoutMs: 8_000 });
    return {
      papers: (payload.search ?? []).map(mapWikidataItem).filter((paper): paper is Paper => Boolean(paper)),
    };
  } catch (error) {
    console.warn('Wikidata search failed.', error);
    return { papers: [], warning: describeHttpFailure('Wikidata', error) };
  }
}
