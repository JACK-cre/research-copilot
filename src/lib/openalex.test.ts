import { describe, expect, it } from 'vitest';

import { reconstructAbstract } from './openalex';

describe('OpenAlex helpers', () => {
  it('reconstructs abstract words in position order', () => {
    expect(
      reconstructAbstract({ generation: [2], retrieval: [0], augmented: [1] }),
    ).toBe('retrieval augmented generation');
  });

  it('returns an empty abstract for missing data', () => {
    expect(reconstructAbstract()).toBe('');
  });
});
