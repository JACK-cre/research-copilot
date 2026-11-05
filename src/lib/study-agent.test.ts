import { beforeEach, describe, expect, it, vi } from 'vitest';

const createChatTextCompletion = vi.fn();
const createChatJsonCompletion = vi.fn();
const createChatVisionCompletion = vi.fn();
const callResearchTool = vi.fn();

vi.mock('@/lib/chat-client', () => ({
  createChatTextCompletion: (...args: unknown[]) => createChatTextCompletion(...args),
  createChatJsonCompletion: (...args: unknown[]) => createChatJsonCompletion(...args),
  createChatVisionCompletion: (...args: unknown[]) => createChatVisionCompletion(...args),
  isVisionChatModel: (model: string) => /flash|vl|gpt-4o|gemini/i.test(model),
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
    createChatVisionCompletion.mockReset();
    callResearchTool.mockReset();
  });

  it('answers with the chat model only when retrieval is off', async () => {
    createChatTextCompletion.mockResolvedValue('可以，这段话可以改得更顺。');
    const result = await runStudyTurn({
      ai,
      history: [{ id: '1', role: 'user', content: '你好', citations: [], toolTrace: [], attachments: [], createdAt: '2026-11-05T00:00:00.000Z' }],
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
      attachments: [],
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

  it('sends images to the vision model in free chat', async () => {
    createChatVisionCompletion.mockResolvedValue('图里是一张流程图');
    const result = await runStudyTurn({
      ai: { ...ai, chatModel: 'glm-5.3-flash' },
      history: [],
      message: '这是什么',
      useLibrary: false,
      useWeb: false,
      images: [{ name: 'flow.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,aaa' }],
    });
    expect(result.content).toContain('流程图');
    expect(createChatTextCompletion).not.toHaveBeenCalled();
    expect(createChatVisionCompletion).toHaveBeenCalledTimes(1);
    const request = createChatVisionCompletion.mock.calls[0][0] as { prompt: string; images: string[] };
    expect(request.prompt).toBe('这是什么');
    expect(request.images).toEqual(['data:image/png;base64,aaa']);
  });

  it('describes images before the tool loop', async () => {
    createChatVisionCompletion.mockResolvedValue('黑板上写着遵义会议');
    createChatJsonCompletion.mockResolvedValue({ type: 'final', content: '转折点是遵义会议。', citations: [] });
    const result = await runStudyTurn({
      ai: { ...ai, chatModel: 'glm-5.3-flash' },
      history: [],
      message: '结合知识库解释这张图',
      useLibrary: true,
      useWeb: false,
      images: [{ name: 'board.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,bbb' }],
    });
    expect(result.content).toContain('遵义会议');
    expect(createChatVisionCompletion).toHaveBeenCalledTimes(1);
    const user = (createChatJsonCompletion.mock.calls[0][0] as { user: string }).user;
    expect(user).toContain('识图结果');
    expect(user).toContain('board.png');
  });

  it('continues the tool loop when vision fails but text exists', async () => {
    createChatVisionCompletion.mockRejectedValue(new Error('vision down'));
    createChatJsonCompletion.mockResolvedValue({ type: 'final', content: '根据文字回答', citations: [] });
    const result = await runStudyTurn({
      ai: { ...ai, chatModel: 'glm-5.3-flash' },
      history: [],
      message: '结合文字',
      useLibrary: true,
      useWeb: false,
      images: [{ name: 'note.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,ccc' }],
    });
    expect(result.content).toBe('根据文字回答');
    const user = (createChatJsonCompletion.mock.calls[0][0] as { user: string }).user;
    expect(user).toContain('识图失败');
  });

  it('rejects images when the chat model cannot see them', async () => {
    await expect(runStudyTurn({
      ai,
      history: [],
      message: '请看这张图',
      useLibrary: false,
      useWeb: false,
      images: [{ name: 'x.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,ddd' }],
    })).rejects.toThrow(/不支持识图/);
    expect(createChatVisionCompletion).not.toHaveBeenCalled();
  });
});
