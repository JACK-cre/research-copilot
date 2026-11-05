import { createChatTextCompletion } from '@/lib/chat-client';
import { getStudyMemoryState, getStudyMessages, updateStudyMemory } from '@/lib/repository';
import { excerpt } from '@/lib/text';
import type { AiRuntimeConfig, DataScope, StudyMessage } from '@/types/platform';

export const RECENT_TURN_COUNT = 4;

export function splitConversationMemory(
  messages: StudyMessage[],
  recentTurns = RECENT_TURN_COUNT,
): { older: StudyMessage[]; recent: StudyMessage[] } {
  const keep = Math.max(1, recentTurns) * 2;
  if (messages.length <= keep) return { older: [], recent: messages };
  return {
    older: messages.slice(0, -keep),
    recent: messages.slice(-keep),
  };
}

export function formatMemoryTranscript(messages: StudyMessage[]): string {
  return messages
    .map((item) => {
      const names = (item.attachments ?? []).map((file) => file.name).filter(Boolean);
      const suffix = names.length ? ` [图片：${names.join('、')}]` : '';
      return `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content}${suffix}`;
    })
    .join('\n');
}

function fallbackSummary(previousSummary: string, dropped: StudyMessage[]): string {
  const snippets = dropped
    .map((item) => `${item.role === 'user' ? '用户' : '助手'}：${excerpt(item.content, 160)}`)
    .join('\n');
  return [previousSummary.trim(), snippets].filter(Boolean).join('\n').slice(0, 4000);
}

export async function compactConversationMemory(input: {
  ai: AiRuntimeConfig;
  previousSummary: string;
  dropped: StudyMessage[];
}): Promise<string> {
  if (!input.dropped.length) return input.previousSummary.trim();
  if (!input.ai.apiKey) return fallbackSummary(input.previousSummary, input.dropped);

  try {
    return (await createChatTextCompletion({
      ai: input.ai,
      system: '你负责压缩同一会话的长期记忆。只保留后续对话需要的事实、用户偏好、未完成事项和关键结论。用简洁中文写成一段摘要，不要写成对话记录，不要编造新信息。',
      messages: [{
        role: 'user',
        content: [
          input.previousSummary.trim() ? `已有摘要：\n${input.previousSummary.trim()}` : '尚无摘要。',
          '请把以下刚移出最近窗口的对话并入摘要：',
          formatMemoryTranscript(input.dropped),
        ].join('\n\n'),
      }],
      temperature: 0.2,
      maxTokens: 1200,
    })).trim();
  } catch {
    return fallbackSummary(input.previousSummary, input.dropped);
  }
}

export function buildChatMemoryPreamble(summary: string): string {
  const text = summary.trim();
  if (!text) return '';
  return `同一会话的长期记忆摘要（更早的原文已压缩，最近 ${RECENT_TURN_COUNT} 轮仍保留原文）：\n${text}`;
}

export async function refreshStudyMemory(
  scope: DataScope,
  conversationId: string,
  ai: AiRuntimeConfig,
): Promise<string> {
  const messages = await getStudyMessages(scope, conversationId);
  const state = await getStudyMemoryState(scope, conversationId);
  const { older } = splitConversationMemory(messages);
  if (older.length <= state.memorySummaryMessageCount) return state.memorySummary;
  const dropped = older.slice(state.memorySummaryMessageCount);
  const summary = await compactConversationMemory({
    ai,
    previousSummary: state.memorySummary,
    dropped,
  });
  await updateStudyMemory(scope, conversationId, summary, older.length);
  return summary;
}
