import OpenAI from 'openai';

import type { AiRuntimeConfig } from '@/types/platform';

type ChatAiConfig = Pick<AiRuntimeConfig, 'apiKey' | 'baseURL' | 'chatModel'>;

export interface ChatJsonRequest {
  ai: ChatAiConfig;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface ChatTextRequest {
  ai: ChatAiConfig;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

type ChatMessageLike = {
  content?: unknown;
  reasoning_content?: unknown;
  reasoningContent?: unknown;
};

const JSON_RETRY_PATTERN = /json_object|response_format|json mode|structured output|unsupported|空内容|截断|JSON|Unexpected token|模型没有返回/i;
const FATAL_AUTH_PATTERN = /401|403|402|余额|api.?key|unauthorized|authentication|invalid api/i;

export function isForcedThinkingChatModel(model: string): boolean {
  return /glm-5\.3/i.test(model.trim());
}

export function isVisionChatModel(model: string): boolean {
  const name = model.trim().toLowerCase();
  if (!name) return false;
  if (/deepseek|reasoner/.test(name)) return false;
  if (/^glm-5\.3$/.test(name)) return false;
  if (/^glm-4\.[0-9]+-flash$/.test(name)) return false;
  return /glm-5\.3-flash|glm-4\.6v|glm-4v|gpt-4o|gpt-4\.1|qwen[-.]?vl|qwen2\.5-vl|qwen3-vl|gemini/.test(name);
}

export function buildChatRequestExtras(model: string, _baseURL = ''): Record<string, unknown> {
  if (!isForcedThinkingChatModel(model)) return {};
  return {
    thinking: { type: 'enabled' },
    reasoning_effort: 'low',
  };
}

export function stringifyChatContent(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    }).join('').trim();
  }
  return '';
}

export function readChatMessageText(message: ChatMessageLike | undefined | null): string {
  if (!message) return '';
  return stringifyChatContent(message.content)
    || stringifyChatContent(message.reasoning_content)
    || stringifyChatContent(message.reasoningContent);
}

export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('模型返回了空内容。');
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  throw new Error('模型没有返回可解析的 JSON。');
}

export function formatChatProviderError(error: unknown): string {
  const raw = inspectProviderError(error).replace(/sk-[a-zA-Z0-9]+/g, 'sk-***').replace(/Bearer\s+\S+/gi, 'Bearer ***').trim();
  return (raw || '未知错误').slice(0, 400);
}

function inspectProviderError(error: unknown): string {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (error instanceof OpenAI.APIError) {
    const payload = error.error;
    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message.trim()) return record.message;
      const nested = record.error;
      if (nested && typeof nested === 'object' && typeof (nested as { message?: unknown }).message === 'string') {
        return (nested as { message: string }).message;
      }
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return '未知错误';
}

function isRetryableJsonModeError(error: unknown): boolean {
  const message = formatChatProviderError(error);
  if (FATAL_AUTH_PATTERN.test(message)) return false;
  return JSON_RETRY_PATTERN.test(message);
}

export async function createChatJsonCompletion(input: ChatJsonRequest): Promise<unknown> {
  if (!input.ai.apiKey) throw new Error('未配置对话模型 API Key。');

  const client = new OpenAI({
    apiKey: input.ai.apiKey,
    baseURL: input.ai.baseURL,
    timeout: input.timeoutMs ?? 150_000,
  });
  const extras = buildChatRequestExtras(input.ai.chatModel, input.ai.baseURL);
  const jsonMode = input.jsonMode !== false;
  const maxTokens = input.maxTokens
    ?? (isForcedThinkingChatModel(input.ai.chatModel) ? 12_288 : 8_192);
  const messages = [
    { role: 'system' as const, content: input.system },
    { role: 'user' as const, content: input.user },
  ];

  const requestOnce = async (useJson: boolean): Promise<unknown> => {
    const completion = await client.chat.completions.create({
      model: input.ai.chatModel,
      messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: maxTokens,
      ...(useJson ? { response_format: { type: 'json_object' as const } } : {}),
      ...extras,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const choice = completion.choices[0];
    const text = readChatMessageText(choice?.message as ChatMessageLike | undefined);
    if (!text) {
      throw new Error(choice?.finish_reason === 'length'
        ? '模型输出被截断，思考过程占用了全部生成额度。'
        : '模型返回了空内容。');
    }
    try {
      return JSON.parse(extractJsonText(text)) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'JSON 解析失败';
      throw new Error(`模型返回的 JSON 无法解析：${detail}`);
    }
  };

  const attempts = jsonMode ? [true, false] : [false];
  let lastError: unknown;
  for (const [index, useJson] of attempts.entries()) {
    try {
      return await requestOnce(useJson);
    } catch (error) {
      lastError = error;
      const canRetry = index < attempts.length - 1 && isRetryableJsonModeError(error);
      if (!canRetry) break;
    }
  }
  throw new Error(formatChatProviderError(lastError));
}

export async function createChatTextCompletion(input: ChatTextRequest): Promise<string> {
  if (!input.ai.apiKey) throw new Error('未配置对话模型 API Key。');
  if (!input.messages.length) throw new Error('对话内容不能为空。');

  const client = new OpenAI({
    apiKey: input.ai.apiKey,
    baseURL: input.ai.baseURL,
    timeout: input.timeoutMs ?? 150_000,
  });
  const extras = buildChatRequestExtras(input.ai.chatModel, input.ai.baseURL);
  const maxTokens = input.maxTokens
    ?? (isForcedThinkingChatModel(input.ai.chatModel) ? 8_192 : 4_096);

  try {
    const completion = await client.chat.completions.create({
      model: input.ai.chatModel,
      messages: [
        { role: 'system' as const, content: input.system },
        ...input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      temperature: input.temperature ?? 0.7,
      max_tokens: maxTokens,
      ...extras,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const choice = completion.choices[0];
    const text = readChatMessageText(choice?.message as ChatMessageLike | undefined);
    if (!text) {
      throw new Error(choice?.finish_reason === 'length'
        ? '模型输出被截断，思考过程占用了全部生成额度。'
        : '模型返回了空内容。');
    }
    return text;
  } catch (error) {
    throw new Error(formatChatProviderError(error));
  }
}


export async function* streamChatTextCompletion(input: ChatTextRequest): AsyncGenerator<string> {
  if (!input.ai.apiKey) throw new Error('未配置对话模型 API Key。');
  if (!input.messages.length) throw new Error('对话内容不能为空。');

  const client = new OpenAI({
    apiKey: input.ai.apiKey,
    baseURL: input.ai.baseURL,
    timeout: input.timeoutMs ?? 150_000,
  });
  const extras = buildChatRequestExtras(input.ai.chatModel, input.ai.baseURL);
  const maxTokens = input.maxTokens
    ?? (isForcedThinkingChatModel(input.ai.chatModel) ? 8_192 : 4_096);
  try {
    const stream = await client.chat.completions.create({
      model: input.ai.chatModel,
      messages: [
        { role: 'system' as const, content: input.system },
        ...input.messages.map((message) => ({ role: message.role, content: message.content })),
      ],
      temperature: input.temperature ?? 0.7,
      max_tokens: maxTokens,
      stream: true,
      ...extras,
    } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);
    for await (const chunk of stream) {
      const text = readChatMessageText(chunk.choices[0]?.delta as ChatMessageLike | undefined);
      if (text) yield text;
    }
  } catch (error) {
    throw new Error(formatChatProviderError(error));
  }
}

export interface ChatVisionRequest {
  ai: ChatAiConfig;
  system: string;
  prompt: string;
  images: string[];
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  timeoutMs?: number;
}

export async function createChatVisionCompletion(input: ChatVisionRequest): Promise<string> {
  if (!input.ai.apiKey) throw new Error('未配置对话模型 API Key。');
  if (!input.images.length) throw new Error('没有可识别的图片。');
  if (!isVisionChatModel(input.ai.chatModel)) {
    throw new Error('当前对话模型不支持识图。请改用 glm-5.3-flash（智谱原生多模态）。');
  }

  const client = new OpenAI({
    apiKey: input.ai.apiKey,
    baseURL: input.ai.baseURL,
    timeout: input.timeoutMs ?? 180_000,
  });
  const extras = buildChatRequestExtras(input.ai.chatModel, input.ai.baseURL);
  const maxTokens = input.maxTokens
    ?? (isForcedThinkingChatModel(input.ai.chatModel) ? 8_192 : 4_096);

  try {
    const completion = await client.chat.completions.create({
      model: input.ai.chatModel,
      messages: [
        { role: 'system', content: input.system },
        ...(input.history ?? []).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: input.prompt },
            ...input.images.map((url) => ({
              type: 'image_url' as const,
              image_url: { url },
            })),
          ],
        },
      ],
      temperature: 0,
      max_tokens: maxTokens,
      ...extras,
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const choice = completion.choices[0];
    const text = readChatMessageText(choice?.message as ChatMessageLike | undefined);
    if (!text) {
      throw new Error(choice?.finish_reason === 'length'
        ? '识图输出被截断，请减少图片数量或改发更小的图。'
        : '识图模型返回了空内容。');
    }
    return text;
  } catch (error) {
    throw new Error(formatChatProviderError(error));
  }
}
