import 'server-only';

import { randomUUID } from 'node:crypto';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { readStoredObjectBytes } from '@/lib/cloud-storage';
import { parseUploadBytes } from '@/lib/documents';
import {
  claimNextIngestionJob,
  completeIngestionJob,
  failIngestionJob,
  heartbeatIngestionJob,
  isIngestionJobActive,
  recoverInterruptedIngestionJobs,
  updateIngestionJobProgress,
  type ClaimedIngestionJob,
} from '@/lib/ingestion-jobs';
import { getDatabasePool } from '@/lib/db';
import { getDatabaseUrl } from '@/lib/platform-config';
import { getVectorStore } from '@/lib/vector-store';
import type { DataScope } from '@/types/platform';

const WORKER_ID = `ingestion-${randomUUID()}`;
const POLL_INTERVAL_MS = 1_500;
const LOCK_KEY = 'research_copilot_ingestion_worker';

type WorkerGlobal = typeof globalThis & {
  __researchCopilotIngestionWorker?: {
    timer?: ReturnType<typeof setTimeout>;
    running: boolean;
    started: boolean;
  };
};

function workerState() {
  const globalWorker = globalThis as WorkerGlobal;
  if (!globalWorker.__researchCopilotIngestionWorker) {
    globalWorker.__researchCopilotIngestionWorker = { running: false, started: false };
  }
  return globalWorker.__researchCopilotIngestionWorker;
}

function scopeFor(job: ClaimedIngestionJob): DataScope {
  return {
    mode: 'cloud',
    userId: job.userId,
    workspaceId: job.workspaceId,
  };
}

async function processJob(job: ClaimedIngestionJob): Promise<void> {
  const scope = scopeFor(job);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    await updateIngestionJobProgress(job.id, job.workerToken, 'reading', 8);
    heartbeat = setInterval(() => {
      void heartbeatIngestionJob(job.id, job.workerToken).catch((error) => {
        console.warn(`Could not heartbeat ingestion job ${job.id}.`, error);
      });
    }, 20_000);
    heartbeat.unref?.();
    const bytes = await readStoredObjectBytes(scope, job.storagePath);
    const ai = await resolveAiRuntimeConfig(scope);
    const parsed = await parseUploadBytes({
      name: job.fileName,
      mimeType: job.mimeType,
      bytes,
      documentId: job.documentId,
      storagePath: job.storagePath,
      ai,
      onProgress: (stage, progress) => updateIngestionJobProgress(job.id, job.workerToken, stage, progress),
    });
    if (!await isIngestionJobActive(job.id, job.workerToken)) return;
    await updateIngestionJobProgress(job.id, job.workerToken, 'saving', 92);
    await getVectorStore().saveDocument(parsed.document, parsed.chunks, scope);
    if (!await isIngestionJobActive(job.id, job.workerToken)) {
      await getVectorStore().deleteDocument(job.documentId, scope).catch(() => undefined);
      return;
    }
    await completeIngestionJob(job.id, job.workerToken, parsed.document.chunkCount);
  } catch (error) {
    const message = error instanceof Error ? error.message : '资料解析失败。';
    console.error(`Document ingestion job ${job.id} failed.`, error);
    await failIngestionJob(job.id, job.workerToken, message).catch((updateError) => {
      console.error(`Could not mark ingestion job ${job.id} as failed.`, updateError);
    });
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

async function drainJobs(): Promise<void> {
  for (;;) {
    // Claim and process one job while holding the singleton lock. This avoids
    // two Next.js workers processing the same document on a multi-core host.
    const processed = await withWorkerLock(async () => {
      const job = await claimNextIngestionJob(WORKER_ID);
      if (!job) return false;
      await processJob(job);
      return true;
    });
    if (processed === null || !processed) return;
  }
}

function scheduleNext(state: ReturnType<typeof workerState>): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  state.timer.unref?.();
}

async function tick(): Promise<void> {
  const state = workerState();
  if (state.running) return;
  state.running = true;
  try {
    await drainJobs();
  } catch (error) {
    console.error('Document ingestion worker poll failed.', error);
  } finally {
    state.running = false;
    if (state.started) scheduleNext(state);
  }
}

export async function startStandaloneIngestionWorker(): Promise<void> {
  await startIngestionWorker();
  // Keep the dedicated worker process alive even when the queue is empty.
  await new Promise<void>(() => undefined);
}

export async function startIngestionWorker(): Promise<void> {
  if (!getDatabaseUrl()) return;
  const state = workerState();
  if (state.started) return;
  state.started = true;
  try {
    const recovered = await recoverInterruptedIngestionJobs();
    if (recovered) console.log(`Recovered ${recovered} interrupted ingestion job(s).`);
  } catch (error) {
    console.error('Could not recover interrupted ingestion jobs.', error);
  }
  await tick();
}
