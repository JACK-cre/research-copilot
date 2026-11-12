import { describe, expect, it } from 'vitest';

import {
  buildChatRequestExtras,
  extractJsonText,
  formatChatProviderError,
  isForcedThinkingChatModel,
  isVisionChatModel,
  readChatMessageText,
} from '@/lib/chat-client';

describe('chat client helpers', () => {
  it('enables low-effort thinking only for GLM-5.3', () => {
    expect(isForcedThinkingChatModel('glm-5.3')).toBe(true);
    expect(isForcedThinkingChatModel('GLM-5.3-Flash')).toBe(true);
    expect(isForcedThinkingChatModel('glm-4.7-flash')).toBe(false);
    expect(buildChatRequestExtras('glm-5.3', 'https://open.bigmodel.cn/api/paas/v4')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    });
    expect(buildChatRequestExtras('deepseek-chat', 'https://api.deepseek.com')).toEqual({});
  });

  it('reads visible content and parses JSON without exposing reasoning', () => {
    expect(JSON.parse(extractJsonText('{"ok":true}'))).toEqual({ ok: true });
    expect(JSON.parse(extractJsonText('here is json\n```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    expect(readChatMessageText({ content: '  ', reasoning_content: '{"score":1}' })).toBe('');
    expect(readChatMessageText({ content: '最终回答', reasoning_content: 'private thought' })).toBe('最终回答');
    expect(readChatMessageText({ content: [{ text: '{"ok":true}' }] })).toBe('{"ok":true}');
  });

  it('recognizes glm-5.3-flash as a vision model', () => {
    expect(isVisionChatModel('glm-5.3-flash')).toBe(true);
    expect(isVisionChatModel('glm-5.3')).toBe(false);
  });

  it('redacts secrets in provider errors', () => {
    expect(formatChatProviderError(new Error('invalid key sk-abcdef0123456789'))).toContain('sk-***');
    expect(formatChatProviderError(new Error('Bearer abcdef'))).toContain('Bearer ***');
  });
});
