import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

interface GoogleBookVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    categories?: string[];
    infoLink?: string;
    canonicalVolumeLink?: string;
  };
}

export async function searchGoogleBooks(
  query: string,
  limit: number,
): Promise<{ papers: Paper[]; warning?: string }> {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(Math.min(limit, 20)));
  url.searchParams.set('printType', 'books');
  url.searchParams.set('orderBy', 'relevance');
  url.searchParams.set('langRestrict', 'zh');
  if (process.env.GOOGLE_BOOKS_API_KEY) url.searchParams.set('key', process.env.GOOGLE_BOOKS_API_KEY);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`Google Books returned ${response.status}`);
    const payload = await response.json() as { items?: GoogleBookVolume[] };
    const papers = (payload.items ?? []).flatMap((volume): Paper[] => {
      const info = volume.volumeInfo;
      if (!info?.title) return [];
      const title = normalizeWhitespace([info.title, info.subtitle].filter(Boolean).join('：'));
      const year = Number(info.publishedDate?.match(/\d{4}/)?.[0] ?? 0);
      return [{
        id: `google-books:${volume.id}`,
        title,
        abstract: normalizeWhitespace(info.description ?? 'Google Books 暂未提供内容简介。'),
        year,
        authors: (info.authors ?? []).slice(0, 8).map((name) => ({ name })),
        citedByCount: 0,
        url: info.canonicalVolumeLink ?? info.infoLink ?? `https://books.google.com/books?id=${encodeURIComponent(volume.id)}`,
        topics: (info.categories ?? []).slice(0, 4),
        source: 'google-books',
        sourceType: 'book',
      }];
    });
    return { papers };
  } catch (error) {
    console.warn('Google Books search failed.', error);
    return { papers: [], warning: 'Google Books 暂时不可用。' };
  }
}
