import { NextResponse } from 'next/server';

import { getDatabasePool } from '@/lib/db';
import { getDatabaseUrl, isHostedPlatformConfigured } from '@/lib/platform-config';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HealthRow {
  users: string | null;
  runs: string | null;
  ai_settings: string | null;
  templates: string | null;
  jobs: string | null;
  vector_extension: string | null;
  queued_jobs: string;
  processing_jobs: string;
  worker_heartbeat: Date | null;
  research_jobs: string | null;
  research_queue: string;
  research_worker_heartbeat: Date | null;
}

export async function GET() {
  const startedAt = Date.now();
  try {
    if (isHostedPlatformConfigured()) {
      const result = await getDatabasePool().query<HealthRow>(
        `SELECT to_regclass('public.app_users')::text AS users,
                to_regclass('public.research_runs')::text AS runs,
                to_regclass('public.user_ai_settings')::text AS ai_settings,
                to_regclass('public.output_templates')::text AS templates,
                to_regclass('public.document_ingestion_jobs')::text AS jobs,
                (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vector_extension,
                (SELECT COUNT(*)::text FROM document_ingestion_jobs WHERE status = 'queued') AS queued_jobs,
                (SELECT COUNT(*)::text FROM document_ingestion_jobs WHERE status = 'processing') AS processing_jobs,
                (SELECT MAX(heartbeat_at) FROM document_ingestion_jobs WHERE status = 'processing') AS worker_heartbeat,
                to_regclass('public.research_jobs')::text AS research_jobs,
                (SELECT COUNT(*)::text FROM research_jobs WHERE status IN ('queued', 'running')) AS research_queue,
                (SELECT MAX(heartbeat_at) FROM research_jobs WHERE status = 'running') AS research_worker_heartbeat`,
      );
      const row = result.rows[0];
      if (!row?.users || !row.runs || !row.ai_settings || !row.templates || !row.jobs) {
        throw new Error('Database migrations have not been fully applied.');
      }
      if (!row.vector_extension) throw new Error('pgvector extension is unavailable.');
      const queued = Number(row.queued_jobs);
      const processing = Number(row.processing_jobs);
      const workerStale = processing > 0 && (!row.worker_heartbeat || Date.now() - row.worker_heartbeat.getTime() > 120_000);
      const researchQueue = Number(row.research_queue);
      const researchWorkerStale = researchQueue > 0 && row.research_jobs && (!row.research_worker_heartbeat || Date.now() - row.research_worker_heartbeat.getTime() > 120_000);
      return NextResponse.json({
        status: 'ok',
        mode: 'cloud',
        storage: 'pgvector',
        ai: process.env.OPENAI_API_KEY ? 'model' : 'local',
        databaseLatencyMs: Date.now() - startedAt,
        queue: { queued, processing, workerStale, researchQueue, researchWorkerStale },
        timestamp: new Date().toISOString(),
        degraded: workerStale || Boolean(researchWorkerStale),
        warning: workerStale ? 'Ingestion worker heartbeat is stale.' : researchWorkerStale ? 'Research worker heartbeat is stale.' : undefined,
      }, { status: 200 });
    }
    if (getDatabaseUrl()) await getDatabasePool().query('SELECT 1');
    else await getVectorStore().listDocuments();
    return NextResponse.json({
      status: 'ok',
      mode: 'legacy',
      storage: getDatabaseUrl() ? 'pgvector' : 'local',
      ai: process.env.OPENAI_API_KEY ? 'model' : 'local',
      databaseLatencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed.', error);
    return NextResponse.json(
      { status: 'unavailable', storage: 'pgvector', databaseLatencyMs: Date.now() - startedAt },
      { status: 503 },
    );
  }
}
