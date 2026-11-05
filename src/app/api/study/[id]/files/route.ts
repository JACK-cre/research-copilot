import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createStoredObjectDownload } from '@/lib/cloud-storage';
import { getStudyConversation } from '@/lib/repository';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const scope = await requireDataScope();
    const conversation = await getStudyConversation(scope, id);
    if (!conversation) return NextResponse.json({ error: '对话不存在。' }, { status: 404 });

    const storagePath = new URL(request.url).searchParams.get('path')?.trim() || '';
    const attachment = conversation.messages
      .flatMap((item) => item.attachments ?? [])
      .find((item) => item.storagePath === storagePath);
    if (!attachment) return NextResponse.json({ error: '图片不存在。' }, { status: 404 });

    const download = await createStoredObjectDownload(scope, attachment.storagePath);
    if (download.kind === 'redirect') return NextResponse.redirect(download.url);
    const body = download.bytes.buffer.slice(
      download.bytes.byteOffset,
      download.bytes.byteOffset + download.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '图片读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
