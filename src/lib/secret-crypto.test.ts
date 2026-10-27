import { afterEach, describe, expect, it, vi } from 'vitest';

import { decryptSecret, encryptSecret } from '@/lib/secret-crypto';

afterEach(() => vi.unstubAllEnvs());

describe('personal API key encryption', () => {
  it('round-trips without exposing plaintext', () => {
    vi.stubEnv('AI_KEY_ENCRYPTION_SECRET', 'test-only-encryption-secret-with-32-chars');
    const encrypted = encryptSecret('sk-example-personal-key');
    expect(encrypted).not.toContain('sk-example');
    expect(decryptSecret(encrypted)).toBe('sk-example-personal-key');
  });

  it('rejects a changed encryption secret', () => {
    vi.stubEnv('AI_KEY_ENCRYPTION_SECRET', 'first-test-encryption-secret-32-chars');
    const encrypted = encryptSecret('sk-example-personal-key');
    vi.stubEnv('AI_KEY_ENCRYPTION_SECRET', 'second-test-encryption-secret-32-char');
    expect(() => decryptSecret(encrypted)).toThrow('无法解密');
  });
});
