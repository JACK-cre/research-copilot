import { describe, expect, it } from 'vitest';

import {
  cnkiLimitationWarning,
  compactExternalWarnings,
  resolveAcademicYearFrom,
} from '@/lib/external-search';
import type { Paper } from '@/types/research';

function paper(source: Paper['source']): Paper {
  return {
    id: source,
    title: '长征',
    abstract: '中国工农红军战略转移。',
    year: 1934,
    authors: [],
    citedByCount: 0,
    url: 'https://example.com',
    topics: [],
    source,
    sourceType: source === 'openalex' ? 'paper' : 'web',
  };
}

describe('external search policy', () => {
  it('relaxes academic year filters for book reviews', () => {
    expect(resolveAcademicYearFrom('book_review', 2020)).toBe(1900);
    expect(resolveAcademicYearFrom('academic', 2020)).toBe(2020);
  });

  it('hides overseas outage noise when a domestic encyclopedia hit exists', () => {
    const warnings = compactExternalWarnings(
      [
        'Wikipedia 在当前网络环境下超时或无法访问，已跳过。',
        'Internet Archive 在当前网络环境下超时或无法访问，已跳过。',
        'Semantic Scholar 请求过于频繁或未配置 API Key，已跳过。',
      ],
      [paper('baidu-baike')],
    );
    expect(warnings).toEqual([
      'Semantic Scholar 请求过于频繁或未配置 API Key，已跳过。',
      '部分海外图书/百科接口在当前网络不可用，已改用百度百科等国内可用来源。',
    ]);
  });

  it('points academic users to CNKI search instead of scraping', () => {
    expect(cnkiLimitationWarning('长征')).toContain('没有开放检索接口');
    expect(cnkiLimitationWarning('长征')).toContain('kw=%E9%95%BF%E5%BE%81');
  });
});
