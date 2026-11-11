import { describe, expect, it } from 'vitest';

import type { ResearchJob } from '@/types/research-job';

function job(overrides: Partial<ResearchJob> = {}): ResearchJob {
  return {
    id: 'job-1', runId: 'run-1', kind: 'research', status: 'queued', stage: 'queued', progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  };
}

describe('research jobs', () => {
  it('tracks queued and running stages', () => {
    expect(job({ status: 'queued' }).progress).toBe(0);
    expect(job({ status: 'running', stage: 'researching', progress: 40 }).progress).toBe(40);
  });

  it('supports terminal failed and completed states', () => {
    expect(job({ status: 'completed', progress: 100 }).status).toBe('completed');
    expect(job({ status: 'failed', error: '模型调用失败' }).error).toBe('模型调用失败');
  });
});
