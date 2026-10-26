import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createResearchMcpServer } from '@/mcp/server';

async function main() {
  const server = createResearchMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
