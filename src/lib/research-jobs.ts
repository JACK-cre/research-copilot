import 'server-only';

import { randomUUID } from 'node:crypto';

import { getDatabasePool } from '@/lib/db';
import type { DataScope, OutputTemplateSnapshot } from '@/types/platform';
import type { ResearchJob, ResearchJobKind, ResearchJobPayload, ResearchJobStatus } from '@/types/research-job';

interface JobRow {
  id: string;
  run_id: string;
  kind: ResearchJobKind;
  status: ResearchJobStatus;
  stage: string;
  progress: number;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapJob(row: JobRow): ResearchJob {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    error: row.error ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const JOB_COLUMNS = 'id, run_id, kind, status, stage, progress, error, created_at, updated_at';

export async function createResearchJob(scope: DataScope, input: {
  runId: string;
  kind: ResearchJobKind;
  payload: ResearchJobPayload;
  template?: OutputTemplateSnapshot;
}): Promise<ResearchJob> {
  if (scope.mode !== 'cloud') throw new Error('后台研究任务仅在托管模式可用。');
  const id = randomUUID();
  const result = await getDatabasePool().query<JobRow>(
    `INSERT INTO research_jobs
       (id, workspace_id, created_by, run_id, kind, payload, template_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     RETURNING ${JOB_COLUMNS}`,
    [id, scope.workspaceId, scope.userId, input.runId, input.kind, JSON.stringify(input.payload), input.template ? JSON.stringify(input.template) : null],
  );
  return mapJob(result.rows[0]);
}

export async function listActiveResearchJobs(scope: DataScope): Promise<ResearchJob[]> {
  if (scope.mode !== 'cloud') return [];
  const result = await getDatabasePool().query<JobRow>(
    `SELECT ${JOB_COLUMNS} FROM research_jobs
     WHERE workspace_id = $1 AND status IN ('queued', 'running')
     ORDER BY created_at DESC LIMIT 10`,
    [scope.workspaceId],
  );
  return result.rows.map(mapJob);
}

export async function getResearchJob(scope: DataScope, id: string): Promise<ResearchJob | null> {
  if (scope.mode !== 'cloud') return null;
  const result = await getDatabasePool().query<JobRow>(
    `SELECT ${JOB_COLUMNS} FROM research_jobs WHERE id = $1 AND workspace_id = $2`,
    [id, scope.workspaceId],
  );
  return result.rows[0] ? mapJob(result.rows[0]) : null;
}

export async function cancelResearchJob(scope: DataScope, id: string): Promise<ResearchJob | null> {
  if (scope.mode !== 'cloud') return null;
  const result = await getDatabasePool().query<JobRow>(
    `UPDATE research_jobs
     SET status = 'cancelled', stage = 'cancelled', progress = 100,
         error = '用户已取消任务。', completed_at = now(), worker_token = NULL
     WHERE id = $1 AND workspace_id = $2 AND status IN ('queued', 'running')
     RETURNING ${JOB_COLUMNS}`,
    [id, scope.workspaceId],
  );
  return result.rows[0] ? mapJob(result.rows[0]) : getResearchJob(scope, id);
}

export interface ClaimedResearchJob extends ResearchJob {
  workspaceId: string;
  userId: string;
  payload: ResearchJobPayload;
  templateSnapshot?: OutputTemplateSnapshot;
  workerToken: string;
}

export async function claimNextResearchJob(workerToken: string): Promise<ClaimedResearchJob | null> {
  const result = await getDatabasePool().query<JobRow & {
    workspace_id: string;
    created_by: string;
    payload: ResearchJobPayload;
    template_snapshot: OutputTemplateSnapshot | null;
    worker_token: string;
  }>(
    `WITH next_job AS (
       SELECT id FROM research_jobs
       WHERE status = 'queued'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE research_jobs job
     SET status = 'running', stage = 'planning', progress = 5,
         worker_token = $1, heartbeat_at = now(), error = NULL
     FROM next_job
     WHERE job.id = next_job.id
     RETURNING job.*`,
    [workerToken],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...mapJob(row),
    workspaceId: row.workspace_id,
    userId: row.created_by,
    payload: row.payload,
    templateSnapshot: row.template_snapshot ?? undefined,
    workerToken,
  };
}

export async function updateResearchJob(id: string, workerToken: string, stage: string, progress: number): Promise<void> {
  await getDatabasePool().query(
    `UPDATE research_jobs SET stage = $3, progress = $4, heartbeat_at = now()
     WHERE id = $1 AND worker_token = $2 AND status = 'running'`,
    [id, workerToken, stage, Math.max(0, Math.min(100, Math.floor(progress)))],
  );
}

export async function heartbeatResearchJob(id: string, workerToken: string): Promise<void> {
  await getDatabasePool().query(
    `UPDATE research_jobs SET heartbeat_at = now()
     WHERE id = $1 AND worker_token = $2 AND status = 'running'`,
    [id, workerToken],
  );
}

export async function isResearchJobActive(id: string, workerToken: string): Promise<boolean> {
  const result = await getDatabasePool().query(
    `SELECT 1 FROM research_jobs WHERE id = $1 AND worker_token = $2 AND status = 'running'`,
    [id, workerToken],
  );
  return Boolean(result.rowCount);
}

export async function completeResearchJob(id: string, workerToken: string): Promise<void> {
  await getDatabasePool().query(
    `UPDATE research_jobs SET status = 'completed', stage = 'completed', progress = 100,
       completed_at = now(), worker_token = NULL
     WHERE id = $1 AND worker_token = $2 AND status = 'running'`,
    [id, workerToken],
  );
}

export async function failResearchJob(id: string, workerToken: string, error: string): Promise<void> {
  await getDatabasePool().query(
    `UPDATE research_jobs SET status = 'failed', stage = 'failed', progress = 100,
       error = $3, completed_at = now(), worker_token = NULL
     WHERE id = $1 AND worker_token = $2 AND status = 'running'`,
    [id, workerToken, error.slice(0, 4000)],
  );
}

export async function recoverInterruptedResearchJobs(): Promise<number> {
  const result = await getDatabasePool().query(
    `UPDATE research_jobs
     SET status = 'queued', stage = 'queued', progress = 0, worker_token = NULL,
         error = NULL, heartbeat_at = NULL
     WHERE status = 'running'
       AND (heartbeat_at IS NULL OR now() - heartbeat_at > interval '2 minutes'
         OR now() - created_at > make_interval(secs => max_runtime_seconds))`,
  );
  return result.rowCount ?? 0;
}
