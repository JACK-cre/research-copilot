import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getEmbeddingDimensions,
  getWorkspaceStorageLimitBytes,
  isCloudPlatformConfigured,
} from '@/lib/platform-config';

afterEach(() => vi.unstubAllEnvs());

describe('platform configuration', () => {
  it('requires the complete Supabase configuration before cloud mode', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    vi.stubEnv('SUPABASE_DATABASE_URL', '');
    expect(isCloudPlatformConfigured()).toBe(false);

    vi.stubEnv('SUPABASE_DATABASE_URL', 'postgresql://example');
    expect(isCloudPlatformConfigured()).toBe(true);
  });

  it('converts the workspace quota from megabytes to bytes', () => {
    vi.stubEnv('WORKSPACE_STORAGE_LIMIT_MB', '10');
    expect(getWorkspaceStorageLimitBytes()).toBe(10 * 1024 * 1024);
  });

  it('rejects invalid embedding dimensions', () => {
    vi.stubEnv('EMBEDDING_DIMENSIONS', 'not-a-number');
    expect(() => getEmbeddingDimensions()).toThrow('正整数');
  });
});
