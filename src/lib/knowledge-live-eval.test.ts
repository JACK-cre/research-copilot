// Opt-in: calls the configured retrieval providers. The normal test suite stays offline.
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { callResearchTool } from '@/mcp/client';
import { evidencePassage } from './chunk-context';
import type { KnowledgeSearchResult } from './vector-store';

const file = process.env.KNOWLEDGE_EVAL_CASES;
const casesSchema = z.array(z.object({ question: z.string().min(2), expectedText: z.string().min(1).nullable(), documentName: z.string().optional(), page: z.number().int().positive().optional() })).min(1);

it.skipIf(!file)('evaluates top-eight evidence on an explicitly selected local knowledge base', async () => {
  // No implicit admin/workspace selection: this runner is for a local evaluation copy.
  const cases = casesSchema.parse(JSON.parse(await readFile(file!, 'utf8')));
  let positives = 0, hits = 0, negatives = 0, falsePositives = 0;
  const times: number[] = [];
  for (const [index, c] of cases.entries()) {
    const start = performance.now();
    const rows = await callResearchTool<KnowledgeSearchResult[]>('search_knowledge', {query:c.question, limit:8});
    times.push(Math.round(performance.now() - start));
    const rank = c.expectedText === null ? -1 : rows.findIndex(r => (!c.documentName || c.documentName === r.documentName)
      && (!c.page || c.page === r.page) && evidencePassage(r,c.question,520).includes(c.expectedText!));
    if (c.expectedText === null) { negatives++; if (rows.length) falsePositives++; }
    else { positives++; if (rank >= 0) hits++; }
    console.info('retrieval.case', {case:index + 1, rank:rank < 0 ? null : rank + 1, returned:rows.length, ms:times.at(-1)});
  }
  times.sort((a,b) => a-b);
  console.info('retrieval.eval', { positives, hitAt8:positives ? hits/positives : null, negatives,
    noAnswerFalsePositiveRate:negatives ? falsePositives/negatives : null, p95Ms:times[Math.ceil(times.length * 0.95)-1] });
  expect(hits).toBe(positives);
  expect(falsePositives).toBe(0);
}, 600_000);
