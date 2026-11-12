import { randomUUID } from 'node:crypto';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { requireDataScope } from '@/lib/auth';
import { streamStudyAnswer } from '@/lib/study-agent';
import { appendStudyTurn, getStudyConversation, getStudyMessages } from '@/lib/repository';
import { refreshStudyMemory } from '@/lib/conversation-memory';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  try {
    const scope = await requireDataScope();
    const body = await request.json() as { conversationId?: string; message?: string };
    const message = (body.message ?? '').trim();
    if (!message) return Response.json({ error: '请输入内容。' }, { status: 400 });
    const ai = await resolveAiRuntimeConfig(scope);
    const conversationId = body.conversationId ?? randomUUID();
    const prior = body.conversationId ? await getStudyMessages(scope, body.conversationId) : [];
    const current = body.conversationId ? await getStudyConversation(scope, body.conversationId) : null;
    let full = '';
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamStudyAnswer({ ai, message, history: prior, memorySummary: current?.memorySummary })) {
            full += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`));
          }
          const assistant = { content: full.trim(), citations: [], toolTrace: [] };
          const saved = await appendStudyTurn(scope, { conversationId, userMessage: message, attachments: [], assistant });
          const memorySummary = await refreshStudyMemory(scope, saved.conversationId, ai);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', conversationId: saved.conversationId, messages: saved.messages, memorySummary })}\n\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : '流式回答失败' })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '流式回答失败' }, { status: 500 });
  }
}
