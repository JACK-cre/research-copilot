import { describe, expect, it } from 'vitest';

import { htmlToText, isBlockedFetchHost } from '@/lib/web-fetch';

describe('web fetch guards', () => {
  it('blocks private hosts', () => {
    expect(isBlockedFetchHost('127.0.0.1')).toBe(true);
    expect(isBlockedFetchHost('10.0.0.8')).toBe(true);
    expect(isBlockedFetchHost('192.168.1.1')).toBe(true);
    expect(isBlockedFetchHost('arxiv.org')).toBe(false);
  });

  it('strips html to readable text', () => {
    expect(htmlToText('<html><script>x</script><h1>长征</h1><p>转折点</p></html>')).toContain('长征');
    expect(htmlToText('<html><script>x</script><h1>长征</h1><p>转折点</p></html>')).not.toContain('script');
  });
});
