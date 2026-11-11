import { inferEmbeddingDimensions } from '@/lib/embedding-dimensions';
import type { AiCredentialSource, AiRuntimeConfig } from '@/types/platform';

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim();
}

export function isHostedPlatformConfigured(): boolean {
  return Boolean(getDatabaseUrl() && (process.env.AUTH_SECRET?.trim().length ?? 0) >= 32);
}

export function getEmbeddingDimensions(): number {
  const parsed = Number(process.env.EMBEDDING_DIMENSIONS ?? 512);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('EMBEDDING_DIMENSIONS 必须是正整数。');
  }
  return parsed;
}

export function getEmbeddingIdentity(): { model: string; dimensions: number } {
  const ai = getPlatformAiRuntimeConfig();
  return {
    model: ai.embeddingIdentity,
    dimensions: ai.embeddingDimensions,
  };
}

export function getAiAccessMode(): 'hybrid' | 'byok' | 'platform' {
  const value = process.env.AI_ACCESS_MODE?.trim().toLowerCase();
  return value === 'byok' || value === 'platform' ? value : 'hybrid';
}

export function createEmbeddingIdentity(baseURL: string, model: string): string {
  if (model === 'local-hash-v1') return 'local-hash-v1';
  return 'provider:' + baseURL.replace(/\/+$/, '') + '|' + model;
}

export function getPlatformAiRuntimeConfig(): AiRuntimeConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseURL = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const configuredEmbeddingBaseURL = (process.env.EMBEDDING_BASE_URL?.trim() || baseURL).replace(/\/+$/, '');
  const embeddingApiKey = process.env.EMBEDDING_API_KEY?.trim()
    || (configuredEmbeddingBaseURL === baseURL ? apiKey : undefined);
  const configuredEmbeddingModel = process.env.EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
  const embeddingModel = embeddingApiKey ? configuredEmbeddingModel : 'local-hash-v1';
  const embeddingDimensions = inferEmbeddingDimensions(
    embeddingModel,
    configuredEmbeddingBaseURL,
    getEmbeddingDimensions(),
  );
  return {
    source: apiKey ? 'platform' : 'local',
    apiKey: apiKey || undefined,
    baseURL,
    chatModel: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    embeddingApiKey,
    embeddingBaseURL: configuredEmbeddingBaseURL,
    embeddingModel,
    embeddingDimensions,
    embeddingIdentity: embeddingApiKey
      ? createEmbeddingIdentity(configuredEmbeddingBaseURL, embeddingModel)
      : 'local-hash-v1',
  };
}

export function getDailyResearchLimit(): number {
  // Daily task-count quotas are disabled. Keep the helper for configuration
  // compatibility without enforcing a request limit.
  return 0;
}

export function isResearchQuotaUnlimited(_source: AiCredentialSource): boolean {
  return true;
}

export function getResearchLimit(_source: AiCredentialSource): number {
  return 0;
}

export function getWorkspaceStorageLimitBytes(): number {
  const parsed = Number(process.env.WORKSPACE_STORAGE_LIMIT_MB ?? 2048);
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : 2048;
  return Math.floor(megabytes * 1024 * 1024);
}
