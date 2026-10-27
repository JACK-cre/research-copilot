export type PlatformMode = 'cloud' | 'legacy';

export interface DataScope {
  mode: PlatformMode;
  userId: string;
  workspaceId: string;
}

export type AiCredentialSource = 'personal' | 'platform' | 'local';

export interface AiRuntimeConfig {
  source: AiCredentialSource;
  apiKey?: string;
  baseURL: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingIdentity: string;
}

export interface AiSettingsSummary {
  accessMode: 'hybrid' | 'byok' | 'platform';
  activeSource: AiCredentialSource;
  hasPersonalKey: boolean;
  baseURL: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  dailyLimit: number;
  usedToday: number;
}

export type TemplateKind = 'report' | 'presentation' | 'both';

export interface OutputTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  description: string;
  school?: string;
  citationStyle: string;
  instructions: string;
  isDefault: boolean;
  createdAt?: string;
}

export type OutputTemplateSnapshot = Omit<OutputTemplate, 'createdAt'>;

export type RevisionTarget = 'all' | 'report' | 'slides';

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
  version: number;
  parentRunId?: string;
  revisionInstruction?: string;
  revisionTarget?: RevisionTarget;
  aiSource?: AiCredentialSource;
  templateName?: string;
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
