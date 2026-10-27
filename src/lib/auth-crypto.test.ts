import { describe, expect, it } from 'vitest';

import {
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  secureTextEqual,
  verifyPassword,
} from '@/lib/auth-crypto';

describe('standalone authentication crypto', () => {
  it('normalizes email addresses', () => {
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
  });

  it('hashes and verifies passwords without storing plaintext', async () => {
    const encoded = await hashPassword('correct-horse-2026');
    expect(encoded).not.toContain('correct-horse-2026');
    await expect(verifyPassword('correct-horse-2026', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(false);
  });

  it('binds session hashes to the deployment secret', () => {
    expect(hashSessionToken('token', 'a'.repeat(32)))
      .not.toBe(hashSessionToken('token', 'b'.repeat(32)));
    expect(secureTextEqual('invite-code', 'invite-code')).toBe(true);
    expect(secureTextEqual('invite-code', 'other-code')).toBe(false);
  });
});
