import OpenAI from "openai";

import { getEmbeddingIdentity } from "@/lib/platform-config";
import { hashEmbedding } from "@/lib/text";

function createOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const embedding = getEmbeddingIdentity();
  const client = createOpenAIClient();

  if (!client) return texts.map((text) => hashEmbedding(text, embedding.dimensions));

  try {
    const response = await client.embeddings.create({
      model: embedding.model,
      input: texts,
      dimensions: embedding.dimensions,
    });
    const vectors = response.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== embedding.dimensions)) {
      throw new Error('Embedding 服务返回了数量或维度不匹配的向量。');
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
