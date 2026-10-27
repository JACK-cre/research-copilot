import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAiAccessMode,
  getEmbeddingDimensions,
  getResearchLimit,
  getWorkspaceStorageLimitBytes,
  isHostedPlatformConfigured,
} from '@/lib/platform-config';

afterEach(() => vi.unstubAllEnvs());

describe('platform configuration', () => {
  it('requires a database and auth secret for hosted mode', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://example');
    vi.stubEnv('AUTH_SECRET', '');
    expect(isHostedPlatformConfigured()).toBe(false);

    vi.stubEnv('AUTH_SECRET', 'a-secure-auth-secret-with-32-characters');
    expect(isHostedPlatformConfigured()).toBe(true);
  });

  it('converts the workspace quota from megabytes to bytes', () => {
    vi.stubEnv('WORKSPACE_STORAGE_LIMIT_MB', '10');
    expect(getWorkspaceStorageLimitBytes()).toBe(10 * 1024 * 1024);
  });

  it('rejects invalid embedding dimensions', () => {
    vi.stubEnv('EMBEDDING_DIMENSIONS', 'not-a-number');
    expect(() => getEmbeddingDimensions()).toThrow('正整数');
  });

  it('uses hybrid AI access and separate personal-key limits by default', () => {
    vi.stubEnv('AI_ACCESS_MODE', 'hybrid');
    expect(getAiAccessMode()).toBe('hybrid');
    vi.stubEnv('DAILY_BYOK_RESEARCH_LIMIT', '75');
    vi.stubEnv('DAILY_RESEARCH_LIMIT', '20');
    expect(getResearchLimit('personal')).toBe(75);
    expect(getResearchLimit('platform')).toBe(20);
  });
});
