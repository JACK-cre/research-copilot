import { NextResponse } from 'next/server';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { getDatabasePool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const scope = await requireDataScope();
    if (scope.mode !== 'cloud') return NextResponse.json({ mode: 'legacy', queues: {}, jobs: [], traces: [] });
    const pool = getDatabasePool();
    const [queues, jobs, traces] = await Promise.all([
      pool.query(`SELECT (SELECT COUNT(*) FROM research_jobs WHERE workspace_id=$1 AND status='queued')::int AS research_queued,
        (SELECT COUNT(*) FROM research_jobs WHERE workspace_id=$1 AND status='running')::int AS research_running,
        (SELECT COUNT(*) FROM document_ingestion_jobs WHERE workspace_id=$1 AND status='queued')::int AS ingestion_queued,
        (SELECT COUNT(*) FROM document_ingestion_jobs WHERE workspace_id=$1 AND status='processing')::int AS ingestion_processing`, [scope.workspaceId]),
      pool.query(`SELECT id, kind, status, stage, progress, error, created_at, updated_at FROM research_jobs WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 50`, [scope.workspaceId]),
      pool.query(`SELECT id, topic, status, result->'agentTrace' AS trace, created_at FROM research_runs WHERE workspace_id=$1 AND result IS NOT NULL ORDER BY created_at DESC LIMIT 20`, [scope.workspaceId]),
    ]);
    return NextResponse.json({
      mode: 'cloud',
      queues: queues.rows[0],
      jobs: jobs.rows.map(row => ({ ...row, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() })),
      traces: traces.rows.map(row => {
        const trace = Array.isArray(row.trace) ? row.trace : [];
        return {
          id: row.id,
          topic: row.topic,
          status: row.status,
          createdAt: row.created_at.toISOString(),
          totalDurationMs: trace.reduce((sum: number, step: { durationMs?: number }) => sum + (Number(step.durationMs) || 0), 0),
          failedSteps: trace.filter((step: { status?: string }) => step.status === 'failed').length,
          trace,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '监控数据读取失败。' }, { status: apiErrorStatus(error) });
  }
}
