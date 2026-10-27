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
  return {
    model: process.env.OPENAI_API_KEY
      ? process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
      : 'local-hash-v1',
    dimensions: getEmbeddingDimensions(),
  };
}

export function getDailyResearchLimit(): number {
  const parsed = Number(process.env.DAILY_RESEARCH_LIMIT ?? 20);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 20;
}

export function getWorkspaceStorageLimitBytes(): number {
  const parsed = Number(process.env.WORKSPACE_STORAGE_LIMIT_MB ?? 250);
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
  return Math.floor(megabytes * 1024 * 1024);
}
