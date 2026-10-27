import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createResearchMcpServer } from '@/mcp/server';
import type { DataScope } from '@/types/platform';

export async function callResearchTool<T>(
  name: string,
  args: Record<string, unknown> = {},
  scope?: DataScope,
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createResearchMcpServer(scope);
  const client = new Client({ name: 'research-copilot-web', version: '0.1.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textBlock = content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('MCP tool returned no text payload.');
    }
    return JSON.parse(textBlock.text ?? 'null') as T;
  } finally {
    await client.close();
    await server.close();
  }
}
