export type IngestionJobStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'cancelled';
export type IngestionJobStage = 'queued' | 'reading' | 'extracting' | 'vectorizing' | 'saving' | 'ready' | 'failed';

export interface IngestionJob {
  id: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: IngestionJobStatus;
  stage: IngestionJobStage;
  progress: number;
  chunkCount: number;
  error?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}
