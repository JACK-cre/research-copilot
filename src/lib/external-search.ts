import { searchBaiduBaike } from '@/lib/baidu-baike';
import { searchCrossref } from '@/lib/crossref';
import { searchEuropePmc } from '@/lib/europe-pmc';
import { searchGoogleBooks } from '@/lib/google-books';
import { searchInternetArchive } from '@/lib/internet-archive';
import { searchArxiv } from '@/lib/arxiv';
import { searchOpenAlex } from '@/lib/openalex';
import { searchSemanticScholar } from '@/lib/semantic-scholar';
import { searchWikidata } from '@/lib/wikidata';
import { searchWikipedia } from '@/lib/wikipedia';
import { searchZhipuWeb } from '@/lib/web-search';
import type { AiRuntimeConfig } from '@/types/platform';
import type { Paper, ResearchIntent } from '@/types/research';

export interface ExternalSearchResult {
  papers: Paper[];
  warnings: string[];
}

interface ProviderResult {
  papers: Paper[];
  warning?: string;
}

const emptyResult: ProviderResult = { papers: [] };
const OVERSEAS_WARNING_PATTERN = /Wikipedia|Internet Archive|Google Books/;

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

export function resolveAcademicYearFrom(intent: ResearchIntent, yearFrom: number): number {
  return intent === 'book_review' ? Math.min(yearFrom, 1900) : yearFrom;
}

export function cnkiLimitationWarning(topic: string): string {
  const encoded = encodeURIComponent(topic.trim());
  return `知网、万方、维普和百度学术没有开放检索接口，无法直接抓取论文全文。已改用 OpenAlex、Crossref、Semantic Scholar、Europe PMC、arXiv 等公开学术索引；如需知网原文可打开 https://kns.cnki.net/kns8s/defaultresult/index?kw=${encoded} 继续检索。`;
}

export function compactExternalWarnings(warnings: string[], papers: Paper[]): string[] {
  const unique = Array.from(new Set(warnings.filter(Boolean)));
  const hasDomestic = papers.some((paper) => (
    paper.source === 'baidu-baike' || paper.source === 'web-search' || paper.source === 'wikidata'
  ));
  if (!hasDomestic) return unique;
  const remaining = unique.filter((warning) => !OVERSEAS_WARNING_PATTERN.test(warning));
  if (remaining.length === unique.length) return unique;
  remaining.push('部分海外图书/百科接口在当前网络不可用，已改用百度百科等国内可用来源。');
  return remaining;
}

export async function searchExternalSources(input: {
  queries: string[];
  intent: ResearchIntent;
  yearFrom: number;
  limit?: number;
  ai?: Pick<AiRuntimeConfig, 'apiKey' | 'baseURL'>;
}): Promise<ExternalSearchResult> {
  const primary = input.queries[0];
  const queryVariants = Array.from(new Set(input.queries.map((query) => query.trim()).filter(Boolean))).slice(0, 3);
  const academicYearFrom = resolveAcademicYearFrom(input.intent, input.yearFrom);
  const includeBooks = input.intent !== 'academic';
  const includeScholarlyIndexes = input.intent !== 'book_review';
  const webQuery = input.intent === 'book_review'
    ? `${primary} 历史 背景 评价`
    : input.intent === 'academic'
      ? `${primary} 论文 综述`
      : `${primary} 背景 资料`;

  const secondary = queryVariants[1] ?? primary;
  const [
    openAlex,
    openAlexSecondary,
    crossref,
    crossrefSecondary,
    europePmc,
    semanticScholar,
    arxiv,
    books,
    archive,
    wikipedia,
    baike,
    wikidata,
    web,
  ] = await Promise.all([
    searchOpenAlex(primary, { yearFrom: academicYearFrom, limit: 25 }),
    includeScholarlyIndexes ? searchOpenAlex(secondary, { yearFrom: academicYearFrom, limit: 12 }) : Promise.resolve(emptyResult),
    searchCrossref(primary, { yearFrom: academicYearFrom, limit: 18 }),
    includeScholarlyIndexes ? searchCrossref(secondary, { yearFrom: academicYearFrom, limit: 10 }) : Promise.resolve(emptyResult),
    includeScholarlyIndexes
      ? searchEuropePmc(primary, { yearFrom: academicYearFrom, limit: 12 })
      : Promise.resolve(emptyResult),
    includeScholarlyIndexes
      ? searchSemanticScholar(primary, { yearFrom: academicYearFrom, limit: 12 })
      : Promise.resolve(emptyResult),
    includeScholarlyIndexes
      ? searchArxiv(primary, { yearFrom: academicYearFrom, limit: 10 })
      : Promise.resolve(emptyResult),
    includeBooks ? searchGoogleBooks(primary, input.intent === 'book_review' ? 15 : 8) : Promise.resolve(emptyResult),
    includeBooks ? searchInternetArchive(primary, input.intent === 'book_review' ? 12 : 6) : Promise.resolve(emptyResult),
    searchWikipedia(primary, input.intent === 'academic' ? 7 : 12),
    searchBaiduBaike(primary),
    searchWikidata(primary, 6),
    searchZhipuWeb(webQuery, input.ai, input.intent === 'book_review' ? 8 : 6),
  ]);

  const ordered = input.intent === 'book_review'
    ? [
      ...baike.papers,
      ...wikipedia.papers,
      ...wikidata.papers,
      ...web.papers,
      ...books.papers,
      ...archive.papers,
      ...openAlex.papers,
      ...openAlexSecondary.papers,
      ...crossref.papers,
      ...crossrefSecondary.papers,
    ]
    : input.intent === 'academic'
      ? [
        ...openAlex.papers,
        ...openAlexSecondary.papers,
        ...crossref.papers,
        ...crossrefSecondary.papers,
        ...semanticScholar.papers,
        ...europePmc.papers,
        ...arxiv.papers,
        ...wikipedia.papers,
        ...baike.papers,
        ...wikidata.papers,
        ...web.papers,
      ]
      : [
        ...baike.papers,
        ...wikipedia.papers,
        ...wikidata.papers,
        ...web.papers,
        ...openAlex.papers,
        ...openAlexSecondary.papers,
        ...crossref.papers,
        ...crossrefSecondary.papers,
        ...semanticScholar.papers,
        ...europePmc.papers,
        ...arxiv.papers,
        ...books.papers,
        ...archive.papers,
      ];

  const papers = deduplicate(ordered).slice(0, input.limit ?? 50);
  const rawWarnings = [
    openAlex.warning,
    openAlexSecondary.warning,
    crossref.warning,
    crossrefSecondary.warning,
    europePmc.warning,
    semanticScholar.warning,
    arxiv.warning,
    books.warning,
    archive.warning,
    wikipedia.warning,
    baike.warning,
    wikidata.warning,
    web.warning,
    input.intent === 'academic' ? cnkiLimitationWarning(primary) : undefined,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    papers,
    warnings: compactExternalWarnings(rawWarnings, papers),
  };
}
