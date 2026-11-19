import { describe, expect, it } from 'vitest';

import { htmlToText, isBlockedFetchHost } from '@/lib/web-fetch';

describe('web fetch guards', () => {
  it('blocks private hosts', () => {
    expect(isBlockedFetchHost('127.0.0.1')).toBe(true);
    expect(isBlockedFetchHost('10.0.0.8')).toBe(true);
    expect(isBlockedFetchHost('192.168.1.1')).toBe(true);
    expect(isBlockedFetchHost('fc00::1')).toBe(true);
    expect(isBlockedFetchHost('fe80::1')).toBe(true);
    expect(isBlockedFetchHost('arxiv.org')).toBe(false);
  });

  it('strips html to readable text', () => {
    expect(htmlToText('<html><script>x</script><h1>长征</h1><p>转折点</p></html>')).toContain('长征');
    expect(htmlToText('<html><script>x</script><h1>长征</h1><p>转折点</p></html>')).not.toContain('script');
  });

  it('does not follow a redirect into a private host', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
    await expect(import('./web-fetch').then(({ fetchPublicPage }) => fetchPublicPage('https://example.com'))).rejects.toThrow('内网');
    globalThis.fetch = original;
  });
});
