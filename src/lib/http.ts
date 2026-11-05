export const RESEARCH_USER_AGENT =
  'ResearchCopilot/0.1 (https://github.com/JACK-cre/research-copilot; academic research tool)';

export type HttpFailureKind = 'timeout' | 'network' | 'rate_limit' | 'http';

export class ExternalHttpError extends Error {
  readonly status?: number;
  readonly kind: HttpFailureKind;

  constructor(message: string, options: { status?: number; kind?: HttpFailureKind } = {}) {
    super(message);
    this.name = 'ExternalHttpError';
    this.status = options.status;
    this.kind = options.kind ?? 'http';
  }
}

export function describeHttpFailure(provider: string, error: unknown): string {
  const kind = error instanceof ExternalHttpError
    ? error.kind
    : classifyUnknownError(error);
  if (kind === 'timeout' || kind === 'network') {
    return `${provider} 在当前网络环境下超时或无法访问，已跳过。`;
  }
  if (kind === 'rate_limit') {
    return `${provider} 请求过于频繁或未配置 API Key，已跳过。`;
  }
  return `${provider} 暂时不可用。`;
}

function classifyUnknownError(error: unknown): HttpFailureKind {
  if (!error || typeof error !== 'object') return 'http';
  const name = 'name' in error ? String(error.name) : '';
  const message = 'message' in error ? String(error.message) : String(error);
  if (name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted/i.test(message)) return 'timeout';
  if (/fetch|network|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(message)) return 'network';
  if (/\b429\b|too many requests|quota/i.test(message)) return 'rate_limit';
  return 'http';
}

function normalizeFetchError(error: unknown): ExternalHttpError {
  if (error instanceof ExternalHttpError) return error;
  return new ExternalHttpError(
    error instanceof Error ? error.message : 'request failed',
    { kind: classifyUnknownError(error) },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchResponse(
  url: string | URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    retries?: number;
    accept?: string;
  } = {},
): Promise<Response> {
  const retries = options.retries ?? 1;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let lastError: ExternalHttpError | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Accept: options.accept ?? 'application/json',
          'User-Agent': RESEARCH_USER_AGENT,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429) {
        throw new ExternalHttpError(`${response.status}`, { status: 429, kind: 'rate_limit' });
      }
      if (!response.ok) {
        throw new ExternalHttpError(`HTTP ${response.status}`, {
          status: response.status,
          kind: 'http',
        });
      }
      return response;
    } catch (error) {
      lastError = normalizeFetchError(error);
      const retryable = lastError.kind === 'timeout'
        || lastError.kind === 'network'
        || lastError.kind === 'rate_limit'
        || (lastError.status ?? 0) >= 500;
      if (!retryable || attempt === retries) break;
      await sleep(400 * (attempt + 1));
    }
  }

  throw lastError ?? new ExternalHttpError('request failed');
}

export async function fetchJson<T>(
  url: string | URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    retries?: number;
  } = {},
): Promise<T> {
  const response = await fetchResponse(url, options);
  return await response.json() as T;
}

export async function fetchText(
  url: string | URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    retries?: number;
    accept?: string;
  } = {},
): Promise<string> {
  const response = await fetchResponse(url, {
    ...options,
    accept: options.accept ?? 'text/html, application/xhtml+xml, application/xml;q=0.9, text/plain;q=0.8, */*;q=0.1',
  });
  return await response.text();
}
