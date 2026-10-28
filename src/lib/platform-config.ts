import type { AiCredentialSource, AiRuntimeConfig } from '@/types/platform';

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim();
}

export function isHostedPlatformConfigured(): boolean {
  return Boolean(getDatabaseUrl() && (process.env.AUTH_SECRET?.trim().length ?? 0) >= 32);
}

export function getEmbeddingDimensions(): number {
  const parsed = Number(process.env.EMBEDDING_DIMENSIONS ?? 384);
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
  const embeddingDimensions = getEmbeddingDimensions();
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
  const parsed = Number(process.env.DAILY_RESEARCH_LIMIT ?? 20);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 20;
}

export function getResearchLimit(source: AiCredentialSource): number {
  if (source === 'platform') return getDailyResearchLimit();
  const variable = source === 'personal' ? 'DAILY_BYOK_RESEARCH_LIMIT' : 'DAILY_LOCAL_RESEARCH_LIMIT';
  const fallback = source === 'personal' ? 100 : 50;
  const parsed = Number(process.env[variable] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getWorkspaceStorageLimitBytes(): number {
  const parsed = Number(process.env.WORKSPACE_STORAGE_LIMIT_MB ?? 250);
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
  return Math.floor(megabytes * 1024 * 1024);
}
