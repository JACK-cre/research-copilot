import { describeHttpFailure, fetchJson } from '@/lib/http';
import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

export interface BaiduBaikeCard {
  name?: string;
  value?: string | string[];
}

export interface BaiduBaikePayload {
  id?: number | string;
  title?: string;
  desc?: string;
  abstract?: string;
  url?: string;
  card?: BaiduBaikeCard[];
}

function plainText(value: string): string {
  return normalizeWhitespace(value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'));
}

function cardText(card: BaiduBaikeCard): string {
  const raw = Array.isArray(card.value) ? card.value.join('、') : String(card.value ?? '');
  const value = plainText(raw);
  if (!card.name || !value) return '';
  return `${plainText(card.name)}：${value}`;
}

export function mapBaiduBaikeLemma(payload: BaiduBaikePayload): Paper | null {
  if (!payload.title || !payload.abstract) return null;
  const facts = (payload.card ?? []).slice(0, 8).map(cardText).filter(Boolean);
  const yearMatch = facts.join(' ').match(/(?:1[89]|20)\d{2}/);
  const url = payload.url
    ? payload.url.replace(/^http:\/\//, 'https://')
    : `https://baike.baidu.com/item/${encodeURIComponent(payload.title)}`;
  return {
    id: `baidu-baike:${payload.id ?? payload.title}`,
    title: normalizeWhitespace(payload.title),
    abstract: [payload.desc, plainText(payload.abstract), ...facts].filter(Boolean).join(' '),
    year: yearMatch ? Number(yearMatch[0]) : 0,
    authors: [{ name: '百度百科' }],
    citedByCount: 0,
    url,
    topics: [payload.desc, '百科资料'].filter((item): item is string => Boolean(item)).slice(0, 4),
    source: 'baidu-baike',
    sourceType: 'web',
  };
}

export async function searchBaiduBaike(
  query: string,
): Promise<{ papers: Paper[]; warning?: string }> {
  const url = new URL('https://baike.baidu.com/api/openapi/BaikeLemmaCardApi');
  url.searchParams.set('scope', '103');
  url.searchParams.set('format', 'json');
  url.searchParams.set('appid', '379020');
  url.searchParams.set('bk_key', query.trim().slice(0, 80));

  try {
    const payload = await fetchJson<BaiduBaikePayload>(url, { timeoutMs: 8_000 });
    const paper = mapBaiduBaikeLemma(payload);
    return { papers: paper ? [paper] : [] };
  } catch (error) {
    console.warn('Baidu Baike search failed.', error);
    return { papers: [], warning: describeHttpFailure('百度百科', error) };
  }
}
