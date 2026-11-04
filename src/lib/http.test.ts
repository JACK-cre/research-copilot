import { describe, expect, it } from 'vitest';

import { describeHttpFailure, ExternalHttpError } from '@/lib/http';

describe('describeHttpFailure', () => {
  it('explains timeouts and blocked overseas hosts', () => {
    expect(describeHttpFailure('Wikipedia', new ExternalHttpError('aborted', { kind: 'timeout' })))
      .toBe('Wikipedia 在当前网络环境下超时或无法访问，已跳过。');
  });

  it('explains rate limits instead of a generic outage', () => {
    expect(describeHttpFailure('Google Books', new ExternalHttpError('429', { status: 429, kind: 'rate_limit' })))
      .toBe('Google Books 请求过于频繁或未配置 API Key，已跳过。');
  });

  it('keeps a short generic message for other HTTP errors', () => {
    expect(describeHttpFailure('Crossref', new ExternalHttpError('HTTP 503', { status: 503, kind: 'http' })))
      .toBe('Crossref 暂时不可用。');
  });
});
