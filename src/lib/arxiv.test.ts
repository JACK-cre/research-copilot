import { describe, expect, it } from 'vitest';

import { mapArxivEntry } from '@/lib/arxiv';

const entry = `
  <id>http://arxiv.org/abs/1706.03762v7</id>
  <title>Attention Is All You Need</title>
  <summary>The dominant sequence transduction models are based on complex recurrent neural networks.</summary>
  <published>2017-06-12T17:57:34Z</published>
  <author><name>Ashish Vaswani</name></author>
  <arxiv:doi>10.48550/arXiv.1706.03762</arxiv:doi>
  <category term="cs.CL" />
`;

describe('arxiv mapping', () => {
  it('parses an atom entry into a paper', () => {
    const paper = mapArxivEntry(entry);
    expect(paper?.title).toBe('Attention Is All You Need');
    expect(paper?.source).toBe('arxiv');
    expect(paper?.year).toBe(2017);
    expect(paper?.pdfUrl).toContain('1706.03762');
  });
});
