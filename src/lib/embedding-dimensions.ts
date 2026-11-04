export const VECTOR_STORAGE_DIMENSIONS = 512;

export const SUPPORTED_EMBEDDING_DIMENSIONS = [256, 384, 512, 1024, 1536, 2048] as const;

export type SupportedEmbeddingDimension = (typeof SUPPORTED_EMBEDDING_DIMENSIONS)[number];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isZhipuBaseUrl(baseURL: string): boolean {
  return /bigmodel\.cn/i.test(baseURL);
}

export function inferEmbeddingDimensions(model: string, baseURL = '', requested?: number): number {
  const m = normalize(model);
  if (m === 'local-hash-v1') return VECTOR_STORAGE_DIMENSIONS;
  if (m === 'embedding-3') return 512;
  if (m === 'embedding-2') return 1024;
  if (m.includes('jina')) return 384;
  if (isZhipuBaseUrl(baseURL) && m.includes('embedding')) return 512;
  if (
    typeof requested === 'number'
    && SUPPORTED_EMBEDDING_DIMENSIONS.includes(requested as SupportedEmbeddingDimension)
    && requested <= VECTOR_STORAGE_DIMENSIONS
  ) {
    return requested;
  }
  return VECTOR_STORAGE_DIMENSIONS;
}

export function toStorageVector(vector: number[]): number[] {
  if (vector.length === VECTOR_STORAGE_DIMENSIONS) return vector;
  if (vector.length > VECTOR_STORAGE_DIMENSIONS) {
    throw new Error(
      `Embedding 返回了 ${vector.length} 维向量，云端当前按 ${VECTOR_STORAGE_DIMENSIONS} 维存储。智谱请使用 embedding-3，维度会自动设为 512。`,
    );
  }
  return vector.concat(new Array(VECTOR_STORAGE_DIMENSIONS - vector.length).fill(0));
}
