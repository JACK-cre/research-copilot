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
import { buildRetrievalQueries, buildRetrievalStrategy } from '@/lib/retrieval-strategy';
import { assertPolicyToolAllowed, assertMcpDomainAllowed, resolveMcpPolicy } from '@/mcp/policy';

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
  const policyPromise = resolveMcpPolicy(scope);
  let callCount = 0;
  async function guard(name: string, url?: string) {
    const policy = await policyPromise;
    if (callCount >= policy.maxCalls) throw new Error(`MCP 工具调用已达到本次会话上限（${policy.maxCalls} 次）。`);
    callCount += 1;
    assertPolicyToolAllowed(name, policy);
    if (url) assertMcpDomainAllowed(url, policy);
    return policy;
  }
  async function runTool<T>(name: string, task: () => Promise<T>, url?: string): Promise<T> {
    const policy = await guard(name, url);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task(),
        new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`MCP 工具执行超时（${policy.toolTimeoutMs}ms）：${name}`)), policy.toolTimeoutMs); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

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
    async ({ query, yearFrom, limit }) => toolResult(await runTool('search_papers', () => searchOpenAlex(query, { yearFrom, limit }))),
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
      return toolResult(await runTool('search_sources', async () => {
        const ai = await resolveAiRuntimeConfig(scope).catch(() => undefined);
        return searchExternalSources({ queries, intent, yearFrom, limit, ai });
      }));
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
      return toolResult(await runTool('search_knowledge', async () => {
        if (isHostedPlatformConfigured() && !scope) throw new Error('Cloud knowledge search requires an authenticated workspace.');
        const ai = await resolveAiRuntimeConfig(scope);
        const store = getVectorStore();
        const strategy = buildRetrievalStrategy(query, keywordQuery ?? query);
        const recall = knowledgeRecallLimit(limit, strategy.retrievalLimit);
        const queries = buildRetrievalQueries(query, keywordQuery);
        const semanticResults = await Promise.allSettled(queries.map(async (candidateQuery) => {
          const queryVector = await embedTextWithConfig(candidateQuery, ai);
          return store.search(queryVector, recall.retrievalLimit, scope, { model: ai.embeddingIdentity, dimensions: queryVector.length });
        }));
        const keywordResults = await Promise.allSettled(queries.map(candidateQuery => store.lexicalSearch(candidateQuery, recall.retrievalLimit, scope)));
        const semantic = mergeKnowledgeResults(semanticResults);
        const keyword = mergeKnowledgeResults(keywordResults);
        if (!semantic.length && !keyword.length && semanticResults.some(result => result.status === 'rejected')) throw semanticResults.find(result => result.status === 'rejected')?.reason;
        const candidates = fuseKnowledgeResults(semantic, keyword, recall.retrievalLimit, { semanticReliable: ai.embeddingModel !== 'local-hash-v1', strategy });
        const selected = await rerankKnowledgeResults({ query, candidates, ai, limit: recall.finalLimit });
        return store.followingChunks(selected, scope);
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
      return toolResult(await runTool('list_library', async () => {
        if (isHostedPlatformConfigured() && !scope) throw new Error('Cloud library access requires an authenticated workspace.');
        return getVectorStore().listDocuments(scope);
      }));
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
    async ({ query, yearFrom, limit }) => toolResult(await runTool('search_arxiv', () => searchArxiv(query, { yearFrom, limit }))),
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
    async ({ url }) => toolResult(await runTool('fetch_url', () => fetchPublicPage(url), url)),
  );

  return server;
}

function mergeKnowledgeResults(results: Array<PromiseSettledResult<import('@/lib/vector-store').KnowledgeSearchResult[]>>) {
  const byId = new Map<string, import('@/lib/vector-store').KnowledgeSearchResult>();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      const previous = byId.get(item.id);
      if (!previous || item.score > previous.score) byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((left, right) => right.score - left.score);
}
