import 'server-only';

import { getDatabasePool } from '@/lib/db';
import { isCloudPlatformConfigured } from '@/lib/platform-config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DataScope } from '@/types/platform';

export class AuthenticationError extends Error {
  constructor(message = '请先登录后再继续。') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

async function ensureWorkspace(user: { id: string; email?: string }): Promise<string> {
  const pool = getDatabasePool();
  const existing = await pool.query<{ workspace_id: string }>(
    'SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
    [user.id],
  );
  if (existing.rows[0]) return existing.rows[0].workspace_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.id]);
    const concurrent = await client.query<{ workspace_id: string }>(
      'SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
      [user.id],
    );
    if (concurrent.rows[0]) {
      await client.query('COMMIT');
      return concurrent.rows[0].workspace_id;
    }
    await client.query(
      'INSERT INTO profiles (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email',
      [user.id, user.email ?? ''],
    );
    const workspace = await client.query<{ id: string }>(
      'INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id',
      ['我的研究空间', user.id],
    );
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
      [workspace.rows[0].id, user.id],
    );
    await client.query('COMMIT');
    return workspace.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function requireDataScope(): Promise<DataScope> {
  if (!isCloudPlatformConfigured()) {
    return { mode: 'legacy', userId: 'anonymous', workspaceId: 'shared' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AuthenticationError();

  return {
    mode: 'cloud',
    userId: data.user.id,
    workspaceId: await ensureWorkspace({ id: data.user.id, email: data.user.email }),
  };
}

export function apiErrorStatus(error: unknown): number {
  if (error instanceof AuthenticationError) return 401;
  return 500;
}
