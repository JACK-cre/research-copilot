import type { ResearchRequest } from '@/types/research';

export type ResearchJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ResearchJobKind = 'research' | 'refine';

export interface ResearchJob {
  id: string;
  runId: string;
  kind: ResearchJobKind;
  status: ResearchJobStatus;
  stage: string;
  progress: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchJobPayload {
  request?: ResearchRequest;
  previousRunId?: string;
  instruction?: string;
  target?: 'all' | 'report' | 'slides';
}
