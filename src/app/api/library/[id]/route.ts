import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createStoredObjectDownload, removeStoredObjects } from '@/lib/cloud-storage';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const document = await getVectorStore().getDocument(id, scope);
    if (!document) return NextResponse.json({ error: '资料不存在。' }, { status: 404 });
    if (!document.storagePath) return NextResponse.json({ error: '该资料没有保存原始文件。' }, { status: 404 });
    const download = await createStoredObjectDownload(scope, document.storagePath);
    if (download.kind === 'redirect') return NextResponse.redirect(download.url);
    const body = download.bytes.buffer.slice(
      download.bytes.byteOffset,
      download.bytes.byteOffset + download.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': document.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '资料下载失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const document = await getVectorStore().deleteDocument(id, scope);
    if (!document) return NextResponse.json({ error: '资料不存在。' }, { status: 404 });
    let cleanupWarning: string | undefined;
    if (document.storagePath) {
      try {
        await removeStoredObjects(scope, [document.storagePath]);
      } catch (error) {
        console.error('Source file could not be removed after document deletion.', error);
        cleanupWarning = '资料索引已删除，但原始文件未能立即清理。';
      }
    }
    return NextResponse.json({ deleted: true, warning: cleanupWarning });
  } catch (error) {
    const message = error instanceof Error ? error.message : '资料删除失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
