import { chunkText } from '@/lib/text';
import { extractRelevanceTerms } from '@/lib/source-relevance';

export interface SourcePage { text: string; page?: number }

export function structureChunks(pages: SourcePage[], markdown: boolean) {
  const chunks: Array<{ content: string; page?: number; section?: string; chunkIndex: number }> = [];
  for (const page of pages) {
    const headings: string[] = [];
    let lines: string[] = [];
    let fence = '';
    function flush() {
      for (const content of chunkText(lines.join('\n'))) {
        chunks.push({ content, page: page.page, section: headings.filter(Boolean).join(' / ') || undefined, chunkIndex: chunks.length });
      }
      lines = [];
    }
    for (const line of page.text.split(/\r?\n/)) {
      const heading = markdown && !fence && line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*$/);
      if (heading) {
        flush();
        headings.length = heading[1].length - 1;
        headings.push(heading[2]);
      }
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
      if (marker && !fence) fence = marker;
      else if (marker?.startsWith(fence) && marker) fence = '';
      lines.push(line);
    }
    flush();
  }
  return chunks;
}

export function locationLabel(chunk: { page?: number; section?: string; chunkIndex?: number }) {
  return [chunk.page ? `第 ${chunk.page} 页` : '', chunk.section, chunk.chunkIndex != null ? `分块 ${chunk.chunkIndex + 1}` : ''].filter(Boolean).join(' · ');
}

// Return a contiguous source span. Overlapping windows also catch answers that straddle sentences.
export function matchedPassage(text: string, query: string, budget: number) {
  if (budget < 1) return '';
  text = text.trim();
  if (text.length <= budget) return text;
  const terms = extractRelevanceTerms(query);
  const stride = Math.max(1, Math.floor(budget / 4));
  let best = 0, bestScore = -1;
  for (let offset = 0; ; offset += stride) {
    const start = Math.min(offset, text.length - budget);
    const window = text.slice(start, start + budget).toLowerCase();
    // Center the densest match instead of leaving the answer just outside the right edge.
    const middle = window.slice(stride, budget - stride);
    const score = terms.reduce((s, t) => s + (window.includes(t) ? t.length : 0) + (middle.includes(t) ? 0.5 : 0), 0);
    if (score > bestScore) { best = start; bestScore = score; }
    if (start + budget === text.length) break;
  }
  return (best ? '…' : '') + text.slice(best, best + budget).trim() + (best + budget < text.length ? '…' : '');
}

export function evidencePassage(chunk: { content: string; followingText?: string }, query: string, budget: number) {
  const sample = matchedPassage(chunk.content, query, budget);
  if (!chunk.followingText || sample.endsWith('…')) return sample;
  // Only extend a hit that reaches the chunk boundary. The neighbor is context, not another hit.
  return `${sample}\n${chunk.followingText}`;
}
