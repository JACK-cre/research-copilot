import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import pg from 'pg';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.log('DATABASE_URL is not set; skipping database migrations.');
  process.exit(0);
}

const directory = path.join(process.cwd(), 'database', 'migrations');
const files = (await readdir(directory))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const client = new pg.Client({ connectionString });

await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('research_copilot_migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  for (const file of files) {
    const applied = await client.query(
      'SELECT 1 FROM public.schema_migrations WHERE name = $1',
      [file],
    );
    if (applied.rowCount) continue;
    const sql = await readFile(path.join(directory, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO public.schema_migrations (name) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('research_copilot_migrations'))").catch(() => undefined);
  await client.end();
}
