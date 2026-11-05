import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { removeStoredObjects } from '@/lib/cloud-storage';
import { deleteStudyConversation, getStudyConversation } from '@/lib/repository';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const scope = await requireDataScope();
    const conversation = await getStudyConversation(scope, id);
    if (!conversation) return NextResponse.json({ error: '对话不存在。' }, { status: 404 });
    return NextResponse.json({
      messages: conversation.messages,
      memorySummary: conversation.memorySummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '对话读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const scope = await requireDataScope();
    const conversation = await getStudyConversation(scope, id);
    const keys = conversation?.messages.flatMap((item) => (item.attachments ?? []).map((file) => file.storagePath)) ?? [];
    await deleteStudyConversation(scope, id);
    if (keys.length) await removeStoredObjects(scope, keys).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '对话删除失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
