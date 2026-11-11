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
  embeddingApiKey?: string;
  embeddingBaseURL: string;
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
  hasEmbeddingKey: boolean;
  embeddingBaseURL: string;
  embeddingModel: string;
  embeddingDimensions: number;
}

export type TemplateKind = 'report' | 'presentation' | 'both';

export interface TemplateSectionBlueprint {
  id: string;
  title: string;
  purpose: string;
}

export type TemplateSlideElementType = 'text' | 'image' | 'shape';

export interface TemplateSlideElement {
  id: string;
  type: TemplateSlideElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fill?: string;
  stroke?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  align?: 'left' | 'center' | 'right';
  shape?: 'rect' | 'roundRect' | 'ellipse' | 'line' | 'triangle' | 'other';
  imageDataUrl?: string;
  imageStoragePath?: string;
  zIndex: number;
}

export interface TemplateSlideBlueprint {
  id: string;
  title: string;
  purpose: string;
  layout: 'title' | 'thesis' | 'landscape' | 'comparison' | 'evidence' | 'roadmap' | 'conclusion';
  background?: string;
  elements?: TemplateSlideElement[];
  source?: 'uploaded-pptx' | 'generated';
}

export interface DocumentPagePreview {
  index: number;
  title: string;
  text: string;
}

export interface TemplateBlueprint {
  sections: TemplateSectionBlueprint[];
  slides: TemplateSlideBlueprint[];
  documentPages?: DocumentPagePreview[];
  style: {
    citationStyle: string;
    headingScheme: 'numeric' | 'chinese' | 'plain';
    reportWords?: number;
    slideCount?: number;
    tone: string;
    accentColor: string;
    fontFamily: string;
    slideWidth?: number;
    slideHeight?: number;
  };
}

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
  paperSourceName?: string;
  slidesSourceName?: string;
  blueprint?: TemplateBlueprint;
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

export interface StudyToolTrace {
  name: string;
  summary: string;
}

export interface StudyCitation {
  id: string;
  title: string;
  url?: string;
}

export interface StudyMessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  storagePath: string;
  size: number;
}

export interface StudyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: StudyCitation[];
  toolTrace: StudyToolTrace[];
  attachments: StudyMessageAttachment[];
  createdAt: string;
}

export interface StudyConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  hasMemory?: boolean;
}

export interface StudyConversationDetail {
  id: string;
  title: string;
  memorySummary: string;
  messages: StudyMessage[];
}
