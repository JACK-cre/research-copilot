import { describe, expect, it } from 'vitest';

describe('document evidence ordering contract', () => {
  it('defines the stable source order used by the library reader', () => {
    const chunks = [
      { id: 'doc:2', chunkIndex: 2, page: 2 },
      { id: 'doc:0', chunkIndex: 0, page: 1 },
      { id: 'doc:1', chunkIndex: 1, page: 1 },
      { id: 'legacy:9', page: 1 },
    ];
    const ordered = chunks.slice().sort((left, right) => {
      const li = left.chunkIndex ?? Number.MAX_SAFE_INTEGER;
      const ri = right.chunkIndex ?? Number.MAX_SAFE_INTEGER;
      return li - ri || (left.page ?? Number.MAX_SAFE_INTEGER) - (right.page ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id);
    });
    expect(ordered.map(chunk => chunk.id)).toEqual(['doc:0', 'doc:1', 'doc:2', 'legacy:9']);
  });
});
