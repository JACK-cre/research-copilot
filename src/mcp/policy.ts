import { getDatabasePool } from '@/lib/db';
import type { DataScope } from '@/types/platform';

export const DEFAULT_TOOLS = ['search_papers', 'search_sources', 'search_knowledge', 'list_library', 'search_arxiv', 'fetch_url'];

export interface McpPolicy {
  allowedTools: Set<string>;
  deniedTools: Set<string>;
  allowedDomains: Set<string>;
  maxCalls: number;
  toolTimeoutMs: number;
}

export function allowedMcpTools(value = process.env.MCP_ALLOWED_TOOLS): Set<string> {
  const configured = value?.split(',').map(item => item.trim()).filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_TOOLS);
}

export function assertMcpToolAllowed(name: string, allowed = allowedMcpTools()): void {
  if (!allowed.has(name)) throw new Error(`MCP 工具未获允许：${name}`);
}

function csv(value: string | undefined): Set<string> {
  return new Set((value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
}

export function configuredMcpPolicy(): McpPolicy {
  return {
    allowedTools: allowedMcpTools(),
    deniedTools: csv(process.env.MCP_DENIED_TOOLS),
    allowedDomains: csv(process.env.MCP_ALLOWED_DOMAINS),
    maxCalls: Math.max(1, Math.min(1000, Number(process.env.MCP_MAX_CALLS ?? 120) || 120)),
    toolTimeoutMs: Math.max(1_000, Math.min(300_000, Number(process.env.MCP_TOOL_TIMEOUT_MS ?? 120_000) || 120_000)),
  };
}

export async function resolveMcpPolicy(scope?: DataScope): Promise<McpPolicy> {
  const fallback = configuredMcpPolicy();
  if (!scope || scope.mode !== 'cloud') return fallback;
  try {
    const result = await getDatabasePool().query<{
      allowed_tools: string[] | null;
      denied_tools: string[] | null;
      allowed_domains: string[] | null;
      max_calls: number | null;
      tool_timeout_ms: number | null;
    }>(`SELECT allowed_tools, denied_tools, allowed_domains, max_calls, tool_timeout_ms
        FROM workspace_mcp_policies WHERE workspace_id = $1 AND user_id = $2`, [scope.workspaceId, scope.userId]);
    const row = result.rows[0];
    if (!row) return fallback;
    return {
      allowedTools: new Set((row.allowed_tools?.length ? row.allowed_tools : [...fallback.allowedTools]).map(item => item.toLowerCase())),
      deniedTools: new Set((row.denied_tools ?? []).map(item => item.toLowerCase())),
      allowedDomains: new Set((row.allowed_domains ?? []).map(item => item.toLowerCase())),
      maxCalls: Math.max(1, Math.min(1000, row.max_calls ?? fallback.maxCalls)),
      toolTimeoutMs: Math.max(1_000, Math.min(300_000, row.tool_timeout_ms ?? fallback.toolTimeoutMs)),
    };
  } catch {
    return fallback;
  }
}

export function assertPolicyToolAllowed(name: string, policy: McpPolicy): void {
  const normalized = name.trim().toLowerCase();
  if (policy.deniedTools.has(normalized) || !policy.allowedTools.has(normalized)) {
    throw new Error(`MCP 工具未获允许：${name}`);
  }
}

export function assertMcpDomainAllowed(value: string, policy: McpPolicy): void {
  if (!policy.allowedDomains.size) return;
  const hostname = new URL(value).hostname.toLowerCase();
  if (![...policy.allowedDomains].some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new Error(`MCP 外部域名未获允许：${hostname}`);
  }
}
