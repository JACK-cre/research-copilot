export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  factor?: number;
  sleep?: (ms: number) => Promise<void>;
}

const FATAL_PATTERN = /401|403|402|余额|api.?key|unauthorized|authentication|invalid api|未知工具|请先在配置|未配置|查询过短|未启用|不支持的文件/i;

export function isRetryableToolError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (FATAL_PATTERN.test(message)) return false;
  if (/zod|too_big|无法解析 JSON|没有返回可解析/i.test(message)) return false;
  return true;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withExponentialRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const factor = options.factor ?? 2;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableToolError(error)) throw error;
      const jitter = Math.floor(Math.random() * 120);
      await sleep(Math.round(baseDelayMs * (factor ** attempt) + jitter));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('重试后仍然失败');
}
