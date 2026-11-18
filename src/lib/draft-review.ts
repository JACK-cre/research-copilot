import { z } from 'zod';
import type { GeneratedResearchOutput } from '@/types/research';
import type { RevisionTarget } from '@/types/platform';
import { matchedPassage } from '@/lib/chunk-context';

// Register editable strings explicitly: model-provided field names are never object paths.
function fields(draft: GeneratedResearchOutput, target: RevisionTarget) {
  const map = new Map<string, { text: string; write: (s: string) => void }>();
  function add(id: string, text: string | undefined, write: (s: string) => void) {
    if (text) map.set(id, { text, write });
  }
  if (target !== 'slides') {
    add('title', draft.title, s => { draft.title = s; });
    add('thesis', draft.thesis, s => { draft.thesis = s; });
    draft.sections.forEach((v, i) => {
      add(`section${i}.title`, v.title, s => { v.title = s; });
      add(`section${i}.body`, v.content, s => { v.content = s; });
    });
  }
  if (target !== 'report') draft.slides.forEach((v, i) => {
    const id = `slide${i}`;
    add(id, v.title, s => { v.title = s; });
    v.keyPoints.forEach((p, j) => add(`${id}.point${j}`, p, s => { v.keyPoints[j] = s; }));
    add(`${id}.notes`, v.speakerNotes, s => { v.speakerNotes = s; });
    if (!v.visual) return;
    const visual = v.visual;
    add(`${id}.subtitle`, visual.subtitle, s => { visual.subtitle = s; });
    visual.items.forEach((item, j) => {
      for (const key of ['value', 'title', 'description', 'label'] as const) {
        add(`${id}.item${j}.${key}`, item[key], s => { item[key] = s; });
      }
    });
  });
  return map;
}

export function reviewExcerpts(draft: GeneratedResearchOutput, target: RevisionTarget) {
  const highRisk = /\d+(?:[.,]\d+)?\s*(?:[%％]|倍|毫秒|秒|万)|同比|相比|独立|主导|提升|降低|优于|负责/;
  const entries = [...fields(draft, target)].map(([id, { text }]) => {
    const hit = text.match(highRisk);
    return { id, priority: Number(!!hit) + Number(id.endsWith('.value')), excerpt: matchedPassage(text, hit?.[0] || text.slice(0, 40), 360) };
  }).sort((a,b) => b.priority - a.priority);
  let remaining = 9500;
  return entries.filter(row => {
    if (row.excerpt.length + row.id.length > remaining) return false;
    remaining -= row.excerpt.length + row.id.length;
    return true;
  }).map(({ id, excerpt }) => ({ id, excerpt }));
}

const reviewSchema = z.object({
  issues: z.array(z.string().min(1).max(300)).max(12),
  edits: z.array(z.object({ field: z.string(), before: z.string().min(1).max(600), after: z.string().trim().min(1).max(600) })).max(12),
});

export function applyReview(draft: GeneratedResearchOutput, target: RevisionTarget, response: unknown, sources: string) {
  const { issues, edits } = reviewSchema.parse(response);
  const output = structuredClone(draft);
  const allowed = fields(output, target);
  let applied = 0;
  for (const { field, before, after } of edits) {
    const entry = allowed.get(field);
    if (!entry || before === after || entry.text.indexOf(before) < 0 || entry.text.indexOf(before) !== entry.text.lastIndexOf(before)) continue;
    if ((after.match(/\d+(?:\.\d+)?[%％]?/g) ?? []).some(n => !before.includes(n) && !sources.includes(n))) continue;
    entry.text = entry.text.replace(before, () => after);
    entry.write(entry.text);
    applied++;
  }
  return { generated: output, applied, issues };
}
