import { beforeEach, describe, expect, it, vi } from 'vitest';

const createChatTextCompletion = vi.fn();
const createChatJsonCompletion = vi.fn();
const callResearchTool = vi.fn();

vi.mock('@/lib/chat-client', () => ({
  createChatTextCompletion: (...args: unknown[]) => createChatTextCompletion(...args),
  createChatJsonCompletion: (...args: unknown[]) => createChatJsonCompletion(...args),
}));

vi.mock('@/mcp/client', () => ({
  callResearchTool: (...args: unknown[]) => callResearchTool(...args),
}));

import { isFreeChatMode, runStudyTurn } from '@/lib/study-agent';
import type { AiRuntimeConfig } from '@/types/platform';

const ai = {
  source: 'personal',
  apiKey: 'sk-test',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  chatModel: 'glm-5.3',
  embeddingBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
  embeddingModel: 'embedding-3',
  embeddingDimensions: 2048,
  embeddingIdentity: 'zhipu:embedding-3',
} satisfies AiRuntimeConfig;

describe('isFreeChatMode', () => {
  it('is true only when both retrieval switches are off', () => {
    expect(isFreeChatMode({ useLibrary: false, useWeb: false })).toBe(true);
    expect(isFreeChatMode({ useLibrary: true, useWeb: false })).toBe(false);
    expect(isFreeChatMode({ useLibrary: false, useWeb: true })).toBe(false);
  });
});

describe('runStudyTurn', () => {
  beforeEach(() => {
    createChatTextCompletion.mockReset();
    createChatJsonCompletion.mockReset();
    callResearchTool.mockReset();
  });

  it('answers with the chat model only when retrieval is off', async () => {
    createChatTextCompletion.mockResolvedValue('可以，这段话可以改得更顺。');
    const result = await runStudyTurn({
      ai,
      history: [{ id: '1', role: 'user', content: '你好', citations: [], toolTrace: [], createdAt: '2026-11-05T00:00:00.000Z' }],
      message: '帮我润色一句话',
      useLibrary: false,
      useWeb: false,
    });
    expect(result).toEqual({
      content: '可以，这段话可以改得更顺。',
      citations: [],
      toolTrace: [],
    });
    expect(createChatJsonCompletion).not.toHaveBeenCalled();
    expect(callResearchTool).not.toHaveBeenCalled();
    expect(createChatTextCompletion).toHaveBeenCalledTimes(1);
    const request = createChatTextCompletion.mock.calls[0][0] as { messages: Array<{ role: string; content: string }>; system: string };
    expect(request.system).toContain('不要检索知识库');
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: '帮我润色一句话' });
  });

  it('uses the JSON tool loop when knowledge search is enabled', async () => {
    createChatJsonCompletion.mockResolvedValue({ type: 'final', content: '根据讲义，转折点是遵义会议。', citations: [] });
    const result = await runStudyTurn({
      ai,
      history: [],
      message: '长征的转折点是什么',
      useLibrary: true,
      useWeb: false,
    });
    expect(result.content).toContain('遵义会议');
    expect(createChatTextCompletion).not.toHaveBeenCalled();
    expect(createChatJsonCompletion).toHaveBeenCalled();
  });

  it('sends summary plus the latest four turns to the chat model', async () => {
    createChatTextCompletion.mockResolvedValue('记得，你在写长征读后感。');
    const history = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      role: index % 2 ? 'assistant' as const : 'user' as const,
      content: `m${index}`,
      citations: [],
      toolTrace: [],
      createdAt: '2026-11-05T00:00:00.000Z',
    }));
    await runStudyTurn({
      ai,
      history,
      message: '还记得吗',
      useLibrary: false,
      useWeb: false,
      memorySummary: '用户在准备长征读后感',
    });
    const request = createChatTextCompletion.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      system: string;
    };
    expect(request.system).toContain('用户在准备长征读后感');
    expect(request.messages).toHaveLength(9);
    expect(request.messages[0]).toEqual({ role: 'user', content: 'm2' });
    expect(request.messages.at(-2)).toEqual({ role: 'assistant', content: 'm9' });
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: '还记得吗' });
  });

  it('stops the ReAct loop after six tool rounds', async () => {
    createChatJsonCompletion.mockResolvedValue({ type: 'tool', name: 'search_knowledge', arguments: { query: '长征' } });
    callResearchTool.mockResolvedValue([]);
    const result = await runStudyTurn({
      ai,
      history: [],
      message: '长征的转折点是什么',
      useLibrary: true,
      useWeb: false,
    });
    expect(createChatJsonCompletion).toHaveBeenCalledTimes(6);
    expect(callResearchTool).toHaveBeenCalled();
    expect(result.content).toContain('请把问题再具体一点');
  });
});
