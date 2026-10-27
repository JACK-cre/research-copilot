import { randomUUID } from 'node:crypto';

import { getDatabasePool } from '@/lib/db';
import { getResearchLimit, getWorkspaceStorageLimitBytes } from '@/lib/platform-config';
import type {
  AiCredentialSource,
  ArtifactType,
  DataScope,
  OutputTemplateSnapshot,
  ResearchArtifact,
  ResearchRunStatus,
  ResearchRunSummary,
  RevisionTarget,
} from '@/types/platform';
import type { ResearchRequest, ResearchResult } from '@/types/research';

export async function createResearchRun(
  scope: DataScope,
  request: ResearchRequest,
  options: {
    aiSource: AiCredentialSource;
    template: OutputTemplateSnapshot;
    parentRunId?: string;
    version?: number;
    revisionInstruction?: string;
    revisionTarget?: RevisionTarget;
  },
): Promise<string> {
  if (scope.mode === 'legacy') return randomUUID();

  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope.userId]);
    const usage = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM research_runs
       WHERE created_by = $1 AND ai_source = $2 AND created_at >= date_trunc('day', now())`,
      [scope.userId, options.aiSource],
    );
    const limit = getResearchLimit(options.aiSource);
    if (Number(usage.rows[0]?.count ?? 0) >= limit) {
      const label = options.aiSource === 'platform' ? '平台模型' : options.aiSource === 'personal' ? '个人 Key' : '本地模式';
      throw new Error(`今天的${label}任务额度已用完（${limit} 次）。`);
    }

    const id = randomUUID();
    await client.query(
      `INSERT INTO research_runs
         (id, workspace_id, created_by, topic, requirements, status, request,
          parent_run_id, version, revision_instruction, revision_target, ai_source, template_snapshot)
       VALUES ($1, $2, $3, $4, $5, 'running', $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        id,
        scope.workspaceId,
        scope.userId,
        request.topic,
        request.requirements,
        JSON.stringify(request),
        options.parentRunId ?? null,
        options.version ?? 1,
        options.revisionInstruction ?? null,
        options.revisionTarget ?? null,
        options.aiSource,
        JSON.stringify(options.template),
      ],
    );
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completeResearchRun(
  scope: DataScope,
  result: ResearchResult,
): Promise<void> {
  if (scope.mode === 'legacy') return;
  await getDatabasePool().query(
    `UPDATE research_runs
     SET status = 'completed', result = $1::jsonb, completed_at = now(), error = NULL
     WHERE id = $2 AND workspace_id = $3`,
    [JSON.stringify(result), result.id, scope.workspaceId],
  );
}

export async function failResearchRun(
  scope: DataScope,
  id: string,
  error: string,
): Promise<void> {
  if (scope.mode === 'legacy') return;
  await getDatabasePool().query(
    `UPDATE research_runs
     SET status = 'failed', error = $1, completed_at = now()
     WHERE id = $2 AND workspace_id = $3`,
    [error.slice(0, 2000), id, scope.workspaceId],
  );
}

export async function listResearchRuns(scope: DataScope): Promise<ResearchRunSummary[]> {
  if (scope.mode === 'legacy') return [];
  const result = await getDatabasePool().query<{
    id: string;
    topic: string;
    status: ResearchRunStatus;
    result: ResearchResult | null;
    error: string | null;
    created_at: Date;
    completed_at: Date | null;
    parent_run_id: string | null;
    version: number;
    revision_instruction: string | null;
    revision_target: RevisionTarget | null;
    ai_source: AiCredentialSource;
    template_snapshot: OutputTemplateSnapshot | null;
  }>(
    `SELECT id, topic, status, result, error, created_at, completed_at,
            parent_run_id, version, revision_instruction, revision_target, ai_source, template_snapshot
     FROM research_runs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [scope.workspaceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    title: row.result?.title,
    status: row.status,
    paperCount: row.result?.papers.length ?? 0,
    evidenceCount: row.result?.evidence.length ?? 0,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    error: row.error ?? undefined,
    version: row.version,
    parentRunId: row.parent_run_id ?? undefined,
    revisionInstruction: row.revision_instruction ?? undefined,
    revisionTarget: row.revision_target ?? undefined,
    aiSource: row.ai_source,
    templateName: row.template_snapshot?.name,
  }));
}

export async function getResearchResult(
  scope: DataScope,
  id: string,
): Promise<ResearchResult | null> {
  if (scope.mode === 'legacy') return null;
  const result = await getDatabasePool().query<{ result: ResearchResult | null }>(
    'SELECT result FROM research_runs WHERE id = $1 AND workspace_id = $2',
    [id, scope.workspaceId],
  );
  return result.rows[0]?.result ?? null;
}

export async function deleteResearchRun(
  scope: DataScope,
  id: string,
): Promise<{ deleted: boolean; artifactStoragePaths: string[] }> {
  if (scope.mode === 'legacy') return { deleted: false, artifactStoragePaths: [] };

  const client = await getDatabasePool().connect();
  try {
    await client.query('BEGIN');
    const run = await client.query<{ id: string }>(
      'SELECT id FROM research_runs WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
      [id, scope.workspaceId],
    );
    if (!run.rowCount) {
      await client.query('ROLLBACK');
      return { deleted: false, artifactStoragePaths: [] };
    }

    const artifacts = await client.query<{ storage_path: string }>(
      'SELECT storage_path FROM artifacts WHERE run_id = $1 AND workspace_id = $2',
      [id, scope.workspaceId],
    );
    await client.query(
      'DELETE FROM research_runs WHERE id = $1 AND workspace_id = $2',
      [id, scope.workspaceId],
    );
    await client.query('COMMIT');
    return {
      deleted: true,
      artifactStoragePaths: artifacts.rows.map((artifact) => artifact.storage_path),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getWorkspaceStorageUsage(scope: DataScope): Promise<number> {
  if (scope.mode === 'legacy') return 0;
  const result = await getDatabasePool().query<{ total: string }>(
    `SELECT COALESCE(SUM(size_bytes), 0)::text AS total
     FROM (
       SELECT size_bytes FROM documents WHERE workspace_id = $1
       UNION ALL
       SELECT size_bytes FROM artifacts WHERE workspace_id = $1
     ) stored_files`,
    [scope.workspaceId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function hasWorkspaceStorageCapacity(
  scope: DataScope,
  incomingBytes: number,
): Promise<boolean> {
  if (scope.mode === 'legacy') return true;
  return (await getWorkspaceStorageUsage(scope)) + incomingBytes <= getWorkspaceStorageLimitBytes();
}

export async function createArtifactRecord(input: {
  scope: DataScope;
  runId: string;
  type: ArtifactType;
  fileName: string;
  storagePath: string;
  size: number;
  contentType: string;
}): Promise<void> {
  if (input.scope.mode === 'legacy') return;
  await getDatabasePool().query(
    `INSERT INTO artifacts (workspace_id, run_id, created_by, type, file_name, storage_path, size_bytes, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [input.scope.workspaceId, input.runId, input.scope.userId, input.type, input.fileName, input.storagePath, input.size, input.contentType],
  );
}

export async function listArtifacts(
  scope: DataScope,
  runId: string,
): Promise<ResearchArtifact[]> {
  if (scope.mode === 'legacy') return [];
  const result = await getDatabasePool().query<{
    id: string;
    run_id: string;
    type: ArtifactType;
    file_name: string;
    size_bytes: number;
    created_at: Date;
  }>(
    `SELECT id, run_id, type, file_name, size_bytes, created_at
     FROM artifacts WHERE workspace_id = $1 AND run_id = $2 ORDER BY created_at DESC`,
    [scope.workspaceId, runId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    type: row.type,
    fileName: row.file_name,
    size: row.size_bytes,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function getArtifactStorageRecord(
  scope: DataScope,
  id: string,
): Promise<{ storagePath: string; fileName: string; contentType: string } | null> {
  if (scope.mode === 'legacy') return null;
  const result = await getDatabasePool().query<{
    storage_path: string;
    file_name: string;
    mime_type: string;
  }>(
    'SELECT storage_path, file_name, mime_type FROM artifacts WHERE id = $1 AND workspace_id = $2',
    [id, scope.workspaceId],
  );
  const row = result.rows[0];
  return row ? {
    storagePath: row.storage_path,
    fileName: row.file_name,
    contentType: row.mime_type,
  } : null;
}
