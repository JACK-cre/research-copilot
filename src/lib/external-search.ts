import { searchCrossref } from '@/lib/crossref';
import { searchGoogleBooks } from '@/lib/google-books';
import { searchInternetArchive } from '@/lib/internet-archive';
import { searchOpenAlex } from '@/lib/openalex';
import { searchWikipedia } from '@/lib/wikipedia';
import type { Paper, ResearchIntent } from '@/types/research';

export interface ExternalSearchResult {
  papers: Paper[];
  warnings: string[];
}

function normalizedTitle(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function deduplicate(items: Paper[]): Paper[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const doi = item.doi?.toLowerCase().replace(/^https?:\/\/doi\.org\//, '');
    const key = doi ? `doi:${doi}` : `title:${normalizedTitle(item.title)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchExternalSources(input: {
  queries: string[];
  intent: ResearchIntent;
  yearFrom: number;
  limit?: number;
}): Promise<ExternalSearchResult> {
  const primary = input.queries[0];
  const contextual = input.queries[1] ?? primary;
  const [openAlex, crossref, books, archive, wikipedia] = await Promise.all([
    searchOpenAlex(input.intent === 'academic' ? primary : contextual, { yearFrom: input.yearFrom, limit: 25 }),
    searchCrossref(input.intent === 'academic' ? primary : contextual, { yearFrom: input.yearFrom, limit: 18 }),
    input.intent === 'academic'
      ? Promise.resolve({ papers: [] as Paper[], warning: undefined as string | undefined })
      : searchGoogleBooks(primary, input.intent === 'book_review' ? 15 : 8),
    input.intent === 'academic'
      ? Promise.resolve({ papers: [] as Paper[], warning: undefined as string | undefined })
      : searchInternetArchive(primary, input.intent === 'book_review' ? 12 : 6),
    searchWikipedia(input.intent === 'academic' ? contextual : primary, input.intent === 'general' || input.intent === 'book_review' ? 12 : 7),
  ]);
  const ordered = input.intent === 'book_review'
    ? [...books.papers, ...archive.papers, ...wikipedia.papers, ...openAlex.papers, ...crossref.papers]
    : input.intent === 'academic'
      ? [...openAlex.papers, ...crossref.papers, ...wikipedia.papers, ...books.papers, ...archive.papers]
      : [...wikipedia.papers, ...openAlex.papers, ...crossref.papers, ...books.papers, ...archive.papers];
  return {
    papers: deduplicate(ordered).slice(0, input.limit ?? 50),
    warnings: [openAlex.warning, crossref.warning, books.warning, archive.warning, wikipedia.warning]
      .filter((warning): warning is string => Boolean(warning)),
  };
}
