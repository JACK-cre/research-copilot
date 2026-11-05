import OpenAI from "openai";

import { inferEmbeddingDimensions, normalizeEmbeddingBatch } from "@/lib/embedding-dimensions";
import { getPlatformAiRuntimeConfig } from "@/lib/platform-config";
import { withExponentialRetry } from "@/lib/retry";
import { hashEmbedding } from "@/lib/text";
import type { AiRuntimeConfig } from "@/types/platform";

export const DEFAULT_EMBEDDING_INPUT_BATCH_SIZE = 64;
export const SILICONFLOW_EMBEDDING_INPUT_BATCH_SIZE = 32;

function createOpenAIClient(config: AiRuntimeConfig): OpenAI | null {
  if (!config.embeddingApiKey || config.embeddingModel === 'local-hash-v1') return null;
  return new OpenAI({
    apiKey: config.embeddingApiKey,
    baseURL: config.embeddingBaseURL,
  });
}

export function embeddingInputBatchSize(baseURL = ''): number {
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    if (host.includes('siliconflow')) return SILICONFLOW_EMBEDDING_INPUT_BATCH_SIZE;
  } catch {
    // Keep the conservative default when the URL is not absolute.
  }
  return DEFAULT_EMBEDDING_INPUT_BATCH_SIZE;
}

export function splitIntoBatches<T>(items: T[], size: number): T[][] {
  const batchSize = Math.max(1, Math.floor(size));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

export async function embedTexts(
  texts: string[],
  config: AiRuntimeConfig = getPlatformAiRuntimeConfig(),
): Promise<number[][]> {
  if (!texts.length) return [];
  const client = createOpenAIClient(config);
  const hashDimensions = inferEmbeddingDimensions(config.embeddingModel, config.embeddingBaseURL, config.embeddingDimensions);

  if (!client) return texts.map((text) => hashEmbedding(text, hashDimensions));

  const batches = splitIntoBatches(texts, embeddingInputBatchSize(config.embeddingBaseURL));
  const vectors: number[][] = [];

  try {
    for (const batch of batches) {
      const response = await withExponentialRetry(() => client.embeddings.create({
        model: config.embeddingModel,
        input: batch,
      }));
      const batchVectors = response.data
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);
      if (batchVectors.length !== batch.length) {
        throw new Error('Embedding 服务返回的向量数量与文本数量不一致。');
      }
      vectors.push(...batchVectors);
    }
    return normalizeEmbeddingBatch(vectors);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知错误';
    throw new Error('Embedding 服务调用失败，请检查模型、额度和网络配置：' + detail);
  }
}

export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}

export async function embedTextWithConfig(text: string, config: AiRuntimeConfig): Promise<number[]> {
  return (await embedTexts([text], config))[0];
}
