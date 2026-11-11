import 'server-only';

import { randomUUID } from 'node:crypto';

import { getDatabasePool } from '@/lib/db';
import { getDatabaseUrl } from '@/lib/platform-config';
import type { DataScope } from '@/types/platform';
import type { IngestionJob, IngestionJobStage, IngestionJobStatus } from '@/types/ingestion';

interface JobRow {
  id: string;
  document_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: string | number;
  status: IngestionJobStatus;
  stage: IngestionJobStage;
  progress: number;
  chunk_count: number;
  error: string | null;
  attempts: number;
  created_at: Date;
  updated_at: Date;
}

function mapJob(row: JobRow): IngestionJob {
  return {
    id: row.id,
    documentId: row.document_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: Number(row.size_bytes),
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    chunkCount: row.chunk_count,
    error: row.error ?? undefined,
    attempts: row.attempts,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const JOB_COLUMNS = `id, document_id, file_name, mime_type, size_bytes, status, stage,
  progress, chunk_count, error, attempts, created_at, updated_at`;

export function canUsePersistentIngestion(): boolean {
  return Boolean(getDatabaseUrl());
}

export async function createIngestionJob(scope: DataScope, input: {
  documentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}): Promise<IngestionJob> {
  if (scope.mode !== 'cloud') throw new Error('后台解析任务仅在托管模式可用。');
  const id = randomUUID();
  const result = await getDatabasePool().query<JobRow>(
    `INSERT INTO document_ingestion_jobs
       (id, workspace_id, created_by, document_id, file_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${JOB_COLUMNS}`,
    [id, scope.workspaceId, scope.userId, input.documentId, input.fileName, input.mimeType, input.size, input.storagePath],
  );
  return mapJob(result.rows[0]);
}

export async function listIngestionJobs(scope: DataScope, limit = 30): Promise<IngestionJob[]> {
  if (scope.mode !== 'cloud') return [];
  const result = await getDatabasePool().query<JobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM document_ingestion_jobs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [scope.workspaceId, Math.max(1, Math.min(100, limit))],
  );
  return result.rows.map(mapJob);
}

export async function getIngestionJob(scope: DataScope, id: string): Promise<IngestionJob | null> {
  if (scope.mode !== 'cloud') return null;
  const result = await getDatabasePool().query<JobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM document_ingestion_jobs
     WHERE id = $1 AND workspace_id = $2`,
    [id, scope.workspaceId],
  );
  return result.rows[0] ? mapJob(result.rows[0]) : null;
}

export async function cancelIngestionJob(scope: DataScope, id: string): Promise<IngestionJob | null> {
  if (scope.mode !== 'cloud') return null;
  const result = await getDatabasePool().query<JobRow>(
    `UPDATE document_ingestion_jobs
     SET status = 'cancelled', stage = 'failed', error = '用户已取消解析。', completed_at = now()
     WHERE id = $1 AND workspace_id = $2 AND status IN ('queued', 'processing')
     RETURNING ${JOB_COLUMNS}`,
    [id, scope.workspaceId],
  );
  return result.rows[0] ? mapJob(result.rows[0]) : getIngestionJob(scope, id);
}

export async function retryIngestionJob(scope: DataScope, id: string): Promise<IngestionJob | null> {
  if (scope.mode !== 'cloud') return null;
  const result = await getDatabasePool().query<JobRow>(
    `UPDATE document_ingestion_jobs
     SET status = 'queued', stage = 'queued', progress = 0, error = NULL,
         attempts = 0, worker_token = NULL, started_at = NULL, completed_at = NULL
     WHERE id = $1 AND workspace_id = $2 AND status IN ('failed', 'cancelled')
     RETURNING ${JOB_COLUMNS}`,
    [id, scope.workspaceId],
  );
  return result.rows[0] ? mapJob(result.rows[0]) : getIngestionJob(scope, id);
}

export async function isIngestionJobActive(id: string, workerToken: string): Promise<boolean> {
  const result = await getDatabasePool().query(
    `SELECT 1 FROM document_ingestion_jobs
     WHERE id = $1 AND worker_token = $2 AND status = 'processing'`,
    [id, workerToken],
  );
  return Boolean(result.rowCount);
}

export async function deleteIngestionJob(scope: DataScope, id: string): Promise<boolean> {
  if (scope.mode !== 'cloud') return false;
  const result = await getDatabasePool().query(
    `DELETE FROM document_ingestion_jobs
     WHERE id = $1 AND workspace_id = $2 AND status IN ('ready', 'failed', 'cancelled')`,
    [id, scope.workspaceId],
  );
  return Boolean(result.rowCount);
}

export interface ClaimedIngestionJob extends IngestionJob {
  workspaceId: string;
  userId: string;
  storagePath: string;
  workerToken: string;
}

export async function claimNextIngestionJob(workerToken: string): Promise<ClaimedIngestionJob | null> {
  const result = await getDatabasePool().query<JobRow & {
    workspace_id: string;
    created_by: string;
    storage_path: string;
    worker_token: string;
  }>(
    `WITH next_job AS (
       SELECT id
       FROM document_ingestion_jobs
       WHERE status = 'queued'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE document_ingestion_jobs job
     SET status = 'processing', stage = 'reading', progress = 3,
         worker_token = $1, started_at = now(), heartbeat_at = now(),
         attempts = attempts + 1, error = NULL
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
    storagePath: row.storage_path,
    workerToken,
  };
}

export async function updateIngestionJobProgress(
  id: string,
  workerToken: string,
  stage: IngestionJobStage,
  progress: number,
): Promise<void> {
  await getDatabasePool().query(
    `UPDATE document_ingestion_jobs
     SET stage = $3, progress = $4, heartbeat_at = now()
     WHERE id = $1 AND worker_token = $2 AND status = 'processing'`,
    [id, workerToken, stage, Math.max(0, Math.min(100, Math.floor(progress)))],
  );
}

export async function heartbeatIngestionJob(id: string, workerToken: string): Promise<void> {
  await getDatabasePool().query(
    `UPDATE document_ingestion_jobs SET heartbeat_at = now()
     WHERE id = $1 AND worker_token = $2 AND status = 'processing'`,
    [id, workerToken],
  );
}

export async function completeIngestionJob(
  id: string,
  workerToken: string,
  chunkCount: number,
): Promise<void> {
  await getDatabasePool().query(
    `UPDATE document_ingestion_jobs
     SET status = 'ready', stage = 'ready', progress = 100,
         chunk_count = $3, completed_at = now(), worker_token = NULL
     WHERE id = $1 AND worker_token = $2 AND status = 'processing'`,
    [id, workerToken, chunkCount],
  );
}

export async function failIngestionJob(id: string, workerToken: string, error: string): Promise<void> {
  await getDatabasePool().query(
    `UPDATE document_ingestion_jobs
     SET status = 'failed', stage = 'failed', progress = 100,
         error = $3, completed_at = now(), worker_token = NULL
     WHERE id = $1 AND worker_token = $2 AND status = 'processing'`,
    [id, workerToken, error.slice(0, 4000)],
  );
}

export async function recoverInterruptedIngestionJobs(): Promise<number> {
  const result = await getDatabasePool().query(
    `UPDATE document_ingestion_jobs
     SET status = CASE
           WHEN attempts >= 3 THEN 'failed'
           ELSE 'queued'
         END,
         stage = CASE
           WHEN attempts >= 3 THEN 'failed'
           ELSE 'queued'
         END,
         progress = 0, worker_token = NULL, started_at = NULL, heartbeat_at = NULL,
         error = CASE
           WHEN attempts >= 3 THEN '解析多次中断，请重试。'
           WHEN started_at IS NOT NULL AND now() - started_at > make_interval(secs => max_runtime_seconds)
             THEN '解析超时，已重新排队。'
           ELSE NULL
         END,
         completed_at = CASE WHEN attempts >= 3 THEN now() ELSE NULL END
     WHERE status = 'processing'
       AND (
         heartbeat_at IS NULL
         OR now() - heartbeat_at > interval '2 minutes'
         OR now() - started_at > make_interval(secs => max_runtime_seconds)
       )`,
  );
  return result.rowCount ?? 0;
}
