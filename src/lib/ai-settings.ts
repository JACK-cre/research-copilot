import 'server-only';

import { isIP } from 'node:net';

import { getDatabasePool } from '@/lib/db';
import {
  createEmbeddingIdentity,
  getAiAccessMode,
  getPlatformAiRuntimeConfig,
  getResearchLimit,
} from '@/lib/platform-config';
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto';
import type { AiRuntimeConfig, AiSettingsSummary, DataScope } from '@/types/platform';

interface StoredAiSettings {
  encrypted_api_key: string;
  base_url: string;
  chat_model: string;
  encrypted_embedding_api_key: string | null;
  embedding_base_url: string | null;
  embedding_model: string;
  embedding_dimensions: number;
}

export interface SaveAiSettingsInput {
  apiKey?: string;
  baseURL: string;
  chatModel: string;
  embeddingApiKey?: string;
  embeddingBaseURL: string;
  embeddingModel: string;
  embeddingDimensions: number;
}

function isPrivateAddress(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (isIP(host) === 4) {
    const [first, second] = host.split('.').map(Number);
    return first === 0
      || first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 100 && second >= 64 && second <= 127);
  }
  if (isIP(host) === 6) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/.test(host);
  }
  return false;
}

function normalizeProviderBaseUrl(value: string): string {
  const url = new URL(value);
  const localDevelopment = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (!localDevelopment && url.protocol !== 'https:') {
    throw new Error('生产环境的 AI Base URL 必须使用 HTTPS。');
  }
  if (!localDevelopment && isPrivateAddress(url.hostname)) {
    throw new Error('AI Base URL 不能指向本地或私有网络地址。');
  }
  return value.replace(/\/+$/, '');
}

async function readStoredSettings(scope: DataScope): Promise<StoredAiSettings | null> {
  if (scope.mode !== 'cloud') return null;
  const result = await getDatabasePool().query<StoredAiSettings>(
    `SELECT encrypted_api_key, base_url, chat_model, encrypted_embedding_api_key,
            embedding_base_url, embedding_model, embedding_dimensions
     FROM user_ai_settings WHERE user_id = $1`,
    [scope.userId],
  );
  return result.rows[0] ?? null;
}

function personalRuntimeConfig(settings: StoredAiSettings): AiRuntimeConfig {
  const baseURL = settings.base_url.replace(/\/+$/, '');
  const chatApiKey = decryptSecret(settings.encrypted_api_key);
  const embeddingBaseURL = (settings.embedding_base_url || baseURL).replace(/\/+$/, '');
  const embeddingApiKey = settings.embedding_model === 'local-hash-v1'
    ? undefined
    : settings.encrypted_embedding_api_key
      ? decryptSecret(settings.encrypted_embedding_api_key)
      : embeddingBaseURL === baseURL ? chatApiKey : undefined;
  return {
    source: 'personal',
    apiKey: chatApiKey,
    baseURL,
    chatModel: settings.chat_model,
    embeddingApiKey,
    embeddingBaseURL,
    embeddingModel: settings.embedding_model,
    embeddingDimensions: settings.embedding_dimensions,
    embeddingIdentity: createEmbeddingIdentity(embeddingBaseURL, settings.embedding_model),
  };
}

export async function resolveAiRuntimeConfig(scope?: DataScope): Promise<AiRuntimeConfig> {
  const mode = getAiAccessMode();
  const stored = scope?.mode === 'cloud' ? await readStoredSettings(scope) : null;
  if (mode !== 'platform' && stored) return personalRuntimeConfig(stored);
  if (mode !== 'byok') return getPlatformAiRuntimeConfig();
  return {
    ...getPlatformAiRuntimeConfig(),
    source: 'local',
    apiKey: undefined,
    embeddingApiKey: undefined,
    embeddingModel: 'local-hash-v1',
    embeddingIdentity: 'local-hash-v1',
  };
}

export async function getAiSettingsSummary(scope: DataScope): Promise<AiSettingsSummary> {
  const stored = await readStoredSettings(scope);
  const active = await resolveAiRuntimeConfig(scope);
  const fallback = stored ?? {
    base_url: active.baseURL,
    chat_model: active.chatModel,
    encrypted_embedding_api_key: null,
    embedding_base_url: active.embeddingBaseURL,
    embedding_model: active.embeddingModel,
    embedding_dimensions: active.embeddingDimensions,
  };
  const usage = scope.mode === 'cloud'
    ? await getDatabasePool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM research_runs
       WHERE created_by = $1 AND ai_source = $2 AND created_at >= date_trunc('day', now())`,
      [scope.userId, active.source],
    )
    : undefined;
  return {
    accessMode: getAiAccessMode(),
    activeSource: active.source,
    hasPersonalKey: Boolean(stored),
    baseURL: fallback.base_url,
    chatModel: fallback.chat_model,
    hasEmbeddingKey: fallback.embedding_model !== 'local-hash-v1' && (
      Boolean(stored?.encrypted_embedding_api_key)
      || (fallback.embedding_base_url === fallback.base_url && Boolean(stored))
    ),
    embeddingBaseURL: fallback.embedding_base_url || fallback.base_url,
    embeddingModel: fallback.embedding_model,
    embeddingDimensions: fallback.embedding_dimensions,
    dailyLimit: getResearchLimit(active.source),
    usedToday: Number(usage?.rows[0]?.count ?? 0),
  };
}

export async function saveAiSettings(scope: DataScope, input: SaveAiSettingsInput): Promise<void> {
  if (scope.mode !== 'cloud') throw new Error('个人 AI 配置仅在私有云模式可用。');
  const current = await readStoredSettings(scope);
  const encryptedApiKey = input.apiKey?.trim()
    ? encryptSecret(input.apiKey.trim())
    : current?.encrypted_api_key;
  if (!encryptedApiKey) throw new Error('首次配置时必须填写 API Key。');
  const baseURL = normalizeProviderBaseUrl(input.baseURL);
  const embeddingBaseURL = normalizeProviderBaseUrl(input.embeddingBaseURL);
  const encryptedEmbeddingApiKey = input.embeddingModel === 'local-hash-v1'
    ? null
    : input.embeddingApiKey?.trim()
      ? encryptSecret(input.embeddingApiKey.trim())
      : current?.encrypted_embedding_api_key
        ?? (embeddingBaseURL === baseURL ? encryptedApiKey : null);
  if (input.embeddingModel !== 'local-hash-v1' && !encryptedEmbeddingApiKey) {
    throw new Error('使用语义向量服务时必须填写 Embedding API Key。');
  }
  await getDatabasePool().query(
    `INSERT INTO user_ai_settings
       (user_id, encrypted_api_key, base_url, chat_model, encrypted_embedding_api_key,
        embedding_base_url, embedding_model, embedding_dimensions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       encrypted_api_key = EXCLUDED.encrypted_api_key,
       base_url = EXCLUDED.base_url,
       chat_model = EXCLUDED.chat_model,
       encrypted_embedding_api_key = EXCLUDED.encrypted_embedding_api_key,
       embedding_base_url = EXCLUDED.embedding_base_url,
       embedding_model = EXCLUDED.embedding_model,
       embedding_dimensions = EXCLUDED.embedding_dimensions`,
    [
      scope.userId,
      encryptedApiKey,
      baseURL,
      input.chatModel,
      encryptedEmbeddingApiKey,
      embeddingBaseURL,
      input.embeddingModel,
      input.embeddingDimensions,
    ],
  );
}

export async function deleteAiSettings(scope: DataScope): Promise<void> {
  if (scope.mode !== 'cloud') return;
  await getDatabasePool().query('DELETE FROM user_ai_settings WHERE user_id = $1', [scope.userId]);
}
