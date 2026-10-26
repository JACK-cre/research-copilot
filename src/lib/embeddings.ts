import OpenAI from "openai";

import { hashEmbedding } from "@/lib/text";

const dimensions = Number(process.env.EMBEDDING_DIMENSIONS ?? 384);

function createOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

export function getEmbeddingDimensions(): number {
  return dimensions;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const client = createOpenAIClient();

  if (!client) return texts.map((text) => hashEmbedding(text, dimensions));

  try {
    const response = await client.embeddings.create({
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: texts,
      dimensions,
    });
    return response.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  } catch (error) {
    console.warn("Embedding provider failed; using local hashing vectors.", error);
    return texts.map((text) => hashEmbedding(text, dimensions));
  }
}

export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}
