import { describe, expect, it } from 'vitest';

import { shouldSearchGoogleBooks } from '@/lib/google-books';

describe('Google Books gating', () => {
  it('skips unauthenticated calls that only return quota errors', () => {
    expect(shouldSearchGoogleBooks(undefined)).toBe(false);
    expect(shouldSearchGoogleBooks('')).toBe(false);
    expect(shouldSearchGoogleBooks('AIza-test')).toBe(true);
  });
});
