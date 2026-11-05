import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { refreshStudyMemory } from '@/lib/conversation-memory';
import { appendStudyTurn, getStudyConversation, getStudyMessages, listStudyConversations } from '@/lib/repository';
import { runStudyTurn } from '@/lib/study-agent';

export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(50000),
  useLibrary: z.boolean().default(false),
  useWeb: z.boolean().default(false),
});

export async function GET() {
  try {
    const scope = await requireDataScope();
    return NextResponse.json({ conversations: await listStudyConversations(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '对话列表读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json());
    const scope = await requireDataScope();
    const ai = await resolveAiRuntimeConfig(scope);
    const prior = input.conversationId ? await getStudyMessages(scope, input.conversationId) : [];
    const current = input.conversationId ? await getStudyConversation(scope, input.conversationId) : null;
    const assistant = await runStudyTurn({
      ai,
      scope,
      history: prior,
      message: input.message,
      useLibrary: input.useLibrary,
      useWeb: input.useWeb,
      memorySummary: current?.memorySummary,
    });
    const saved = await appendStudyTurn(scope, {
      conversationId: input.conversationId,
      userMessage: input.message,
      assistant,
    });
    const memorySummary = await refreshStudyMemory(scope, saved.conversationId, ai);
    return NextResponse.json({ ...saved, memorySummary });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : '对话失败。';
    const status = error instanceof z.ZodError ? 400 : apiErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
