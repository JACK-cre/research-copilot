import { normalizeWhitespace } from "@/lib/text";
import type { Paper } from "@/types/research";

interface OpenAlexWork {
  id: string;
  doi?: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: {
    landing_page_url?: string;
    pdf_url?: string;
  };
  open_access?: { oa_url?: string };
  topics?: Array<{ display_name?: string }>;
}

export function reconstructAbstract(
  invertedIndex?: Record<string, number[]>,
): string {
  if (!invertedIndex) return "";
  const positionedWords: Array<[number, string]> = [];

  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) positionedWords.push([position, word]);
  }

  return normalizeWhitespace(
    positionedWords
      .sort(([left], [right]) => left - right)
      .map(([, word]) => word)
      .join(" "),
  );
}

function mapWork(work: OpenAlexWork): Paper | null {
  if (!work.title || !work.publication_year) return null;
  const abstract = reconstructAbstract(work.abstract_inverted_index);
  return {
    id: work.id,
    title: normalizeWhitespace(work.title),
    abstract: abstract || "OpenAlex 暂未提供该论文摘要。",
    year: work.publication_year,
    authors: (work.authorships ?? [])
      .map((entry) => entry.author?.display_name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 8)
      .map((name) => ({ name })),
    citedByCount: work.cited_by_count ?? 0,
    doi: work.doi,
    url: work.primary_location?.landing_page_url ?? work.doi ?? work.id,
    pdfUrl: work.primary_location?.pdf_url ?? work.open_access?.oa_url,
    topics: (work.topics ?? [])
      .map((topic) => topic.display_name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 4),
    source: "openalex",
    sourceType: "paper",
  };
}

export async function searchOpenAlex(
  query: string,
  options: { yearFrom: number; limit: number },
): Promise<{ papers: Paper[]; warning?: string }> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set(
    "filter",
    `from_publication_date:${options.yearFrom}-01-01,type:article|preprint`,
  );
  url.searchParams.set("sort", "relevance_score:desc");
  url.searchParams.set("per-page", String(Math.min(options.limit, 25)));
  url.searchParams.set(
    "select",
    "id,doi,title,publication_year,cited_by_count,abstract_inverted_index,authorships,primary_location,open_access,topics",
  );
  if (process.env.OPENALEX_MAILTO) {
    url.searchParams.set("mailto", process.env.OPENALEX_MAILTO);
  }
  if (process.env.OPENALEX_API_KEY) {
    url.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ResearchCopilot/0.1" },
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`OpenAlex returned ${response.status}`);
    const payload = (await response.json()) as { results?: OpenAlexWork[] };
    const papers = (payload.results ?? [])
      .map(mapWork)
      .filter((paper): paper is Paper => Boolean(paper));
    if (papers.length) return { papers };
    return { papers: [], warning: "OpenAlex 没有返回可用结果。" };
  } catch (error) {
    console.warn("OpenAlex search failed.", error);
    return {
      papers: [],
      warning: "OpenAlex 暂时不可用，本次没有使用示例数据替代真实来源。",
    };
  }
}
