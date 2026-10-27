import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { embedText } from '@/lib/embeddings';
import { searchOpenAlex } from '@/lib/openalex';
import { isCloudPlatformConfigured } from '@/lib/platform-config';
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
    'search_knowledge',
    {
      title: 'Search local knowledge base',
      description: 'Run vector similarity search over uploaded PDF and text documents.',
      inputSchema: {
        query: z.string().min(2),
        limit: z.number().int().min(1).max(20).default(8),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      if (isCloudPlatformConfigured() && !scope) {
        throw new Error('Cloud knowledge search requires an authenticated workspace.');
      }
      const queryVector = await embedText(query);
      const matches = await getVectorStore().search(queryVector, limit, scope);
      return toolResult(matches);
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
      if (isCloudPlatformConfigured() && !scope) {
        throw new Error('Cloud library access requires an authenticated workspace.');
      }
      return toolResult(await getVectorStore().listDocuments(scope));
    },
  );

  return server;
}
