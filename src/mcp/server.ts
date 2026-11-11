import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { embedTextWithConfig } from '@/lib/embeddings';
import { searchArxiv } from '@/lib/arxiv';
import { searchExternalSources } from '@/lib/external-search';
import { fetchPublicPage } from '@/lib/web-fetch';
import { fuseKnowledgeResults } from '@/lib/hybrid-search';
import { knowledgeRecallLimit, rerankKnowledgeResults } from '@/lib/knowledge-rerank';
import { searchOpenAlex } from '@/lib/openalex';
import { isHostedPlatformConfigured } from '@/lib/platform-config';
import { getVectorStore } from '@/lib/vector-store';
import type { DataScope } from '@/types/platform';

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  };
}

export function createResearchMcpServer(scope?: DataScope): McpServer {
  const server = new McpServer({
    name: 'research-copilot-tools',
    version: '0.1.0',
  });

  server.registerTool(
    'search_papers',
    {
      title: 'Search academic papers',
      description: 'Search OpenAlex for papers that match a research topic.',
      inputSchema: {
        query: z.string().min(2),
        yearFrom: z.number().int().min(1900).max(2100),
        limit: z.number().int().min(1).max(25),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, yearFrom, limit }) =>
      toolResult(await searchOpenAlex(query, { yearFrom, limit })),
  );

  server.registerTool(
    'search_sources',
    {
      title: 'Search research sources',
      description: 'Search public academic indexes, encyclopedias, books, and web references.',
      inputSchema: {
        queries: z.array(z.string().min(2)).min(1).max(8),
        intent: z.enum(['academic', 'book_review', 'general']),
        yearFrom: z.number().int().min(1900).max(2100),
        limit: z.number().int().min(10).max(60).default(50),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ queries, intent, yearFrom, limit }) => {
      const ai = await resolveAiRuntimeConfig(scope).catch(() => undefined);
      return toolResult(await searchExternalSources({ queries, intent, yearFrom, limit, ai }));
    },
  );

  server.registerTool(
    'search_knowledge',
    {
      title: 'Search local knowledge base',
      description: 'Run vector similarity search over uploaded PDF and text documents.',
      inputSchema: {
        query: z.string().min(2),
        keywordQuery: z.string().min(2).optional(),
        limit: z.number().int().min(1).max(20).default(8),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, keywordQuery, limit }) => {
      if (isHostedPlatformConfigured() && !scope) {
        throw new Error('Cloud knowledge search requires an authenticated workspace.');
      }
      const ai = await resolveAiRuntimeConfig(scope);
      const store = getVectorStore();
      const recall = knowledgeRecallLimit(limit);
      const semanticPromise = embedTextWithConfig(query, ai)
        .then((queryVector) => store.search(queryVector, recall.retrievalLimit, scope, {
          model: ai.embeddingIdentity,
          dimensions: queryVector.length,
        }));
      const [semanticResult, keywordResult] = await Promise.allSettled([
        semanticPromise,
        store.lexicalSearch(keywordQuery ?? query, recall.retrievalLimit, scope),
      ]);
      const semantic = semanticResult.status === 'fulfilled' ? semanticResult.value : [];
      const keyword = keywordResult.status === 'fulfilled' ? keywordResult.value : [];
      if (!semantic.length && !keyword.length && semanticResult.status === 'rejected') {
        throw semanticResult.reason;
      }
      const candidates = fuseKnowledgeResults(semantic, keyword, recall.retrievalLimit, {
        semanticReliable: ai.embeddingModel !== 'local-hash-v1',
        semanticThreshold: 0.58,
        keywordThreshold: 0.16,
      });
      return toolResult(await rerankKnowledgeResults({
        query,
        candidates,
        ai,
        limit: recall.finalLimit,
      }));
    },
  );

  server.registerTool(
    'list_library',
    {
      title: 'List knowledge documents',
      description: 'List documents that are available to retrieval.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      if (isHostedPlatformConfigured() && !scope) {
        throw new Error('Cloud library access requires an authenticated workspace.');
      }
      return toolResult(await getVectorStore().listDocuments(scope));
    },
  );


  server.registerTool(
    'search_arxiv',
    {
      title: 'Search arXiv papers',
      description: 'Search the public arXiv preprint index.',
      inputSchema: {
        query: z.string().min(2),
        yearFrom: z.number().int().min(1900).max(2100).optional(),
        limit: z.number().int().min(1).max(20).default(8),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, yearFrom, limit }) =>
      toolResult(await searchArxiv(query, { yearFrom, limit })),
  );

  server.registerTool(
    'fetch_url',
    {
      title: 'Fetch public webpage',
      description: 'Fetch a public http(s) page and extract readable text. Blocks private hosts.',
      inputSchema: {
        url: z.string().url(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => toolResult(await fetchPublicPage(url)),
  );

  return server;
}
