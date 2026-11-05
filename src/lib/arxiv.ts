import { describeHttpFailure, fetchText } from '@/lib/http';
import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

function decodeXml(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&'),
  );
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function tags(block: string, name: string): string[] {
  return Array.from(block.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'gi')))
    .map((match) => decodeXml(match[1]))
    .filter(Boolean);
}

export function mapArxivEntry(entry: string): Paper | null {
  const title = tag(entry, 'title');
  const id = tag(entry, 'id');
  if (!title || !id) return null;
  const absId = id.replace(/^https?:\/\/arxiv\.org\/abs\//i, '').replace(/v\d+$/i, '');
  const published = tag(entry, 'published');
  const year = Number(published.slice(0, 4) || 0);
  const authors = tags(entry, 'name').slice(0, 8).map((name) => ({ name }));
  const categories = Array.from(entry.matchAll(/term="([^"]+)"/g)).map((match) => match[1]).slice(0, 4);
  const doi = tag(entry, 'arxiv:doi') || undefined;
  return {
    id: `arxiv:${absId}`,
    title,
    abstract: tag(entry, 'summary') || 'arXiv 暂未提供摘要。',
    year,
    authors,
    citedByCount: 0,
    doi: doi ? `https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, '')}` : undefined,
    url: id,
    pdfUrl: `https://arxiv.org/pdf/${absId}.pdf`,
    topics: categories,
    source: 'arxiv',
    sourceType: 'paper',
  };
}

export async function searchArxiv(
  query: string,
  options: { yearFrom?: number; limit?: number } = {},
): Promise<{ papers: Paper[]; warning?: string }> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', `all:${query}`);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(limit));
  url.searchParams.set('sortBy', 'relevance');
  url.searchParams.set('sortOrder', 'descending');

  try {
    const xml = await fetchText(url, {
      accept: 'application/atom+xml, application/xml, text/xml',
      timeoutMs: 10_000,
    });
    const papers = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g))
      .map((match) => mapArxivEntry(match[1]))
      .filter((paper): paper is Paper => Boolean(paper))
      .filter((paper) => !options.yearFrom || !paper.year || paper.year >= options.yearFrom);
    return { papers };
  } catch (error) {
    console.warn('arXiv search failed.', error);
    return { papers: [], warning: describeHttpFailure('arXiv', error) };
  }
}
