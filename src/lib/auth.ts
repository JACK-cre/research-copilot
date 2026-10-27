import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';

import { cookies } from 'next/headers';

import {
  hashPassword,
  hashRateLimitKey,
  hashSessionToken,
  normalizeEmail,
  secureTextEqual,
  verifyPassword,
} from '@/lib/auth-crypto';
import { getDatabasePool } from '@/lib/db';
import { isMailConfigured, sendPasswordResetEmail } from '@/lib/mail';
import { isHostedPlatformConfigured } from '@/lib/platform-config';
import type { DataScope } from '@/types/platform';

const SESSION_COOKIE = 'research_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const AUTH_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = 'scrypt-v1$16384$8$1$cmVzZWFyY2gtY29waWxvdCE$1rCLbMABr4gPMxN4zJNBsZDgpKvOZCcoX-9YC21TYzYj_Gvr_7H29j-gaqDMOEH0Zj2EEq75z-6GY-Spiy9hZA';

let lastAuthCleanupAt = 0;

export type RegistrationMode = 'open' | 'invite' | 'closed';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export class AuthenticationError extends Error {
  constructor(message = '请先登录后再继续。') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthRateLimitError extends Error {
  constructor(message = '尝试次数过多，请稍后再试。') {
    super(message);
    this.name = 'AuthRateLimitError';
  }
}

export class RegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}

export function toPublicAuthError(
  error: unknown,
  unavailableMessage: string,
): { message: string; status: number } {
  const status = apiErrorStatus(error);
  if (status === 500) return { message: unavailableMessage, status: 503 };
  return {
    message: error instanceof Error ? error.message : unavailableMessage,
    status,
  };
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET 必须配置为至少 32 个字符的随机密钥。');
  }
  return secret;
}

export function getRegistrationMode(): RegistrationMode {
  const value = process.env.REGISTRATION_MODE?.trim().toLowerCase();
  if (value === 'invite' || value === 'closed') return value;
  return 'open';
}

export function isPasswordResetEnabled(): boolean {
  return isMailConfigured();
}

function assertRegistrationAllowed(inviteCode?: string): void {
  const mode = getRegistrationMode();
  if (mode === 'closed') throw new RegistrationError('当前暂未开放新用户注册。');
  if (mode !== 'invite') return;
  const expected = process.env.REGISTRATION_INVITE_CODE?.trim();
  if (!expected || !inviteCode || !secureTextEqual(inviteCode.trim(), expected)) {
    throw new RegistrationError('邀请码无效。');
  }
}

async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: 'high',
  });
}

function scheduleExpiredAuthCleanup(): void {
  const now = Date.now();
  if (now - lastAuthCleanupAt < AUTH_CLEANUP_INTERVAL_MS) return;
  lastAuthCleanupAt = now;
  const pool = getDatabasePool();
  void Promise.all([
    pool.query('DELETE FROM auth_sessions WHERE expires_at <= now()'),
    pool.query('DELETE FROM password_reset_tokens WHERE expires_at <= now() OR used_at IS NOT NULL'),
    pool.query("DELETE FROM auth_attempts WHERE created_at < now() - interval '7 days'"),
  ]).catch((error) => console.error('Expired authentication data cleanup failed.', error));
}

async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token, getAuthSecret());
  await getDatabasePool().query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4::int))`,
    [randomUUID(), userId, tokenHash, SESSION_MAX_AGE_SECONDS],
  );
  await setSessionCookie(token);
  scheduleExpiredAuthCleanup();
}

async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isHostedPlatformConfigured()) return null;
  const token = await readSessionToken();
  if (!token) return null;
  const result = await getDatabasePool().query<{
    id: string;
    email: string;
    display_name: string;
  }>(
    `SELECT u.id, u.email, u.display_name
     FROM auth_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL`,
    [hashSessionToken(token, getAuthSecret())],
  );
  return result.rows[0]
    ? {
      id: result.rows[0].id,
      email: result.rows[0].email,
      displayName: result.rows[0].display_name,
    }
    : null;
}

export async function requireDataScope(): Promise<DataScope> {
  if (!isHostedPlatformConfigured()) {
    return { mode: 'legacy', userId: 'anonymous', workspaceId: 'shared' };
  }
  const token = await readSessionToken();
  if (!token) throw new AuthenticationError();
  const result = await getDatabasePool().query<{ user_id: string; workspace_id: string }>(
    `SELECT s.user_id, wm.workspace_id
     FROM auth_sessions s
     JOIN app_users u ON u.id = s.user_id AND u.disabled_at IS NULL
     JOIN workspace_members wm ON wm.user_id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     ORDER BY wm.created_at ASC
     LIMIT 1`,
    [hashSessionToken(token, getAuthSecret())],
  );
  const row = result.rows[0];
  if (!row) throw new AuthenticationError('登录状态已失效，请重新登录。');
  return { mode: 'cloud', userId: row.user_id, workspaceId: row.workspace_id };
}

export async function enforceAuthRateLimit(input: {
  action: 'login' | 'register' | 'reset';
  identity: string;
  limit: number;
  windowMinutes: number;
}): Promise<void> {
  const keyHash = hashRateLimitKey(`${input.action}:${input.identity}`, getAuthSecret());
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [keyHash]);
    const count = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM auth_attempts
       WHERE key_hash = $1 AND action = $2
         AND created_at >= now() - make_interval(mins => $3::int)`,
      [keyHash, input.action, input.windowMinutes],
    );
    if (Number(count.rows[0]?.count ?? 0) >= input.limit) throw new AuthRateLimitError();
    await client.query(
      'INSERT INTO auth_attempts (key_hash, action) VALUES ($1, $2)',
      [keyHash, input.action],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  void pool.query("DELETE FROM auth_attempts WHERE created_at < now() - interval '7 days'")
    .catch(() => undefined);
}

export async function requestPasswordReset(emailInput: string, requestOrigin: string): Promise<void> {
  if (!isPasswordResetEnabled()) throw new Error('密码重置邮件服务尚未配置。');
  const email = normalizeEmail(emailInput);
  const user = await getDatabasePool().query<{ id: string }>(
    'SELECT id FROM app_users WHERE email = $1 AND disabled_at IS NULL',
    [email],
  );
  if (!user.rows[0]) return;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token, getAuthSecret());
  const client = await getDatabasePool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.rows[0].id]);
    await client.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [user.rows[0].id],
    );
    await client.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '30 minutes')`,
      [randomUUID(), user.rows[0].id, tokenHash],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await sendPasswordResetEmail({ email, token, requestOrigin });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const tokenHash = hashSessionToken(token, getAuthSecret());
  const passwordHash = await hashPassword(password);
  const client = await getDatabasePool().connect();
  try {
    await client.query('BEGIN');
    const reset = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [tokenHash],
    );
    const row = reset.rows[0];
    if (!row) throw new RegistrationError('重置链接无效或已经过期。');
    await client.query(
      'UPDATE app_users SET password_hash = $1 WHERE id = $2',
      [passwordHash, row.user_id],
    );
    await client.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [row.user_id],
    );
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [row.user_id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName?: string;
  inviteCode?: string;
}): Promise<AuthUser> {
  assertRegistrationAllowed(input.inviteCode);
  const email = normalizeEmail(input.email);
  const displayName = input.displayName?.trim() || email.split('@')[0] || '研究用户';
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const client = await getDatabasePool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO app_users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)`,
      [userId, email, passwordHash, displayName],
    );
    await client.query(
      'INSERT INTO workspaces (id, name, owner_id) VALUES ($1, $2, $3)',
      [workspaceId, `${displayName}的研究空间`, userId],
    );
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [workspaceId, userId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') {
      throw new RegistrationError('该邮箱已经注册，请直接登录。');
    }
    throw error;
  } finally {
    client.release();
  }
  await createSession(userId);
  return { id: userId, email, displayName };
}

export async function loginUser(emailInput: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(emailInput);
  const result = await getDatabasePool().query<{
    id: string;
    email: string;
    display_name: string;
    password_hash: string;
  }>(
    `SELECT id, email, display_name, password_hash
     FROM app_users WHERE email = $1 AND disabled_at IS NULL`,
    [email],
  );
  const row = result.rows[0];
  const passwordMatches = await verifyPassword(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!row || !passwordMatches) {
    throw new AuthenticationError('邮箱或密码错误。');
  }
  await createSession(row.id);
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export async function logoutCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  if (token && isHostedPlatformConfigured()) {
    await getDatabasePool().query(
      'DELETE FROM auth_sessions WHERE token_hash = $1',
      [hashSessionToken(token, getAuthSecret())],
    );
  }
}

export function apiErrorStatus(error: unknown): number {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof AuthRateLimitError) return 429;
  if (error instanceof RegistrationError) return 400;
  return 500;
}
