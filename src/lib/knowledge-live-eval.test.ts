// Opt-in: calls the configured retrieval providers. The normal test suite stays offline.
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { callResearchTool } from '@/mcp/client';
import { evidencePassage } from './chunk-context';
import { evaluateRetrieval } from './retrieval-eval';
import type { KnowledgeSearchResult } from './vector-store';

const file = process.env.KNOWLEDGE_EVAL_CASES;
const casesSchema = z.array(z.object({ question: z.string().min(2), expectedText: z.string().min(1).nullable().optional(), relevantChunkIds: z.array(z.string()).optional(), documentName: z.string().optional(), page: z.number().int().positive().optional() })).min(1);

it.skipIf(!file)('evaluates top-eight evidence on an explicitly selected local knowledge base', async () => {
  // No implicit admin/workspace selection: this runner is for a local evaluation copy.
  const cases = casesSchema.parse(JSON.parse(await readFile(file!, 'utf8')));
  const summary = await evaluateRetrieval(cases, question => callResearchTool<KnowledgeSearchResult[]>('search_knowledge', { query: question, limit: 8 }));
  console.info('retrieval.eval', summary);
  expect(summary.hitAt8).toBe(1);
  expect(summary.noAnswerFalsePositiveRate).toBe(0);
}, 600_000);
