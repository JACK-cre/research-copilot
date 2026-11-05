import { describe, expect, it } from 'vitest';

import { splitConversationMemory } from '@/lib/conversation-memory';
import type { StudyMessage } from '@/types/platform';

function msg(role: 'user' | 'assistant', index: number): StudyMessage {
  return {
    id: String(index),
    role,
    content: `${role}-${index}`,
    citations: [],
    toolTrace: [],
    attachments: [],
    createdAt: '2026-11-05T00:00:00.000Z',
  };
}

describe('conversation memory window', () => {
  it('keeps short threads intact', () => {
    const messages = [msg('user', 1), msg('assistant', 2)];
    expect(splitConversationMemory(messages)).toEqual({ older: [], recent: messages });
  });

  it('keeps the latest four turns and compresses the rest', () => {
    const messages = Array.from({ length: 12 }, (_, index) => msg(index % 2 ? 'assistant' : 'user', index + 1));
    const split = splitConversationMemory(messages);
    expect(split.recent).toHaveLength(8);
    expect(split.older).toHaveLength(4);
    expect(split.recent[0].content).toBe('user-5');
    expect(split.older.at(-1)?.content).toBe('assistant-4');
  });
});
