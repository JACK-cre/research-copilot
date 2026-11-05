import { describe, expect, it, vi } from 'vitest';

import { isRetryableToolError, withExponentialRetry } from '@/lib/retry';

describe('tool retry', () => {
  it('does not retry auth or unknown-tool errors', () => {
    expect(isRetryableToolError(new Error('未知工具：search_foo'))).toBe(false);
    expect(isRetryableToolError(new Error('401 invalid api key'))).toBe(false);
  });

  it('retries transient failures up to three times with backoff', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce('ok');
    const sleep = vi.fn(async () => undefined);

    await expect(withExponentialRetry(operation, { retries: 3, baseDelayMs: 400, sleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    const delays = sleep.mock.calls.map((call) => Number((call as unknown as [number])[0]));
    expect(delays[0]).toBeGreaterThanOrEqual(400);
    expect(delays[1]).toBeGreaterThanOrEqual(800);
    expect(delays[2]).toBeGreaterThanOrEqual(1600);
  });

  it('does not retry fatal tool errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('未知工具：search_foo'));
    const sleep = vi.fn(async () => undefined);
    await expect(withExponentialRetry(operation, { retries: 3, sleep })).rejects.toThrow('未知工具');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
