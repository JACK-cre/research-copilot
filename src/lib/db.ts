import { Pool } from 'pg';

import { getDatabaseUrl } from '@/lib/platform-config';

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) throw new Error('Database connection is not configured.');
  if (!pool) pool = new Pool({ connectionString, max: 8 });
  return pool;
}
