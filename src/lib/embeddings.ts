import OpenAI from "openai";

import { getPlatformAiRuntimeConfig } from "@/lib/platform-config";
import { hashEmbedding } from "@/lib/text";
import type { AiRuntimeConfig } from "@/types/platform";

function createOpenAIClient(config: AiRuntimeConfig): OpenAI | null {
  if (!config.embeddingApiKey || config.embeddingModel === 'local-hash-v1') return null;
  return new OpenAI({
    apiKey: config.embeddingApiKey,
    baseURL: config.embeddingBaseURL,
  });
}

export async function embedTexts(
  texts: string[],
  config: AiRuntimeConfig = getPlatformAiRuntimeConfig(),
): Promise<number[][]> {
  if (!texts.length) return [];
  const client = createOpenAIClient(config);

  if (!client) return texts.map((text) => hashEmbedding(text, config.embeddingDimensions));

  try {
    const response = await client.embeddings.create({
      model: config.embeddingModel,
      input: texts,
      dimensions: config.embeddingDimensions,
    });
    const vectors = response.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
    const actual = vectors[0]?.length;
    if (vectors.length !== texts.length) {
      throw new Error('Embedding 服务返回的向量数量与文本数量不一致。');
    }
    if (vectors.some((vector) => vector.length !== config.embeddingDimensions)) {
      throw new Error(
        `服务返回了 ${actual ?? 0} 维向量，当前配置需要 ${config.embeddingDimensions} 维。智谱 embedding-3 仅支持 256/512/1024/2048，本项目使用 512。`,
      );
    }
    return vectors;
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
