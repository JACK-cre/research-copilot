import { describe, expect, it } from 'vitest';

import type { IngestionJob } from '@/types/ingestion';

function job(overrides: Partial<IngestionJob> = {}): IngestionJob {
  return {
    id: 'job-1',
    documentId: 'doc-1',
    fileName: 'paper.pdf',
    mimeType: 'application/pdf',
    size: 100,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    chunkCount: 0,
    attempts: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ingestion job model', () => {
  it('tracks progress and terminal states independently', () => {
    expect(job({ status: 'processing', stage: 'vectorizing', progress: 60 }).progress).toBe(60);
    expect(job({ status: 'ready', stage: 'ready', progress: 100 }).status).toBe('ready');
    expect(job({ status: 'failed', stage: 'failed', error: '解析失败' }).error).toBe('解析失败');
  });

  it('retains the source file identity for restart recovery', () => {
    const interrupted = job({ status: 'processing', attempts: 1 });
    expect(interrupted.documentId).toBe('doc-1');
    expect(interrupted.fileName).toBe('paper.pdf');
  });
});
