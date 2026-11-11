import 'server-only';

import { randomUUID } from 'node:crypto';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { getDatabasePool } from '@/lib/db';
import { completeResearchRun, failResearchRun, getResearchResult } from '@/lib/repository';
import { runResearchAgent, refineResearchAgent } from '@/lib/research-agent';
import {
  claimNextResearchJob,
  completeResearchJob,
  failResearchJob,
  heartbeatResearchJob,
  isResearchJobActive,
  recoverInterruptedResearchJobs,
  updateResearchJob,
  type ClaimedResearchJob,
} from '@/lib/research-jobs';
import { getDatabaseUrl } from '@/lib/platform-config';
import { logError, logEvent } from '@/lib/observability';
import type { DataScope } from '@/types/platform';

const WORKER_ID = `research-${randomUUID()}`;
const POLL_INTERVAL_MS = 1_500;
const LOCK_KEY = 'research_copilot_research_worker';

function scopeFor(job: ClaimedResearchJob): DataScope {
  return { mode: 'cloud', userId: job.userId, workspaceId: job.workspaceId };
}

async function processJob(job: ClaimedResearchJob): Promise<void> {
  const scope = scopeFor(job);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const ai = await resolveAiRuntimeConfig(scope);
    heartbeat = setInterval(() => {
      void heartbeatResearchJob(job.id, job.workerToken).catch((error) => console.warn('Research job heartbeat failed.', error));
    }, 20_000);
    heartbeat.unref?.();

    if (job.kind === 'research' && job.payload.request) {
      await updateResearchJob(job.id, job.workerToken, 'researching', 20);
      const result = await runResearchAgent(job.payload.request, scope, job.runId, ai, job.templateSnapshot);
      if (!await isResearchJobActive(job.id, job.workerToken)) return;
      await completeResearchRun(scope, result);
    } else if (job.kind === 'refine' && job.payload.previousRunId && job.payload.instruction) {
      const previous = await getResearchResult(scope, job.payload.previousRunId);
      if (!previous) throw new Error('待修改的研究版本不存在。');
      await updateResearchJob(job.id, job.workerToken, 'revising', 20);
      const result = await refineResearchAgent({
        previous,
        instruction: job.payload.instruction,
        target: job.payload.target ?? 'all',
        runId: job.runId,
        ai,
        template: job.templateSnapshot,
      });
      if (!await isResearchJobActive(job.id, job.workerToken)) return;
      await completeResearchRun(scope, result);
    } else {
      throw new Error('研究任务参数不完整。');
    }
    await completeResearchJob(job.id, job.workerToken);
    logEvent('research.job.completed', { jobId: job.id, runId: job.runId, userId: job.userId, workspaceId: job.workspaceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '研究任务执行失败。';
    console.error(`Research job ${job.id} failed.`, error);
    await failResearchRun(scope, job.runId, message).catch(() => undefined);
    await failResearchJob(job.id, job.workerToken, message).catch(() => undefined);
    logError('research.job.failed', error, { jobId: job.id, runId: job.runId, userId: job.userId, workspaceId: job.workspaceId });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

async function withWorkerLock<T>(callback: () => Promise<T>): Promise<T | null> {
  const client = await getDatabasePool().connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [LOCK_KEY],
    );
    if (!lock.rows[0]?.locked) return null;
    try {
      return await callback();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

async function drain(): Promise<void> {
  for (;;) {
    const processed = await withWorkerLock(async () => {
      const job = await claimNextResearchJob(WORKER_ID);
      if (!job) return false;
      await processJob(job);
      return true;
    });
    if (processed === null || !processed) return;
  }
}

export async function startResearchWorker(): Promise<void> {
  if (!getDatabaseUrl()) return;
  await recoverInterruptedResearchJobs().catch((error) => console.error('Could not recover research jobs.', error));
  const tick = async () => {
    try { await drain(); } catch (error) { console.error('Research worker poll failed.', error); }
    setTimeout(() => void tick(), POLL_INTERVAL_MS);
  };
  await tick();
}
