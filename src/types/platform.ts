export type PlatformMode = 'cloud' | 'legacy';

export interface DataScope {
  mode: PlatformMode;
  userId: string;
  workspaceId: string;
}

export type ResearchRunStatus = 'running' | 'completed' | 'failed';

export interface ResearchRunSummary {
  id: string;
  topic: string;
  title?: string;
  status: ResearchRunStatus;
  paperCount: number;
  evidenceCount: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export type ArtifactType = 'markdown' | 'pptx';

export interface ResearchArtifact {
  id: string;
  runId: string;
  type: ArtifactType;
  fileName: string;
  size: number;
  createdAt: string;
}
