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
  const maxChars = Math.max(1, options.maxChars ?? 1200);
  const overlap = Math.max(0, Math.min(options.overlap ?? 180, Math.floor(maxChars / 3)));
  const text = input.replace(/\r\n?/g, '\n').trim();
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    const window = text.slice(start, start + maxChars);
    let end = window.length;
    let carry = 0;
    if (start + end < text.length) {
      // Prefer a paragraph, then a sentence. Only overlap forced splits of unbroken text.
      const floor = Math.floor(maxChars * 0.45);
      const paragraph = window.lastIndexOf('\n');
      const sentence = [...window.matchAll(/[。！？；]|[.!?;](?=\s)/g)].at(-1)?.index ?? -1;
      if (paragraph >= floor) end = paragraph + 1;
      else if (sentence >= floor) end = sentence + 1;
      else carry = overlap;
    }
    const part = window.slice(0, end).trim();
    if (part) chunks.push(part);
    start += end - carry;
  }

  return chunks;
}

export function hashEmbedding(text: string, dimensions = 512): number[] {
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
