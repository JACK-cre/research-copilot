import { isZhipuBaseUrl } from '@/lib/embedding-dimensions';
import { describeHttpFailure, fetchJson } from '@/lib/http';
import { normalizeWhitespace } from '@/lib/text';
import type { AiRuntimeConfig } from '@/types/platform';
import type { Paper } from '@/types/research';

interface ZhipuWebSearchItem {
  title?: string;
  content?: string;
  link?: string;
  media?: string;
  publish_date?: string;
}

function mapWebResult(item: ZhipuWebSearchItem): Paper | null {
  const title = normalizeWhitespace(item.title ?? '');
  const url = item.link?.trim();
  if (!title || !url) return null;
  return {
    id: `web-search:${url}`,
    title,
    abstract: normalizeWhitespace(item.content || '网页搜索暂未提供摘要。'),
    year: Number(item.publish_date?.match(/\d{4}/)?.[0] ?? 0),
    authors: [{ name: normalizeWhitespace(item.media || '网页搜索') }],
    citedByCount: 0,
    url,
    topics: [item.media, '网页资料'].filter((value): value is string => Boolean(value)).slice(0, 4),
    source: 'web-search',
    sourceType: 'web',
  };
}

export function canUseZhipuWebSearch(ai?: Pick<AiRuntimeConfig, 'apiKey' | 'baseURL'>): boolean {
  return Boolean(ai?.apiKey && ai.baseURL && isZhipuBaseUrl(ai.baseURL));
}

export async function searchZhipuWeb(
  query: string,
  ai: Pick<AiRuntimeConfig, 'apiKey' | 'baseURL'> | undefined,
  limit: number,
): Promise<{ papers: Paper[]; warning?: string }> {
  if (!canUseZhipuWebSearch(ai) || !ai?.apiKey) return { papers: [] };
  const searchQuery = query.replace(/\s+/g, ' ').trim().slice(0, 70);
  if (searchQuery.length < 2) return { papers: [] };
  const endpoint = `${ai.baseURL.replace(/\/+$/, '')}/web_search`;

  try {
    const payload = await fetchJson<{ search_result?: ZhipuWebSearchItem[] }>(endpoint, {
      method: 'POST',
      timeoutMs: 12_000,
      headers: { Authorization: `Bearer ${ai.apiKey}` },
      body: {
        search_query: searchQuery,
        search_engine: 'search_std',
        search_intent: false,
        count: Math.min(Math.max(limit, 1), 10),
        content_size: 'medium',
      },
    });
    return {
      papers: (payload.search_result ?? [])
        .map(mapWebResult)
        .filter((paper): paper is Paper => Boolean(paper)),
    };
  } catch (error) {
    console.warn('Zhipu web search failed.', error);
    return { papers: [], warning: describeHttpFailure('网页搜索', error) };
  }
}
