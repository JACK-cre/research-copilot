import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { DEFAULT_TOOLS, configuredMcpPolicy } from '@/mcp/policy';
import { getDatabasePool } from '@/lib/db';

export const runtime = 'nodejs';

const schema = z.object({
  allowedTools: z.array(z.string().trim().min(1).max(100)).max(50),
  deniedTools: z.array(z.string().trim().min(1).max(100)).max(50),
  allowedDomains: z.array(z.string().trim().min(1).max(255)).max(100),
  maxCalls: z.number().int().min(1).max(1000),
  toolTimeoutMs: z.number().int().min(1000).max(300000),
});

function mapRow(row: { allowed_tools?: string[]; denied_tools?: string[]; allowed_domains?: string[]; max_calls?: number; tool_timeout_ms?: number }) {
  return {
    allowedTools: row.allowed_tools ?? DEFAULT_TOOLS,
    deniedTools: row.denied_tools ?? [],
    allowedDomains: row.allowed_domains ?? [],
    maxCalls: row.max_calls ?? configuredMcpPolicy().maxCalls,
    toolTimeoutMs: row.tool_timeout_ms ?? configuredMcpPolicy().toolTimeoutMs,
  };
}

export async function GET() {
  try {
    const scope = await requireDataScope();
    if (scope.mode !== 'cloud') return NextResponse.json({ policy: mapRow({}) });
    const result = await getDatabasePool().query('SELECT allowed_tools, denied_tools, allowed_domains, max_calls, tool_timeout_ms FROM workspace_mcp_policies WHERE workspace_id=$1 AND user_id=$2', [scope.workspaceId, scope.userId]);
    return NextResponse.json({ policy: mapRow(result.rows[0] ?? {}) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'MCP 权限读取失败。' }, { status: apiErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const scope = await requireDataScope();
    const input = schema.parse(await request.json());
    if (scope.mode === 'cloud') {
      await getDatabasePool().query(`INSERT INTO workspace_mcp_policies (workspace_id, user_id, allowed_tools, denied_tools, allowed_domains, max_calls, tool_timeout_ms)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (workspace_id,user_id) DO UPDATE SET allowed_tools=EXCLUDED.allowed_tools, denied_tools=EXCLUDED.denied_tools, allowed_domains=EXCLUDED.allowed_domains, max_calls=EXCLUDED.max_calls, tool_timeout_ms=EXCLUDED.tool_timeout_ms, updated_at=now()`, [scope.workspaceId, scope.userId, input.allowedTools, input.deniedTools, input.allowedDomains, input.maxCalls, input.toolTimeoutMs]);
    }
    return NextResponse.json({ policy: input });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : 'MCP 权限保存失败。';
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : apiErrorStatus(error) });
  }
}
