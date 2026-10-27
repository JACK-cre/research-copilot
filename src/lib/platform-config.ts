import type { AiCredentialSource, AiRuntimeConfig } from '@/types/platform';

const publicSupabaseVariables = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

const privateSupabaseVariables = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DATABASE_URL',
] as const;

function hasValues(names: readonly string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export function isSupabasePublicConfigured(): boolean {
  return hasValues(publicSupabaseVariables);
}

export function isCloudPlatformConfigured(): boolean {
  return isSupabasePublicConfigured() && hasValues(privateSupabaseVariables);
}

export function getSupabasePublicConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error('Supabase public configuration is incomplete.');
  return { url, anonKey };
}

export function getDatabaseUrl(): string | undefined {
  return process.env.SUPABASE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
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
  return 'provider:' + baseURL.replace(/\/+$/, '') + '|' + model;
}

export function getPlatformAiRuntimeConfig(): AiRuntimeConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseURL = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const embeddingModel = process.env.EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
  const embeddingDimensions = getEmbeddingDimensions();
  return {
    source: apiKey ? 'platform' : 'local',
    apiKey: apiKey || undefined,
    baseURL,
    chatModel: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    embeddingModel: apiKey ? embeddingModel : 'local-hash-v1',
    embeddingDimensions,
    embeddingIdentity: apiKey
      ? createEmbeddingIdentity(baseURL, embeddingModel)
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
