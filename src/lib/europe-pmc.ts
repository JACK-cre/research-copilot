import { describeHttpFailure, fetchJson } from '@/lib/http';
import { normalizeWhitespace } from '@/lib/text';
import type { Paper } from '@/types/research';

interface EuropePmcWork {
  id?: string;
  source?: string;
  doi?: string;
  title?: string;
  abstractText?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string | number;
  firstPublicationDate?: string;
  citedByCount?: number;
  pmcid?: string;
  journalInfo?: { yearOfPublication?: number };
}

function yearOf(work: EuropePmcWork): number {
  return Number(
    work.pubYear
    || work.journalInfo?.yearOfPublication
    || work.firstPublicationDate?.match(/\d{4}/)?.[0]
    || 0,
  );
}

export function mapEuropePmcWork(work: EuropePmcWork): Paper | null {
  const title = normalizeWhitespace(work.title ?? '');
  if (!title || !work.id) return null;
  const doi = work.doi ? `https://doi.org/${work.doi.replace(/^https?:\/\/doi\.org\//, '')}` : undefined;
  const source = work.source || 'MED';
  return {
    id: doi ?? `europe-pmc:${source}:${work.id}`,
    title,
    abstract: normalizeWhitespace(
      work.abstractText
      || (work.journalTitle ? `${work.journalTitle} 上的公开文献。` : 'Europe PMC 暂未提供摘要。'),
    ),
    year: yearOf(work),
    authors: (work.authorString ?? '')
      .split(',')
      .map((name) => normalizeWhitespace(name))
      .filter(Boolean)
      .slice(0, 8)
      .map((name) => ({ name })),
    citedByCount: work.citedByCount ?? 0,
    doi,
    url: doi ?? `https://europepmc.org/article/${source}/${work.id}`,
    topics: [work.journalTitle].filter((item): item is string => Boolean(item)).slice(0, 4),
    source: 'europe-pmc',
    sourceType: 'paper',
  };
}

export async function searchEuropePmc(
  query: string,
  options: { yearFrom: number; limit: number },
): Promise<{ papers: Paper[]; warning?: string }> {
  const clauses = [`(${query})`];
  if (options.yearFrom > 1900) clauses.push(`PUB_YEAR:[${options.yearFrom} TO 2100]`);
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.searchParams.set('query', clauses.join(' AND '));
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageSize', String(Math.min(options.limit, 20)));
  url.searchParams.set('resultType', 'lite');

  try {
    const payload = await fetchJson<{ resultList?: { result?: EuropePmcWork[] } }>(url);
    return {
      papers: (payload.resultList?.result ?? [])
        .map(mapEuropePmcWork)
        .filter((paper): paper is Paper => Boolean(paper)),
    };
  } catch (error) {
    console.warn('Europe PMC search failed.', error);
    return { papers: [], warning: describeHttpFailure('Europe PMC', error) };
  }
}
