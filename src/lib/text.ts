const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function tokenize(value: string): string[] {
  return (value.toLowerCase().match(TOKEN_PATTERN) ?? []).filter(
    (token) => token.length > 1,
  );
}

export function chunkText(
  input: string,
  options: { maxChars?: number; overlap?: number } = {},
): string[] {
  const maxChars = options.maxChars ?? 1200;
  const overlap = Math.min(options.overlap ?? 180, Math.floor(maxChars / 3));
  const text = input.replace(/\r\n/g, "\n").trim();

  if (!text) return [];

  const paragraphs = text
    .split(/\n{2,}/)
    .map(normalizeWhitespace)
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const normalized = normalizeWhitespace(current);
    if (normalized) chunks.push(normalized);
    current = normalized.slice(Math.max(0, normalized.length - overlap));
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) flush();
      for (let start = 0; start < paragraph.length; start += maxChars - overlap) {
        chunks.push(paragraph.slice(start, start + maxChars));
      }
      current = "";
      continue;
    }

    const candidate = current ? `${current}\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current) flush();
    current = current ? `${current}\n${paragraph}` : paragraph;
  }

  if (current) {
    const normalized = normalizeWhitespace(current);
    if (normalized && normalized !== chunks.at(-1)) chunks.push(normalized);
  }

  return chunks;
}

export function hashEmbedding(text: string, dimensions = 384): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = Math.abs(hash) % dimensions;
    const sign = hash & 1 ? 1 : -1;
    vector[bucket] += sign * (1 + Math.log(1 + token.length));
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function excerpt(value: string, maxLength = 260): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}
