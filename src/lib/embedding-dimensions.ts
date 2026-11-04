export const HASH_EMBEDDING_DIMENSIONS = 512;
export const MIN_EMBEDDING_DIMENSIONS = 32;
export const MAX_EMBEDDING_DIMENSIONS = 4096;

export function isZhipuBaseUrl(baseURL: string): boolean {
  return /bigmodel\.cn/i.test(baseURL);
}

export function assertEmbeddingDimensions(dimensions: number): number {
  if (!Number.isInteger(dimensions) || dimensions < MIN_EMBEDDING_DIMENSIONS || dimensions > MAX_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding 维度 ${dimensions} 超出可用范围（${MIN_EMBEDDING_DIMENSIONS}–${MAX_EMBEDDING_DIMENSIONS}）。`,
    );
  }
  return dimensions;
}

export function inferEmbeddingDimensions(model: string, _baseURL = '', requested?: number): number {
  const m = model.trim().toLowerCase();
  if (m === 'local-hash-v1') return HASH_EMBEDDING_DIMENSIONS;
  if (typeof requested === 'number') return assertEmbeddingDimensions(requested);
  return HASH_EMBEDDING_DIMENSIONS;
}

export function normalizeEmbeddingBatch(vectors: number[][]): number[][] {
  if (!vectors.length) return [];
  const dimensions = assertEmbeddingDimensions(vectors[0]?.length ?? 0);
  if (vectors.some((vector) => vector.length !== dimensions)) {
    throw new Error('同一批 Embedding 结果的维度不一致。');
  }
  return vectors;
}
