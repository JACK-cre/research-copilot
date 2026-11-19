import { describe, expect, it } from 'vitest';
import { allowedMcpTools, assertMcpToolAllowed, assertMcpDomainAllowed, assertPolicyToolAllowed } from './policy';

describe('MCP tool policy', () => {
  it('defaults to read-only research tools and supports an explicit allowlist', () => {
    expect(allowedMcpTools('search_knowledge, fetch_url')).toEqual(new Set(['search_knowledge','fetch_url']));
    expect(() => assertMcpToolAllowed('search_papers', new Set(['search_knowledge']))).toThrow('未获允许');
    expect(() => assertMcpToolAllowed('search_knowledge', new Set(['search_knowledge']))).not.toThrow();
  });

  it('enforces account-level deny rules and domain allowlists', () => {
    const policy = { allowedTools: new Set(['fetch_url']), deniedTools: new Set(['fetch_url']), allowedDomains: new Set(['example.com']), maxCalls: 3, toolTimeoutMs: 1000 };
    expect(() => assertPolicyToolAllowed('fetch_url', policy)).toThrow('未获允许');
    expect(() => assertMcpDomainAllowed('https://docs.example.com/page', { ...policy, deniedTools: new Set() })).not.toThrow();
    expect(() => assertMcpDomainAllowed('https://example.org', { ...policy, deniedTools: new Set() })).toThrow('外部域名');
  });
});
